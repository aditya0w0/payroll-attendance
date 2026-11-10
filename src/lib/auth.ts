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

  // Fetch user role to determine session policy
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  // Strict Enterprise Single-Device Security for Employees:
  // 1. Single Active Session Enforcement: Invalidate all other active sessions for this employee
  // 2. Strict Session Expiration: 24 hours for employee mobile terminals (7 days for Owner workstation)
  const isEmployee = user?.role === "EMPLOYEE";
  const ttlMs = isEmployee ? 24 * 60 * 60 * 1000 : SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + ttlMs);

  if (isEmployee) {
    await prisma.session.deleteMany({
      where: { userId },
    });
  }

  await prisma.session.create({
    data: {
      sessionToken: token,
      userId,
      deviceFingerprint: deviceFingerprint || null,
      expiresAt,
    },
  });

  try {
    const cookieStore = cookies();
    cookieStore.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" && process.env.SECURE_COOKIES !== "false",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
  } catch (cookieErr: any) {
    if (cookieErr?.digest === "DYNAMIC_SERVER_USAGE") {
      throw cookieErr;
    }
    // Outside request scope (e.g. standalone test execution)
  }

  return token;
}

/**
 * Retrieves currently authenticated user and active session from server-side cookies or request headers.
 */
export async function getCurrentUser(req?: Request) {
  try {
    let token: string | undefined;

    // 1. Try extracting token from Request headers if provided
    if (req) {
      const cookieHeader = req.headers.get("cookie");
      if (cookieHeader) {
        const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`));
        if (match) {
          token = decodeURIComponent(match[1]);
        }
      }
      if (!token) {
        const authHeader = req.headers.get("authorization");
        if (authHeader && authHeader.startsWith("Bearer ")) {
          token = authHeader.substring(7).trim();
        }
      }
    }

    // 2. Fall back to Next.js cookies() store
    if (!token) {
      try {
        const cookieStore = cookies();
        token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
      } catch (cookieErr: any) {
        if (cookieErr?.digest === "DYNAMIC_SERVER_USAGE") {
          throw cookieErr;
        }
        // If outside request scope (e.g. testing), return null
        if (!req) return null;
      }
    }

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

    // Strict Employee Security Enforcement:
    // If user is EMPLOYEE and has a registered device that has been revoked or deactivated by Owner,
    // terminate the session immediately!
    if (session.user.role === "EMPLOYEE") {
      if (session.user.deviceRegistration && !session.user.deviceRegistration.isActive) {
        await prisma.session.deleteMany({ where: { sessionToken: token } });
        return null;
      }
    }

    return {
      sessionToken: session.sessionToken,
      user: session.user,
      deviceFingerprint: session.deviceFingerprint,
    };
  } catch (error: any) {
    if (error?.digest === "DYNAMIC_SERVER_USAGE") {
      throw error;
    }
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
  mustBindDevice?: boolean;
  reason?: string;
  requestCode?: string;
  boundDeviceName?: string;
  attemptedDeviceName?: string;
  requiresWebAuthn?: boolean;
  assuranceTier?: string;
}

/**
 * Enforces Single-Device Policy for Employee accounts.
 * Primary: WebAuthn / FIDO2 Passkey Credential
 * Secondary: Device Fingerprint telemetry
 * Zero-Lockout Recovery: If browser storage is cleared, prompts WebAuthn rather than HTTP 423 lockout!
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

  // Case 1: Unbound account -> Strict physical passkey device enrollment required (No auto-assignment)
  if (!existingDevice || !existingDevice.isActive) {
    return {
      allowed: false,
      mustBindDevice: true,
      reason: "FIRST_TIME_DEVICE_BINDING_REQUIRED",
    };
  }

  // Case 2: Account has registered WebAuthn Passkey
  if (existingDevice.credentialId && existingDevice.isActive) {
    // If deviceFingerprint matches secondary telemetry, allow direct session
    if (existingDevice.deviceFingerprint === deviceFingerprint) {
      await prisma.deviceRegistration.update({
        where: { id: existingDevice.id },
        data: { lastSeenAt: new Date() },
      });
      return { allowed: true };
    }

    // Zero-Lockout Recovery: Browser storage / IndexedDB was wiped, or fingerprint changed!
    // Trigger biometric WebAuthn verification instead of HTTP 423 quarantine!
    return {
      allowed: false,
      reason: "WEBAUTHN_REQUIRED",
      requiresWebAuthn: true,
      boundDeviceName: existingDevice.deviceName,
      assuranceTier: existingDevice.assuranceTier,
    };
  }

  // Case 3: Matching legacy registered device
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
