import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { validateAndConsumeQRToken } from "@/lib/qr";
import {
  determineActiveShiftDate,
  computeShiftTimestamps,
  formatJakartaDateTime,
} from "@/lib/timezone";
import { calculateLateDeduction } from "@/lib/payroll";
import { recordAuditLog } from "@/lib/audit";

const scanSchema = z.object({
  token: z.string().min(1, "QR token is required"),
  deviceFingerprint: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const current = await getCurrentUser();
    if (!current) {
      return NextResponse.json({ error: "Unauthenticated. Please log in." }, { status: 401 });
    }

    const { user } = current;
    if (user.role !== "EMPLOYEE" || !user.employeeProfile) {
      return NextResponse.json({ error: "Only registered employees can scan for attendance." }, { status: 403 });
    }

    const body = await req.json();
    const parseRes = scanSchema.safeParse(body);
    if (!parseRes.success) {
      return NextResponse.json({ error: "Invalid scan payload" }, { status: 400 });
    }

    const { token, deviceFingerprint } = parseRes.data;
    const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
    const userAgent = req.headers.get("user-agent") || "Unknown Device";
    const employee = user.employeeProfile;

    // 1. Single-Device Security Verification & Cheating Flagging
    if (user.deviceRegistration && deviceFingerprint) {
      if (user.deviceRegistration.deviceFingerprint !== deviceFingerprint) {
        await recordAuditLog({
          actorId: user.id,
          actorRole: "EMPLOYEE",
          actorName: employee.fullName,
          action: "CHEATING_ALERT_DEVICE_MISMATCH",
          targetEntity: "ATTENDANCE_SECURITY",
          targetId: user.id,
          newValues: {
            registeredDevice: user.deviceRegistration.deviceName,
            registeredFingerprint: user.deviceRegistration.deviceFingerprint,
            attemptedFingerprint: deviceFingerprint,
            incident: "Attempted to scan attendance from an unauthorized, unapproved device terminal.",
          },
          ipAddress: ip,
          userAgent,
          reason: "Security Alert: Employee attempted to bypass device binding and punch from an unauthorized terminal.",
        });

        return NextResponse.json(
          {
            error: "DEVICE_MISMATCH",
            message: "Attendance scan rejected: You can only punch attendance from your registered authorized device. This security alert has been reported to the Owner.",
          },
          { status: 403 }
        );
      }
    }

    // 2. Validate & Atomically Consume Single-Use Dynamic QR Token
    const qrValidation = await validateAndConsumeQRToken(
      token,
      user.id,
      employee.fullName,
      ip,
      userAgent
    );

    if (!qrValidation.valid) {
      return NextResponse.json(
        {
          error: qrValidation.error,
          cheatingDetected: qrValidation.cheatingDetected,
          cheatingType: qrValidation.cheatingType,
        },
        { status: 400 }
      );
    }

    const shift = employee.shift;
    const now = new Date();

    // 3. Determine Authoritative Shift Date (handles overnight shifts)
    const shiftDate = determineActiveShiftDate(
      now,
      shift.startTime,
      shift.endTime,
      shift.isOvernight
    );

    const { scheduledStart, scheduledEnd } = computeShiftTimestamps(
      shiftDate,
      shift.startTime,
      shift.endTime,
      shift.isOvernight
    );

    // 4. Check for active attendance record for this shift session
    const existingRecord = await prisma.attendanceRecord.findUnique({
      where: {
        employeeId_shiftDate: {
          employeeId: employee.id,
          shiftDate,
        },
      },
    });

    // =========================================================================
    // CASE A: CHECK-OUT (Absen Pulang)
    // =========================================================================
    if (existingRecord) {
      if (existingRecord.status === "COMPLETED" || existingRecord.status === "LATE_COMPLETED") {
        return NextResponse.json(
          {
            error: `You have already completed your attendance for this shift (${shiftDate}). Clock-out recorded at ${formatJakartaDateTime(existingRecord.checkOutTime)}.`,
            completedPayslip: {
              shiftDate: existingRecord.shiftDate,
              shiftName: shift.name,
              dailySalary: existingRecord.dailySalarySnapshot,
              scheduledCheckIn: formatJakartaDateTime(existingRecord.scheduledStartTime),
              actualCheckIn: formatJakartaDateTime(existingRecord.checkInTime),
              scheduledCheckOut: formatJakartaDateTime(existingRecord.scheduledEndTime),
              actualCheckOut: formatJakartaDateTime(existingRecord.checkOutTime),
              lateDurationMinutes: existingRecord.lateMinutes,
              lateDeduction: existingRecord.lateDeduction,
              netDailyEarnings: existingRecord.netDailyEarnings,
              status: existingRecord.status,
            },
          },
          { status: 400 }
        );
      }

      // Finalize check-out
      const policyConfig = JSON.parse(existingRecord.deductionPolicySnapshot);
      const lateCalc = calculateLateDeduction(
        existingRecord.checkInTime,
        existingRecord.scheduledStartTime,
        existingRecord.dailySalarySnapshot,
        policyConfig,
        shift.gracePeriodMinutes
      );

      const finalStatus = lateCalc.isLate ? "LATE_COMPLETED" : "COMPLETED";

      const updatedRecord = await prisma.$transaction(async (tx) => {
        // Record scan log to prevent replay
        await tx.qRScanLog.create({
          data: {
            challengeId: qrValidation.challengeId!,
            userId: user.id,
            action: "CHECK_OUT",
            scannedAt: now,
          },
        });

        // Update attendance record
        return await tx.attendanceRecord.update({
          where: { id: existingRecord.id },
          data: {
            checkOutTime: now,
            status: finalStatus,
            lateMinutes: lateCalc.lateMinutes,
            lateDeduction: lateCalc.lateDeduction,
            netDailyEarnings: lateCalc.netDailyEarnings,
            checkOutDeviceFingerprint: deviceFingerprint || null,
          },
        });
      });

      // Audit Log for checkout
      await recordAuditLog({
        actorId: user.id,
        actorRole: "EMPLOYEE",
        actorName: employee.fullName,
        action: "ATTENDANCE_CHECK_OUT",
        targetEntity: "ATTENDANCE",
        targetId: updatedRecord.id,
        newValues: {
          employee: employee.fullName,
          shiftDate,
          checkOutTime: now.toISOString(),
          lateMinutes: lateCalc.lateMinutes,
          lateDeduction: lateCalc.lateDeduction,
          netDailyEarnings: lateCalc.netDailyEarnings,
          status: finalStatus,
        },
        ipAddress: ip,
        userAgent,
        reason: "Employee completed shift via dynamic workplace QR checkout",
      });

      // Return immediate transparent salary breakdown
      return NextResponse.json({
        success: true,
        action: "CHECK_OUT",
        message: "Check-out successful! Your daily earnings have been finalized.",
        payslip: {
          employeeName: employee.fullName,
          employeeId: employee.employeeId,
          shiftName: shift.name,
          shiftDate,
          dailySalary: updatedRecord.dailySalarySnapshot,
          scheduledCheckIn: formatJakartaDateTime(updatedRecord.scheduledStartTime),
          actualCheckIn: formatJakartaDateTime(updatedRecord.checkInTime),
          scheduledCheckOut: formatJakartaDateTime(updatedRecord.scheduledEndTime),
          actualCheckOut: formatJakartaDateTime(now),
          lateDurationMinutes: updatedRecord.lateMinutes,
          deductionPolicy: `${policyConfig.mode === "PER_HOUR" ? "Rp" + policyConfig.rate.toLocaleString() + "/hour" : "Rp" + policyConfig.rate.toLocaleString() + "/min"}`,
          lateDeduction: updatedRecord.lateDeduction,
          netDailyEarnings: updatedRecord.netDailyEarnings,
          status: finalStatus,
          policyDescription: lateCalc.policyDescription,
        },
      });
    }

    // =========================================================================
    // CASE B: CHECK-IN (Absen Masuk)
    // =========================================================================
    const policy = shift.deductionPolicy;
    const policyConfig = {
      mode: policy.mode,
      rate: policy.rate,
      hourlyRounding: policy.hourlyRounding,
      gracePeriodMinutes: policy.gracePeriodMinutes,
      maxDeductionPercent: policy.maxDeductionPercent,
    };

    const latePreview = calculateLateDeduction(
      now,
      scheduledStart,
      employee.dailySalary,
      policyConfig,
      shift.gracePeriodMinutes
    );

    const newRecord = await prisma.$transaction(async (tx) => {
      // Record scan log
      await tx.qRScanLog.create({
        data: {
          challengeId: qrValidation.challengeId!,
          userId: user.id,
          action: "CHECK_IN",
          scannedAt: now,
        },
      });

      // Create attendance record
      return await tx.attendanceRecord.create({
        data: {
          employeeId: employee.id,
          shiftId: shift.id,
          shiftDate,
          checkInTime: now,
          scheduledStartTime: scheduledStart,
          scheduledEndTime: scheduledEnd,
          status: "CHECKED_IN",
          lateMinutes: latePreview.lateMinutes,
          dailySalarySnapshot: employee.dailySalary,
          deductionPolicySnapshot: JSON.stringify(policyConfig),
          lateDeduction: latePreview.lateDeduction,
          netDailyEarnings: latePreview.netDailyEarnings,
          checkInDeviceFingerprint: deviceFingerprint || null,
        },
      });
    });

    // Audit Log for check-in
    await recordAuditLog({
      actorId: user.id,
      actorRole: "EMPLOYEE",
      actorName: employee.fullName,
      action: latePreview.isLate ? "ATTENDANCE_CHECK_IN_LATE" : "ATTENDANCE_CHECK_IN_ON_TIME",
      targetEntity: "ATTENDANCE",
      targetId: newRecord.id,
      newValues: {
        employee: employee.fullName,
        shiftDate,
        checkInTime: now.toISOString(),
        isLate: latePreview.isLate,
        lateMinutes: latePreview.lateMinutes,
        expectedDeduction: latePreview.lateDeduction,
      },
      ipAddress: ip,
      userAgent,
      reason: "Employee punched check-in via workplace dynamic QR",
    });

    return NextResponse.json({
      success: true,
      action: "CHECK_IN",
      message: latePreview.isLate
        ? `Check-in recorded! You arrived ${latePreview.lateMinutes} mins late. Applied deduction: -Rp${latePreview.lateDeduction.toLocaleString()}.`
        : "Check-in successful! You arrived on time. Have a great shift!",
      attendance: {
        id: newRecord.id,
        shiftName: shift.name,
        shiftDate,
        scheduledCheckIn: formatJakartaDateTime(scheduledStart),
        actualCheckIn: formatJakartaDateTime(now),
        scheduledCheckOut: formatJakartaDateTime(scheduledEnd),
        isLate: latePreview.isLate,
        lateMinutes: latePreview.lateMinutes,
        dailySalary: employee.dailySalary,
        pendingDeduction: latePreview.lateDeduction,
        expectedDailyEarnings: latePreview.netDailyEarnings,
        status: "CHECKED_IN",
      },
    });
  } catch (error: any) {
    console.error("QR Scan API error:", error);
    return NextResponse.json({ error: "Failed to process attendance scan: " + (error.message || "Server error") }, { status: 500 });
  }
}
