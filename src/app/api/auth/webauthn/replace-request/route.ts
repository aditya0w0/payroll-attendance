import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { recordAuditLog } from "@/lib/audit";

const failedReplaceAttempts = new Map<string, { attempts: number; lockoutUntil: number }>();
const MAX_REPLACE_FAILURES = 5;
const REPLACE_LOCKOUT_MS = 5 * 60 * 1000;
const MAX_TRACKER_ENTRIES = 1000;

const replaceSchema = z.object({
  identifier: z.string().min(1, "Identifier is required"),
  password: z.string().min(1, "Password is required"),
  reason: z.string().min(5, "Please provide a reason of at least 5 characters (e.g. Lost phone, new phone purchase)"),
  newDeviceName: z.string().optional().default("New Replacement Device"),
  deviceFingerprint: z.string().optional().default("replacement_terminal"),
});

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
    }
    const result = replaceSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: "Validation error", details: result.error.flatten() }, { status: 400 });
    }

    const { identifier, password, reason, newDeviceName, deviceFingerprint } = result.data;
    const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
    const userAgent = req.headers.get("user-agent") || "Unknown Device";

    const cleanId = identifier.trim().toLowerCase();
    const rateLimitKey = `${ip}:${cleanId}`;
    const nowMs = Date.now();
    const failureRec = failedReplaceAttempts.get(rateLimitKey);
    if (failureRec && failureRec.lockoutUntil > nowMs) {
      const waitSeconds = Math.ceil((failureRec.lockoutUntil - nowMs) / 1000);
      return NextResponse.json(
        { error: `Too many failed attempts. Please retry in ${waitSeconds}s.` },
        { status: 429 }
      );
    }

    const recordFailure = () => {
      if (failedReplaceAttempts.size >= MAX_TRACKER_ENTRIES) {
        const oldest = failedReplaceAttempts.keys().next().value;
        if (oldest !== undefined) failedReplaceAttempts.delete(oldest);
      }
      const nextAttempts = (failureRec?.attempts || 0) + 1;
      const lockoutUntil = nextAttempts >= MAX_REPLACE_FAILURES ? nowMs + REPLACE_LOCKOUT_MS : 0;
      failedReplaceAttempts.set(rateLimitKey, { attempts: nextAttempts, lockoutUntil });
    };

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: cleanId },
          { username: cleanId },
          { employeeProfile: { employeeId: identifier.trim() } },
        ],
      },
      include: {
        employeeProfile: true,
        deviceRegistration: true,
      },
    });

    if (!user) {
      recordFailure();
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Authenticate password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      recordFailure();
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    failedReplaceAttempts.delete(rateLimitKey);

    // Compute heuristic risk score (0-100)
    let riskScore = 10;
    if (!user.deviceRegistration) riskScore += 20;
    if (userAgent.includes("Linux") && !userAgent.includes("Android")) riskScore += 30;

    const requestCode = `REQ-REP-${crypto.randomInt(10000, 100000)}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours for replacement request

    const replacementReq = await prisma.deviceUnlockRequest.create({
      data: {
        requestCode,
        unlockCode: "REPLACE",
        userId: user.id,
        requestedFingerprint: deviceFingerprint,
        requestedDeviceName: newDeviceName,
        previousDeviceName: user.deviceRegistration?.deviceName || "None",
        previousAssuranceTier: user.deviceRegistration?.assuranceTier || "LEGACY_FINGERPRINT",
        riskScore,
        reason,
        status: "PENDING",
        ipAddress: ip,
        userAgent,
        expiresAt,
      },
    });

    await recordAuditLog({
      actorId: user.id,
      actorRole: user.role,
      actorName: user.employeeProfile?.fullName || user.username,
      action: "DEVICE_REPLACEMENT_REQUESTED",
      targetEntity: "DEVICE_SECURITY",
      targetId: requestCode,
      newValues: {
        requestCode,
        reason,
        previousDevice: user.deviceRegistration?.deviceName,
        previousAssuranceTier: user.deviceRegistration?.assuranceTier,
        newDeviceName,
        riskScore,
      },
      ipAddress: ip,
      userAgent,
      reason: `Employee submitted replacement request: ${reason}`,
    });

    return NextResponse.json({
      success: true,
      message: "Device replacement request submitted to Owner for review.",
      requestCode,
    });
  } catch (error: any) {
    console.error("Replacement request error:", error);
    return NextResponse.json({ error: "Failed to submit replacement request" }, { status: 500 });
  }
}
