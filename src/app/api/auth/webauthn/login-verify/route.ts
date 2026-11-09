import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { verifyPasskeyAuthentication } from "@/lib/webauthn";

const verifySchema = z.object({
  userId: z.string().optional(),
  identifier: z.string().optional(),
  response: z.any().optional(),
  deviceFingerprint: z.string().optional(),
  deviceName: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const parseRes = verifySchema.safeParse(body);
    if (!parseRes.success) {
      return NextResponse.json({ error: "Invalid verification payload" }, { status: 400 });
    }

    const { userId, identifier, deviceFingerprint } = parseRes.data;

    // Accept either nested response or direct assertion object
    const response = (parseRes.data.response?.id && parseRes.data.response?.rawId)
      ? parseRes.data.response
      : (body.id && body.rawId && body.response)
      ? body
      : parseRes.data.response;

    if (!response) {
      return NextResponse.json({ error: "Missing WebAuthn assertion response" }, { status: 400 });
    }

    if (!userId && !identifier) {
      return NextResponse.json({ error: "userId or identifier is required" }, { status: 400 });
    }

    const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
    const userAgent = req.headers.get("user-agent") || "Unknown Device";
    const hostHeader = req.headers.get("host");

    const user = userId
      ? await prisma.user.findUnique({
          where: { id: userId },
          include: {
            employeeProfile: true,
            deviceRegistration: true,
          },
        })
      : identifier
      ? await prisma.user.findFirst({
          where: {
            OR: [
              { email: identifier.trim().toLowerCase() },
              { username: identifier.trim().toLowerCase() },
              { employeeProfile: { employeeId: identifier.trim() } },
            ],
          },
          include: {
            employeeProfile: true,
            deviceRegistration: true,
          },
        })
      : null;

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.status !== "ACTIVE") {
      return NextResponse.json(
        { error: `Account is ${user.status.toLowerCase()}. Please contact the administrator.` },
        { status: 403 }
      );
    }

    // Verify Passkey Assertion
    const verification = await verifyPasskeyAuthentication(
      user,
      response,
      hostHeader,
      ip,
      userAgent
    );

    // Update secondary telemetry fingerprint if provided
    if (deviceFingerprint && verification.device.deviceFingerprint !== deviceFingerprint) {
      await prisma.deviceRegistration.update({
        where: { id: verification.device.id },
        data: { deviceFingerprint },
      });
    }

    // Issue authoritative session
    await createSession(user.id, deviceFingerprint || verification.device.deviceFingerprint || "webauthn_passkey");

    // Record Zero-Trust Audit Log
    await recordAuditLog({
      actorId: user.id,
      actorRole: user.role,
      actorName: user.employeeProfile?.fullName || user.username,
      action: "AUTH_WEBAUTHN_SUCCESS",
      targetEntity: "SESSION",
      targetId: user.id,
      newValues: {
        assuranceTier: verification.device.assuranceTier,
        counter: verification.device.counter,
        deviceName: verification.device.deviceName,
        zeroLockoutRecovery: true,
      },
      ipAddress: ip,
      userAgent,
      reason: "Successful biometric Passkey authentication & zero-lockout state rehydration",
    });

    return NextResponse.json({
      success: true,
      message: "Passkey verified successfully! Session established.",
      role: user.role,
      redirectUrl: user.role === "OWNER" ? "/owner" : "/employee",
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        name: user.employeeProfile?.fullName || user.username,
        assuranceTier: verification.device.assuranceTier,
      },
    });
  } catch (error: any) {
    console.error("WebAuthn login verify error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to verify passkey authentication" },
      { status: 400 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "Method Not Allowed. Use POST to verify WebAuthn login assertion." },
    { status: 405 }
  );
}
