import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";

const unlockSchema = z.object({
  requestCode: z.string().min(5, "Request ID (requestCode) is required to prevent IDOR attacks"),
  unlockCode: z.string().min(6).max(6, "Unlock code must be a 6-digit numeric string"),
  deviceFingerprint: z.string().min(1, "Device fingerprint is required"),
  deviceName: z.string().min(1, "Device name is required"),
});

// In-memory failed attempt counter for brute-force mitigation
const failedUnlockAttempts = new Map<string, { attempts: number; lastAttempt: number }>();
const MAX_UNLOCK_ATTEMPTS = 5;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = unlockSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { requestCode, unlockCode, deviceFingerprint, deviceName } = result.data;
    const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
    const userAgent = req.headers.get("user-agent") || "Unknown Device";
    const now = new Date();

    const normalizedReqCode = requestCode.trim();

    // Check brute-force attempts on this request code
    const tracker = failedUnlockAttempts.get(normalizedReqCode) || { attempts: 0, lastAttempt: 0 };
    if (tracker.attempts >= MAX_UNLOCK_ATTEMPTS) {
      // Invalidate the request in database to prevent further attacks
      await prisma.deviceUnlockRequest.updateMany({
        where: { requestCode: normalizedReqCode, status: "PENDING" },
        data: { status: "REJECTED" },
      });

      await recordAuditLog({
        actorRole: "SYSTEM",
        actorName: "Security Gateway",
        action: "CHEATING_ALERT_UNLOCK_BRUTEFORCE",
        targetEntity: "DEVICE_SECURITY",
        targetId: normalizedReqCode,
        newValues: {
          requestCode: normalizedReqCode,
          failedAttempts: tracker.attempts,
          ipAddress: ip,
          incident: "Excessive failed unlock attempts. Unlock request permanently locked.",
        },
        ipAddress: ip,
        userAgent,
        reason: "Security Alert: Brute-force attempt detected on device unlock challenge code.",
      });

      return NextResponse.json(
        {
          error: "Too many failed unlock attempts. This request code has been revoked for security. Please contact your Owner.",
        },
        { status: 429 }
      );
    }

    // 1. Locate the pending unlock request by requestCode strictly
    const unlockReq = await prisma.deviceUnlockRequest.findFirst({
      where: {
        requestCode: normalizedReqCode,
        status: "PENDING",
        expiresAt: { gt: now },
      },
      include: {
        user: {
          include: {
            employeeProfile: true,
            deviceRegistration: true,
          },
        },
      },
    });

    if (!unlockReq) {
      return NextResponse.json(
        { error: "Invalid, expired, or already used Request ID. Please request a new code from your Owner." },
        { status: 400 }
      );
    }

    // 2. Validate the 6-digit challenge code
    if (unlockReq.unlockCode !== unlockCode.trim()) {
      tracker.attempts += 1;
      tracker.lastAttempt = Date.now();
      failedUnlockAttempts.set(normalizedReqCode, tracker);

      await recordAuditLog({
        actorId: unlockReq.userId,
        actorRole: "EMPLOYEE",
        actorName: unlockReq.user.employeeProfile?.fullName || unlockReq.user.username,
        action: "DEVICE_UNLOCK_CODE_MISMATCH",
        targetEntity: "DEVICE_SECURITY",
        targetId: normalizedReqCode,
        newValues: {
          requestCode: normalizedReqCode,
          attemptCount: tracker.attempts,
          remainingAttempts: MAX_UNLOCK_ATTEMPTS - tracker.attempts,
        },
        ipAddress: ip,
        userAgent,
        reason: `Incorrect 6-digit unlock code attempt (${tracker.attempts}/${MAX_UNLOCK_ATTEMPTS})`,
      });

      return NextResponse.json(
        {
          error: `Incorrect unlock code. You have ${MAX_UNLOCK_ATTEMPTS - tracker.attempts} attempt(s) remaining.`,
          attemptsRemaining: MAX_UNLOCK_ATTEMPTS - tracker.attempts,
        },
        { status: 400 }
      );
    }

    // Reset failed counter upon successful match
    failedUnlockAttempts.delete(normalizedReqCode);

    const user = unlockReq.user;

    // 3. Transaction: Re-bind device to user, mark request as USED, and REVOKE ALL PREVIOUS SESSIONS
    await prisma.$transaction(async (tx) => {
      // Step A: Invalidate all existing sessions on previous/compromised devices
      await tx.session.deleteMany({
        where: { userId: user.id },
      });

      // Step B: Delete previous device registration
      await tx.deviceRegistration.deleteMany({
        where: { userId: user.id },
      });

      // Step C: Create new device registration
      await tx.deviceRegistration.create({
        data: {
          userId: user.id,
          deviceFingerprint,
          deviceName,
          platform: userAgent.includes("iPhone") ? "iOS" : userAgent.includes("Android") ? "Android" : "Web",
          isActive: true,
        },
      });

      // Step D: Mark request as USED
      await tx.deviceUnlockRequest.update({
        where: { id: unlockReq.id },
        data: {
          status: "USED",
          resolvedAt: now,
          resolvedByUserId: user.id,
        },
      });
    });

    // 4. Log Zero-Trust audit entry
    await recordAuditLog({
      actorId: user.id,
      actorRole: user.role,
      actorName: user.employeeProfile?.fullName || user.username,
      action: "DEVICE_UNLOCKED_AND_REBOUND",
      targetEntity: "DEVICE_SECURITY",
      targetId: unlockReq.requestCode,
      previousValues: { previousDevice: unlockReq.previousDeviceName },
      newValues: {
        newDeviceFingerprint: deviceFingerprint,
        newDeviceName: deviceName,
        requestCode: unlockReq.requestCode,
        sessionsRevoked: true,
      },
      ipAddress: ip,
      userAgent,
      reason: "Owner-issued one-time unlock code verified successfully; previous sessions revoked",
    });

    // 5. Establish fresh authoritative session for the newly bound device
    await createSession(user.id, deviceFingerprint);

    return NextResponse.json({
      success: true,
      message: "Device successfully verified and bound! Previous sessions revoked. Redirecting...",
      redirectUrl: "/employee",
    });
  } catch (error: any) {
    console.error("Unlock device API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
