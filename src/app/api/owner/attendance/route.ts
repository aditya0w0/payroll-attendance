import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { calculateLateDeduction } from "@/lib/payroll";

const correctionSchema = z.object({
  recordId: z.string().min(1),
  checkInTime: z.string().optional(),
  checkOutTime: z.string().optional(),
  status: z.enum(["CHECKED_IN", "COMPLETED", "LATE_COMPLETED", "EXCEPTION"]).optional(),
  correctionReason: z.string().min(5, "Mandatory correction reason of at least 5 characters is required"),
});

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const current = await getCurrentUser(req);
  if (!current || current.user.role !== "OWNER") {
    return NextResponse.json({ error: "Owner authorization required" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const employeeId = searchParams.get("employeeId");
  const shiftDate = searchParams.get("shiftDate");
  const status = searchParams.get("status");

  const where: any = {};
  if (employeeId) where.employeeId = employeeId;
  if (shiftDate) where.shiftDate = shiftDate;
  if (status) where.status = status;

  const records = await prisma.attendanceRecord.findMany({
    where,
    include: {
      employee: {
        select: {
          fullName: true,
          employeeId: true,
          dailySalary: true,
        },
      },
      shift: {
        select: {
          name: true,
          startTime: true,
          endTime: true,
          gracePeriodMinutes: true,
        },
      },
    },
    orderBy: { checkInTime: "desc" },
    take: 100,
  });

  return NextResponse.json({ records });
}

export async function PATCH(req: NextRequest) {
  const current = await getCurrentUser(req);
  if (!current || current.user.role !== "OWNER") {
    return NextResponse.json({ error: "Owner authorization required" }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const result = correctionSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ error: "Validation error", details: result.error.flatten() }, { status: 400 });
    }

    const { recordId, checkInTime, checkOutTime, status, correctionReason } = result.data;

    const existing = await prisma.attendanceRecord.findUnique({
      where: { id: recordId },
      include: {
        employee: true,
        shift: { include: { deductionPolicy: true } },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Attendance record not found" }, { status: 404 });
    }

    const newCheckIn = checkInTime ? new Date(checkInTime) : existing.checkInTime;
    const newCheckOut = checkOutTime ? new Date(checkOutTime) : existing.checkOutTime;

    const policyConfig = JSON.parse(existing.deductionPolicySnapshot);
    const lateCalc = calculateLateDeduction(
      newCheckIn,
      existing.scheduledStartTime,
      existing.dailySalarySnapshot,
      policyConfig,
      existing.shift.gracePeriodMinutes
    );

    const previousValues = {
      checkInTime: existing.checkInTime,
      checkOutTime: existing.checkOutTime,
      status: existing.status,
      lateMinutes: existing.lateMinutes,
      lateDeduction: existing.lateDeduction,
      netDailyEarnings: existing.netDailyEarnings,
    };

    const updated = await prisma.attendanceRecord.update({
      where: { id: recordId },
      data: {
        checkInTime: newCheckIn,
        checkOutTime: newCheckOut,
        status: status || (lateCalc.isLate ? "LATE_COMPLETED" : "COMPLETED"),
        lateMinutes: lateCalc.lateMinutes,
        lateDeduction: lateCalc.lateDeduction,
        netDailyEarnings: lateCalc.netDailyEarnings,
        manualCorrectionNote: correctionReason,
        correctedByUserId: current.user.id,
      },
    });

    // Zero-Trust Audit Log
    await recordAuditLog({
      actorId: current.user.id,
      actorRole: "OWNER",
      actorName: current.user.username,
      action: "ATTENDANCE_MANUALLY_CORRECTED",
      targetEntity: "ATTENDANCE",
      targetId: recordId,
      previousValues,
      newValues: {
        checkInTime: newCheckIn,
        checkOutTime: newCheckOut,
        lateMinutes: lateCalc.lateMinutes,
        lateDeduction: lateCalc.lateDeduction,
        netDailyEarnings: lateCalc.netDailyEarnings,
        reason: correctionReason,
      },
      reason: correctionReason,
    });

    return NextResponse.json({
      success: true,
      message: "Attendance corrected and audit log recorded.",
      record: updated,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to correct attendance" }, { status: 500 });
  }
}
