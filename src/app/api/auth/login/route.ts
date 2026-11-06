import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession, enforceSingleDevicePolicy } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";

const loginSchema = z.object({
  identifier: z.string().min(1, "Email or username is required"),
  password: z.string().min(1, "Password is required"),
  deviceFingerprint: z.string().optional().default("browser_terminal_default"),
  deviceName: z.string().optional().default("Web Browser"),
  publicKey: z.string().optional().nullable(),
});

// In-memory rate limiting map for login attempts (IP + identifier)
const failedLoginAttempts = new Map<string, { attempts: number; lockoutUntil: number }>();
const MAX_LOGIN_FAILURES = 10;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes lockout

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = loginSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { identifier, password, deviceFingerprint, deviceName, publicKey } = result.data;
    const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
    const userAgent = req.headers.get("user-agent") || "Unknown Device";
    const rateLimitKey = `${ip}:${identifier.toLowerCase()}`;
    const nowMs = Date.now();

    // Check rate limit status
    const failureRecord = failedLoginAttempts.get(rateLimitKey);
    if (failureRecord && failureRecord.lockoutUntil > nowMs) {
      const waitSeconds = Math.ceil((failureRecord.lockoutUntil - nowMs) / 1000);
      return NextResponse.json(
        {
          error: `Too many failed login attempts. Account temporarily throttled for security. Please retry in ${waitSeconds}s.`,
        },
        { status: 429 }
      );
    }

    // 1. Find user by email or username
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: identifier.toLowerCase() }, { username: identifier.toLowerCase() }],
      },
      include: {
        employeeProfile: true,
        deviceRegistration: true,
      },
    });

    if (!user) {
      const currentFailures = (failureRecord?.attempts || 0) + 1;
      const lockoutUntil = currentFailures >= MAX_LOGIN_FAILURES ? nowMs + LOCKOUT_DURATION_MS : 0;
      failedLoginAttempts.set(rateLimitKey, { attempts: currentFailures, lockoutUntil });

      return NextResponse.json(
        { error: "Invalid credentials. Please check your username/email and password." },
        { status: 401 }
      );
    }

    // 2. Validate password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      const currentFailures = (failureRecord?.attempts || 0) + 1;
      const lockoutUntil = currentFailures >= MAX_LOGIN_FAILURES ? nowMs + LOCKOUT_DURATION_MS : 0;
      failedLoginAttempts.set(rateLimitKey, { attempts: currentFailures, lockoutUntil });

      await recordAuditLog({
        actorId: user.id,
        actorRole: user.role,
        actorName: user.employeeProfile?.fullName || user.username,
        action: "AUTH_LOGIN_FAILED_PASSWORD",
        targetEntity: "USER",
        targetId: user.id,
        ipAddress: ip,
        userAgent,
        reason: `Incorrect password attempt (${currentFailures}/${MAX_LOGIN_FAILURES})`,
      });

      return NextResponse.json(
        { error: "Invalid credentials. Please check your username/email and password." },
        { status: 401 }
      );
    }

    // Reset login failures on success
    failedLoginAttempts.delete(rateLimitKey);

    if (user.status !== "ACTIVE") {
      return NextResponse.json(
        { error: `Account is ${user.status.toLowerCase()}. Please contact the system administrator.` },
        { status: 403 }
      );
    }

    // 3. Enforce Single-Device Policy for Employee accounts
    const deviceCheck = await enforceSingleDevicePolicy(
      user,
      deviceFingerprint,
      deviceName,
      publicKey,
      ip,
      userAgent
    );

    if (!deviceCheck.allowed) {
      return NextResponse.json(
        {
          error: "DEVICE_NOT_AUTHORIZED",
          message: "Access Denied: This account is locked to a single authorized device.",
          requestCode: deviceCheck.requestCode,
          boundDeviceName: deviceCheck.boundDeviceName,
          attemptedDeviceName: deviceCheck.attemptedDeviceName,
        },
        { status: 423 } // 423 Locked
      );
    }

    // 4. Create authoritative server session
    await createSession(user.id, deviceFingerprint);

    await recordAuditLog({
      actorId: user.id,
      actorRole: user.role,
      actorName: user.employeeProfile?.fullName || user.username,
      action: "AUTH_LOGIN_SUCCESS",
      targetEntity: "SESSION",
      targetId: user.id,
      newValues: { deviceFingerprint, deviceName },
      ipAddress: ip,
      userAgent,
      reason: "Successful login session established",
    });

    return NextResponse.json({
      success: true,
      role: user.role,
      redirectUrl: user.role === "OWNER" ? "/owner" : "/employee",
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        name: user.employeeProfile?.fullName || user.username,
      },
    });
  } catch (error: any) {
    console.error("Login API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
