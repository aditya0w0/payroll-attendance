import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "./db";
import { recordAuditLog } from "./audit";

export const SESSION_COOKIE_NAME = "payroll_auth_token";
export const SESSION_TTL_DAYS = 7;

/**
 * Creates an authoritative server-side session and sets secure HTTP-only cookie.
 */
export async function createSession(userId: string, deviceFingerprint?: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      sessionToken: token,
      userId,
      deviceFingerprint: deviceFingerprint || null,
      expiresAt,
    },
  });

  const cookieStore = cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && process.env.SECURE_COOKIES === "true", // Enabled in production with HTTPS / SECURE_COOKIES=true, disabled for local development
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  return token;
}

/**
 * Retrieves currently authenticated user and active session from server-side cookies.
 */
export async function getCurrentUser() {
  try {
    const cookieStore = cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;

    const session = await prisma.session.findUnique({
      where: { sessionToken: token },
      include: {
        user: {
          include: {
            employeeProfile: {
              include: {
                shift: {
                  include: {
                    deductionPolicy: true,
                  },
                },
              },
            },
            deviceRegistration: true,
          },
        },
      },
    });

    if (!session || new Date() > session.expiresAt) {
      return null;
    }

    if (session.user.status !== "ACTIVE") {
      return null;
    }

    return {
      sessionToken: session.sessionToken,
      user: session.user,
      deviceFingerprint: session.deviceFingerprint,
    };
  } catch (error) {
    console.error("Error verifying current user session:", error);
    return null;
  }
}

/**
 * Destroys current session and clears the HTTP-only cookie.
 */
export async function destroySession(): Promise<boolean> {
  try {
    const cookieStore = cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (token) {
      await prisma.session.deleteMany({
        where: { sessionToken: token },
      });
      cookieStore.set(SESSION_COOKIE_NAME, "", {
        path: "/",
        maxAge: 0,
        httpOnly: true,
        sameSite: "lax",
      });
    }
    return true;
  } catch (error) {
    return false;
  }
}

export interface DevicePolicyResult {
  allowed: boolean;
  reason?: string;
  requestCode?: string;
  boundDeviceName?: string;
  attemptedDeviceName?: string;
}

/**
 * Enforces Single-Device Policy for Employee accounts.
 * If employee has no device, binds this device automatically.
 * If device does not match, blocks access and generates 5-minute single-use unlock challenge code.
 */
export async function enforceSingleDevicePolicy(
  user: any,
  deviceFingerprint: string,
  deviceName: string,
  publicKey: string | null = null,
  ipAddress: string = "127.0.0.1",
  userAgent: string = "Unknown"
): Promise<DevicePolicyResult> {
  // Owners have administrative multi-device access
  if (user.role === "OWNER") {
    return { allowed: true };
  }

  const existingDevice = user.deviceRegistration;

  // Case 1: First login on an unbound account -> Auto-bind device
  if (!existingDevice) {
    await prisma.deviceRegistration.create({
      data: {
        userId: user.id,
        deviceFingerprint,
        deviceName: deviceName || "Registered Mobile Terminal",
        publicKey: publicKey || null,
        platform: userAgent.includes("Mac") ? "macOS" : userAgent.includes("iPhone") ? "iOS" : userAgent.includes("Android") ? "Android" : "Web",
        isActive: true,
      },
    });

    await recordAuditLog({
      actorId: user.id,
      actorRole: "EMPLOYEE",
      actorName: user.employeeProfile?.fullName || user.username,
      action: "DEVICE_INITIAL_BINDING",
      targetEntity: "DEVICE_SECURITY",
      targetId: deviceFingerprint,
      newValues: { deviceName, deviceFingerprint },
      ipAddress,
      userAgent,
      reason: "Initial single-device binding established upon first login",
    });

    return { allowed: true };
  }

  // Case 2: Matching registered device
  if (existingDevice.deviceFingerprint === deviceFingerprint && existingDevice.isActive) {
    await prisma.deviceRegistration.update({
      where: { id: existingDevice.id },
      data: { lastSeenAt: new Date() },
    });
    return { allowed: true };
  }

  // Case 3: Device mismatch -> BLOCK ACCESS & GENERATE UNLOCK CHALLENGE
  // Check for existing pending request or generate a new 5-minute code
  const now = new Date();
  const existingReq = await prisma.deviceUnlockRequest.findFirst({
    where: {
      userId: user.id,
      requestedFingerprint: deviceFingerprint,
      status: "PENDING",
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
  });

  let requestCode = existingReq?.requestCode;
  if (!requestCode) {
    requestCode = `REQ-${Math.floor(10000 + Math.random() * 90000)}`;
    const unlockCode = `${Math.floor(100000 + Math.random() * 900000)}`; // 6-digit OTP
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // exactly 5 minutes

    await prisma.deviceUnlockRequest.create({
      data: {
        requestCode,
        unlockCode,
        userId: user.id,
        requestedFingerprint: deviceFingerprint,
        requestedDeviceName: deviceName,
        previousDeviceName: existingDevice.deviceName,
        status: "PENDING",
        ipAddress,
        userAgent,
        expiresAt,
      },
    });

    await recordAuditLog({
      actorId: user.id,
      actorRole: "EMPLOYEE",
      actorName: user.employeeProfile?.fullName || user.username,
      action: "DEVICE_LOGIN_BLOCKED",
      targetEntity: "DEVICE_SECURITY",
      targetId: requestCode,
      newValues: {
        requestCode,
        boundDevice: existingDevice.deviceName,
        attemptedDevice: deviceName,
        reason: "Single-device security policy violation: Unregistered device attempted login.",
      },
      ipAddress,
      userAgent,
      reason: "Single-device policy violation",
    });
  }

  return {
    allowed: false,
    reason: "DEVICE_NOT_AUTHORIZED",
    requestCode,
    boundDeviceName: existingDevice.deviceName,
    attemptedDeviceName: deviceName,
  };
}
