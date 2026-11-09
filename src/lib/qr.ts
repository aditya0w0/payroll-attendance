import crypto from "crypto";
import QRCode from "qrcode";
import { prisma } from "./db";
import { recordAuditLog } from "./audit";

export const QR_ROTATION_SECONDS = 15;

/**
 * Gets or creates the current active dynamic QR challenge token.
 * Tokens expire strictly 15 seconds after issuance, or immediately upon being scanned once.
 */
export async function getOrCreateActiveQRChallenge(): Promise<{
  token: string;
  expiresAt: Date;
  secondsRemaining: number;
  qrDataUrl: string;
  consumed: boolean;
  serverTime: string;
}> {
  const now = new Date();

  // Find currently active, unexpired, and unconsumed challenge
  const activeChallenge = await prisma.qRChallenge.findFirst({
    where: {
      isActive: true,
      consumedAt: null,
      expiresAt: {
        gt: now,
      },
    },
    orderBy: {
      issuedAt: "desc",
    },
  });

  if (activeChallenge) {
    const secondsRemaining = Math.max(
      0,
      Math.ceil((activeChallenge.expiresAt.getTime() - now.getTime()) / 1000)
    );
    const qrPayload = JSON.stringify({
      t: activeChallenge.token,
      exp: activeChallenge.expiresAt.getTime(),
    });
    const qrDataUrl = await QRCode.toDataURL(qrPayload, {
      margin: 2,
      width: 320,
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
    });

    return {
      token: activeChallenge.token,
      expiresAt: activeChallenge.expiresAt,
      secondsRemaining,
      qrDataUrl,
      consumed: false,
      serverTime: now.toISOString(),
    };
  }

  // Deactivate old or consumed challenges
  await prisma.qRChallenge.updateMany({
    where: {
      OR: [
        { expiresAt: { lte: now } },
        { consumedAt: { not: null } },
      ],
      isActive: true,
    },
    data: {
      isActive: false,
    },
  });

  // Issue new single-use, 15-second cryptographically random challenge
  const token = `qr_${crypto.randomBytes(24).toString("hex")}`;
  const expiresAt = new Date(now.getTime() + QR_ROTATION_SECONDS * 1000);

  const newChallenge = await prisma.qRChallenge.create({
    data: {
      token,
      issuedAt: now,
      expiresAt,
      isActive: true,
      consumedAt: null,
      consumedByUserId: null,
    },
  });

  const qrPayload = JSON.stringify({
    t: newChallenge.token,
    exp: newChallenge.expiresAt.getTime(),
  });
  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    margin: 2,
    width: 320,
    color: {
      dark: "#000000",
      light: "#ffffff",
    },
  });

  return {
    token: newChallenge.token,
    expiresAt: newChallenge.expiresAt,
    secondsRemaining: QR_ROTATION_SECONDS,
    qrDataUrl,
    consumed: false,
    serverTime: now.toISOString(),
  };
}

export interface QRValidationResult {
  valid: boolean;
  challengeId?: string;
  error?: string;
  code?: string;
  statusCode?: number;
  cheatingDetected?: boolean;
  cheatingType?: "FORGED_QR" | "REUSED_QR" | "EXPIRED_QR";
}

/**
 * Validates and atomically consumes a QR challenge token for an employee.
 * Strictly single-use: Once scanned by employee A, the token is burned immediately.
 * Employee B cannot reuse it. Any replay, expiration, or forgery is flagged to the Owner.
 */
export async function validateAndConsumeQRToken(
  token: string,
  userId: string,
  employeeName: string,
  ipAddress: string = "127.0.0.1",
  userAgent: string = "Unknown",
  options?: { isWithinGeofenceAndWifi?: boolean }
): Promise<QRValidationResult> {
  const now = new Date();

  // 1. Locate the challenge token in database
  const challenge = await prisma.qRChallenge.findUnique({
    where: { token },
  });

  // Check A: Token does not exist -> FORGERY ATTEMPT
  if (!challenge) {
    await recordAuditLog({
      actorId: userId,
      actorRole: "EMPLOYEE",
      actorName: employeeName,
      action: "CHEATING_ALERT_FORGED_QR",
      targetEntity: "ATTENDANCE_SECURITY",
      targetId: token.substring(0, 16),
      newValues: {
        attemptedToken: token,
        ipAddress,
        userAgent,
        incident: "Unrecognized / forged QR challenge string submitted",
      },
      ipAddress,
      userAgent,
      reason: "Security Alert: Employee attempted attendance punch using an invalid or forged QR token.",
    });

    return {
      valid: false,
      statusCode: 400,
      code: "FORGED_QR",
      cheatingDetected: true,
      cheatingType: "FORGED_QR",
      error: "Security Alert: Invalid or forged QR challenge token. This security incident has been flagged to the Owner.",
    };
  }

  // Check B: Token was ALREADY CONSUMED by another or same employee -> REPLAY / SHARING ATTEMPT
  if (challenge.consumedAt || challenge.consumedByUserId || !challenge.isActive) {
    const msSinceConsumed = challenge.consumedAt
      ? now.getTime() - new Date(challenge.consumedAt).getTime()
      : Infinity;

    // Grace queue differentiation: scanned within 4 seconds of being consumed with valid office location/wifi
    if (msSinceConsumed <= 4000 && (options?.isWithinGeofenceAndWifi ?? true)) {
      return {
        valid: false,
        statusCode: 409,
        code: "QR_QUEUE_ROTATING",
        error: "QR baru saja digunakan oleh karyawan di depan Anda. Silakan scan ulang QR baru di layar.",
        cheatingDetected: false,
      };
    }

    const consumedByUser = challenge.consumedByUserId
      ? await prisma.user.findUnique({
          where: { id: challenge.consumedByUserId },
          include: { employeeProfile: true },
        })
      : null;

    const consumedByName = consumedByUser?.employeeProfile?.fullName || consumedByUser?.username || "Another Employee";

    await recordAuditLog({
      actorId: userId,
      actorRole: "EMPLOYEE",
      actorName: employeeName,
      action: "CHEATING_ALERT_QR_SHARING_REUSE",
      targetEntity: "ATTENDANCE_SECURITY",
      targetId: challenge.id,
      newValues: {
        token: challenge.token,
        consumedBy: consumedByName,
        consumedAt: challenge.consumedAt?.toISOString(),
        attemptedBy: employeeName,
        incident: "Attempted to scan a consumed single-use QR code (suspected photo sharing or proxy attendance).",
      },
      ipAddress,
      userAgent,
      reason: `Security Alert: Employee attempted to scan a QR code already consumed by ${consumedByName}. Suspected photo sharing / proxy punch.`,
    });

    return {
      valid: false,
      statusCode: 409,
      code: "QR_ALREADY_USED",
      cheatingDetected: true,
      cheatingType: "REUSED_QR",
      error: `Security Alert: This QR code has already been scanned and consumed. Each QR code is single-use only. Token sharing has been flagged to the Owner.`,
    };
  }

  // Check C: Token is past its 15-second TTL -> EXPIRED SCAN ATTEMPT
  if (now > challenge.expiresAt) {
    const delaySeconds = Math.round((now.getTime() - challenge.expiresAt.getTime()) / 1000);

    await recordAuditLog({
      actorId: userId,
      actorRole: "EMPLOYEE",
      actorName: employeeName,
      action: "CHEATING_ALERT_EXPIRED_QR",
      targetEntity: "ATTENDANCE_SECURITY",
      targetId: challenge.id,
      newValues: {
        token: challenge.token,
        expiredDelaySeconds: delaySeconds,
        incident: "QR scan submitted after strict 15-second expiration window (suspected screenshot transmission).",
      },
      ipAddress,
      userAgent,
      reason: `Security Alert: QR token scanned ${delaySeconds}s past 15-second TTL window. Suspected photo transmission delay.`,
    });

    return {
      valid: false,
      cheatingDetected: true,
      cheatingType: "EXPIRED_QR",
      error: `QR code expired ${delaySeconds}s ago. Tokens strictly expire after 15 seconds. Please scan the live workplace terminal directly.`,
    };
  }

  // 2. Token is completely valid -> ATOMICALLY CONSUME & BURN IT VIA CONDITIONAL UPDATE
  const burnResult = await prisma.qRChallenge.updateMany({
    where: {
      id: challenge.id,
      isActive: true,
      consumedAt: null,
      expiresAt: { gt: now },
    },
    data: {
      consumedAt: now,
      consumedByUserId: userId,
      isActive: false, // Immediately burned
    },
  });

  if (burnResult.count === 0) {
    // Concurrency / Race Condition Defense: Another worker or scan consumed this token in the exact same sub-second
    await recordAuditLog({
      actorId: userId,
      actorRole: "EMPLOYEE",
      actorName: employeeName,
      action: "CHEATING_ALERT_QR_SHARING_REUSE",
      targetEntity: "ATTENDANCE_SECURITY",
      targetId: challenge.id,
      newValues: {
        token: challenge.token,
        attemptedBy: employeeName,
        incident: "Concurrent token consumption race condition blocked (attempted simultaneous reuse).",
      },
      ipAddress,
      userAgent,
      reason: "Security Alert: Concurrent token reuse race condition blocked.",
    });

    return {
      valid: false,
      cheatingDetected: true,
      cheatingType: "REUSED_QR",
      error: "Security Alert: This QR code has already been scanned and consumed. Each QR code is single-use only.",
    };
  }

  return {
    valid: true,
    challengeId: challenge.id,
  };
}
