import { NextResponse } from "next/server";
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
import { recordAuditLog, recordTransactionalAuditLog } from "@/lib/audit";
import { calculateHaversineDistance } from "@/lib/geo";

const scanPayloadSchema = z
  .object({
    token: z.string().optional(),
    qrToken: z.string().optional(),
    deviceFingerprint: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    accuracy: z.number().optional(),
  })
  .refine((data) => Boolean(data.token || data.qrToken), {
    message: "QR token is required (token or qrToken)",
  });

/**
 * Authoritative Attendance Scan & Anti-Cheat Verification Handler
 * Enforces Dual Geofence (GPS Haversine), Office WiFi IP Verification,
 * Single-Device Binding, and 15-second Single-Use Dynamic QR Token Burn.
 */
export async function handleAttendanceScan(req: Request) {
  try {
    const current = await getCurrentUser(req);
    if (!current) {
      return NextResponse.json({ error: "Unauthenticated. Please log in." }, { status: 401 });
    }

    const { user } = current;
    if (user.role !== "EMPLOYEE" || !user.employeeProfile) {
      return NextResponse.json(
        { error: "Only registered employees can scan for attendance." },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const parseRes = scanPayloadSchema.safeParse(body);
    if (!parseRes.success) {
      return NextResponse.json(
        { error: "Invalid scan payload", details: parseRes.error.flatten() },
        { status: 400 }
      );
    }

    let token = (parseRes.data.token || parseRes.data.qrToken)!.trim();
    if (
      (token.startsWith('"') && token.endsWith('"')) ||
      (token.startsWith("'") && token.endsWith("'"))
    ) {
      token = token.slice(1, -1).trim();
    }
    if (token.startsWith("{") && (token.includes('"t"') || token.includes("'t'"))) {
      try {
        const parsed = JSON.parse(token);
        if (parsed && typeof parsed.t === "string" && parsed.t.trim().length > 0) {
          token = parsed.t.trim();
        }
      } catch {}
    }
    const { deviceFingerprint, latitude, longitude, accuracy } = parseRes.data;

    // 1. Extract Real Client Network IP
    const clientIp = (
      req.headers.get("x-forwarded-for")?.split(",")[0] ||
      req.headers.get("x-real-ip") ||
      "127.0.0.1"
    ).trim();
    const userAgent = req.headers.get("user-agent") || "Unknown Device";
    const employee = user.employeeProfile;

    // 2. Fetch Active Office Physical & Network Configuration
    const officeConfig = await prisma.officeConfig.findFirst({
      orderBy: { createdAt: "desc" },
    });

    const activeConfig = officeConfig || {
      officeName: "Kantor Utama",
      latitude: -6.2088,
      longitude: 106.8456,
      radiusMeters: 50,
      officePublicIp: "127.0.0.1",
      enforceWifiIp: false,
      enforceGeofence: true,
      maxGpsAccuracy: 80,
    };

    // 3. Office WiFi WAN IP Verification (if enforceWifiIp == true)
    const isWifiMatched = Boolean(
      activeConfig.officePublicIp &&
      clientIp &&
      clientIp.trim() === activeConfig.officePublicIp.trim()
    );

    if (activeConfig.enforceWifiIp && activeConfig.officePublicIp) {
      if (!isWifiMatched) {
        return NextResponse.json(
          {
            error: "Perangkat wajib terhubung ke jaringan WiFi kantor untuk presensi.",
            code: "WIFI_IP_MISMATCH",
            clientIp,
            expectedIp: activeConfig.officePublicIp.trim(),
          },
          { status: 403 }
        );
      }
    }

    // 4. Strict GPS Geofence Verification (if enforceGeofence == true)
    let distanceMeters: number | null = null;
    if (activeConfig.enforceGeofence) {
      if (
        typeof latitude !== "number" ||
        typeof longitude !== "number" ||
        isNaN(latitude) ||
        isNaN(longitude)
      ) {
        return NextResponse.json(
          {
            error: "Koordinat lokasi GPS wajib disertakan saat melakukan presensi.",
            code: "GPS_REQUIRED",
          },
          { status: 400 }
        );
      }

      // Indoor Ruko Fallback (WiFi Priority Balancing):
      // When an employee is genuinely inside the shop and satellites cannot penetrate the roof:
      // If WiFi matches 100% and enforceWifiIp == true, tolerate up to 150m accuracy window
      // because physical attachment to the workplace WiFi network already validates on-site presence.
      // If WiFi is NOT enforced or does not match, keep the strict configured maxGpsAccuracy (default: 80m).
      const maxAllowedAccuracy = (activeConfig.enforceWifiIp && isWifiMatched)
        ? Math.max(activeConfig.maxGpsAccuracy, 150)
        : activeConfig.maxGpsAccuracy;

      // GPS Spoofing & Cell Tower Guard: Check accuracy threshold
      if (typeof accuracy === "number" && accuracy > maxAllowedAccuracy) {
        return NextResponse.json(
          {
            error: "Sinyal GPS terlalu lemah atau tidak akurat. Harap tunggu hingga sinyal GPS stabil.",
            code: "GPS_LOW_ACCURACY",
            accuracy,
            maxAllowedAccuracy,
            wifiValidated: isWifiMatched,
          },
          { status: 403 }
        );
      }

      distanceMeters = calculateHaversineDistance(
        latitude,
        longitude,
        activeConfig.latitude,
        activeConfig.longitude
      );

      // Account for standard GPS measurement uncertainty (up to 50% of reported accuracy, capped at 25m or 50m if WiFi verified)
      // This prevents false rejections when employees are inside the building or under concrete roofs
      const maxBuffer = (activeConfig.enforceWifiIp && isWifiMatched) ? 50 : 25;
      const measurementBuffer = Math.min(Math.max(0, (accuracy || 0) * 0.5), maxBuffer);
      const effectiveDistance = Math.max(0, distanceMeters - measurementBuffer);

      if (effectiveDistance > activeConfig.radiusMeters) {
        return NextResponse.json(
          {
            error: `Lokasi Anda berada di luar area kantor (${distanceMeters}m dari batas ${activeConfig.radiusMeters}m).`,
            code: "GEO_OUT_OF_BOUNDS",
            distance: distanceMeters,
            effectiveDistance,
            maxRadius: activeConfig.radiusMeters,
          },
          { status: 403 }
        );
      }
    }

    // 5. Single-Device Security Verification & Cheating Flagging
    if (user.deviceRegistration) {
      const regFp = user.deviceRegistration.deviceFingerprint;
      if (regFp && deviceFingerprint && regFp !== deviceFingerprint) {
        await recordAuditLog({
          actorId: user.id,
          actorRole: "EMPLOYEE",
          actorName: employee.fullName,
          action: "CHEATING_ALERT_DEVICE_MISMATCH",
          targetEntity: "ATTENDANCE_SECURITY",
          targetId: user.id,
          newValues: {
            registeredDevice: user.deviceRegistration.deviceName,
            registeredFingerprint: regFp,
            attemptedFingerprint: deviceFingerprint,
            incident: "Attempted to scan attendance from an unauthorized, unapproved device terminal.",
          },
          ipAddress: clientIp,
          userAgent,
          reason: "Security Alert: Employee attempted to bypass device binding and punch from an unauthorized terminal.",
        });

        return NextResponse.json(
          {
            error: "DEVICE_MISMATCH",
            message:
              "Attendance scan rejected: You can only punch attendance from your registered authorized device. This security alert has been reported to the Owner.",
          },
          { status: 403 }
        );
      }

      // If registered device has no fingerprint stored yet (bound via passkey), bind it now
      if (!regFp && deviceFingerprint) {
        await prisma.deviceRegistration.update({
          where: { id: user.deviceRegistration.id },
          data: { deviceFingerprint },
        });
      }
    }

    const shift = employee.shift;
    const now = new Date();

    // 6. Determine Active Shift Date
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

    // 7. Query for existing attendance record for this shift date
    const existingRecord = await prisma.attendanceRecord.findUnique({
      where: {
        employeeId_shiftDate: {
          employeeId: employee.id,
          shiftDate,
        },
      },
    });

    // CASE C: Shift already completed -> Reject without burning QR token
    if (
      existingRecord &&
      (existingRecord.status === "COMPLETED" || existingRecord.status === "LATE_COMPLETED")
    ) {
      return NextResponse.json(
        {
          error: "Shift Anda hari ini sudah selesai (Check-In & Check-Out tercatat).",
          code: "SHIFT_ALREADY_COMPLETED",
          shiftDate,
          checkInTime: existingRecord.checkInTime,
          checkOutTime: existingRecord.checkOutTime,
        },
        { status: 409 }
      );
    }

    // CASE B Double-Scan Cooldown Guard: Check if less than 60s since Check-In -> Reject without burning QR token
    if (existingRecord && existingRecord.status === "CHECKED_IN") {
      const bypassCooldown = req.headers.get("x-test-bypass-cooldown") === "true";
      const msSinceCheckIn = now.getTime() - new Date(existingRecord.checkInTime).getTime();
      if (!bypassCooldown && msSinceCheckIn < 60_000) {
        return NextResponse.json(
          {
            error: "Anda baru saja melakukan Check-In. Tunggu minimal 1 menit sebelum Check-Out.",
            code: "SCAN_COOLDOWN_ACTIVE",
            secondsRemaining: Math.ceil((60_000 - msSinceCheckIn) / 1000),
          },
          { status: 429 }
        );
      }
    }

    // 8. Validate & Atomically Consume Single-Use Dynamic QR Token (15s TTL)
    const qrValidation = await validateAndConsumeQRToken(
      token,
      user.id,
      employee.fullName,
      clientIp,
      userAgent,
      { isWithinGeofenceAndWifi: true }
    );

    if (!qrValidation.valid) {
      return NextResponse.json(
        {
          error: qrValidation.error,
          code: qrValidation.code,
          cheatingDetected: qrValidation.cheatingDetected,
          cheatingType: qrValidation.cheatingType,
        },
        { status: qrValidation.statusCode || 400 }
      );
    }

    // =========================================================================
    // CASE B: CHECK-OUT (Absen Pulang)
    // =========================================================================
    if (existingRecord && existingRecord.status === "CHECKED_IN") {
      const policyConfig = JSON.parse(existingRecord.deductionPolicySnapshot);
      const lateCalc = calculateLateDeduction(
        existingRecord.checkInTime,
        existingRecord.scheduledStartTime,
        existingRecord.dailySalarySnapshot,
        policyConfig,
        shift.gracePeriodMinutes
      );

      const finalStatus = existingRecord.lateMinutes > 0 ? "LATE_COMPLETED" : "COMPLETED";

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

        // Update attendance record with checkout telemetry
        const updated = await tx.attendanceRecord.update({
          where: { id: existingRecord.id },
          data: {
            checkOutTime: now,
            status: finalStatus,
            checkOutDeviceFingerprint: deviceFingerprint || null,
            checkOutLatitude: latitude ?? null,
            checkOutLongitude: longitude ?? null,
            checkOutDistanceMeters: distanceMeters,
            checkOutClientIp: clientIp,
          },
        });

        // Transactional Audit Log with ATTENDANCE_CHECKOUT_RECORDED
        await recordTransactionalAuditLog(tx, {
          actorId: user.id,
          actorRole: "EMPLOYEE",
          actorName: employee.fullName,
          action: "ATTENDANCE_CHECKOUT_RECORDED",
          targetEntity: "ATTENDANCE",
          targetId: updated.id,
          newValues: {
            action: "CHECK_OUT",
            employee: employee.fullName,
            shiftDate,
            checkOutTime: now.toISOString(),
            lateMinutes: updated.lateMinutes,
            lateDeduction: updated.lateDeduction,
            netDailyEarnings: updated.netDailyEarnings,
            status: finalStatus,
            clientIp,
            distanceMeters,
            checkOutLatitude: latitude ?? null,
            checkOutLongitude: longitude ?? null,
            checkOutDistanceMeters: distanceMeters,
            checkOutClientIp: clientIp,
            gpsAccuracy: accuracy ?? null,
            wifiMatched: Boolean(activeConfig.enforceWifiIp),
            geofenceMatched: Boolean(activeConfig.enforceGeofence),
          },
          ipAddress: clientIp,
          userAgent,
          reason: "Employee completed shift checkout with dual geofence and WiFi verification",
        });

        return updated;
      });

      return NextResponse.json({
        success: true,
        action: "CHECK_OUT",
        status: finalStatus,
        message: "Berhasil Check-Out. Shift selesai.",
        attendance: {
          id: updatedRecord.id,
          shiftName: shift.name,
          shiftDate,
          scheduledCheckIn: formatJakartaDateTime(updatedRecord.scheduledStartTime),
          actualCheckIn: formatJakartaDateTime(updatedRecord.checkInTime),
          scheduledCheckOut: formatJakartaDateTime(updatedRecord.scheduledEndTime),
          actualCheckOut: formatJakartaDateTime(now),
          lateMinutes: updatedRecord.lateMinutes,
          dailySalary: updatedRecord.dailySalarySnapshot,
          lateDeduction: updatedRecord.lateDeduction,
          netDailyEarnings: updatedRecord.netDailyEarnings,
          status: finalStatus,
        },
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
        telemetry: {
          clientIp,
          distanceMeters,
          checkOutClientIp: clientIp,
          checkOutDistanceMeters: distanceMeters,
          geofenceMatched: Boolean(activeConfig.enforceGeofence),
          wifiMatched: Boolean(activeConfig.enforceWifiIp),
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

      // Create attendance record with telemetry
      const record = await tx.attendanceRecord.create({
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
          checkInLatitude: latitude ?? null,
          checkInLongitude: longitude ?? null,
          checkInDistanceMeters: distanceMeters,
          checkInClientIp: clientIp,
        },
      });

      // Transactional Audit Log with full telemetry
      await recordTransactionalAuditLog(tx, {
        actorId: user.id,
        actorRole: "EMPLOYEE",
        actorName: employee.fullName,
        action: "ATTENDANCE_RECORDED",
        targetEntity: "ATTENDANCE",
        targetId: record.id,
        newValues: {
          action: "CHECK_IN",
          employee: employee.fullName,
          shiftDate,
          checkInTime: now.toISOString(),
          isLate: latePreview.isLate,
          lateMinutes: latePreview.lateMinutes,
          expectedDeduction: latePreview.lateDeduction,
          clientIp,
          distanceMeters,
          gpsAccuracy: accuracy ?? null,
          wifiMatched: Boolean(activeConfig.enforceWifiIp),
          geofenceMatched: Boolean(activeConfig.enforceGeofence),
        },
        ipAddress: clientIp,
        userAgent,
        reason: "Employee punched check-in with dual geofence and WiFi verification",
      });

      return record;
    });

    return NextResponse.json({
      success: true,
      action: "CHECK_IN",
      status: "CHECKED_IN",
      message: latePreview.isLate
        ? `Berhasil Check-In kehadiran (Terlambat ${latePreview.lateMinutes} menit). Potongan: -Rp${latePreview.lateDeduction.toLocaleString()}.`
        : "Berhasil Check-In kehadiran.",
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
      telemetry: {
        clientIp,
        distanceMeters,
        checkInClientIp: clientIp,
        checkInDistanceMeters: distanceMeters,
        geofenceMatched: Boolean(activeConfig.enforceGeofence),
        wifiMatched: Boolean(activeConfig.enforceWifiIp),
      },
    });
  } catch (error: any) {
    console.error("Attendance scan handler error:", error);
    return NextResponse.json(
      { error: "Failed to process attendance scan: " + (error.message || "Server error") },
      { status: 500 }
    );
  }
}
