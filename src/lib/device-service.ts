import { prisma } from "@/lib/db";
import { recordTransactionalAuditLog } from "@/lib/audit";
import { dispatchOutboxFlush } from "@/lib/audit-outbox";

/**
 * Reusable execution function to unilaterally revoke an employee device registration.
 * Atomically updates device status to REVOKED, deletes all active sessions,
 * expires pending unlock requests, and writes an Ed25519-signed audit record.
 */
export async function executeRevokeDeviceAccess({
  ownerUser,
  deviceId,
  userId,
  reason,
  ipAddress = "127.0.0.1",
  userAgent = "Owner Console",
}: {
  ownerUser: { id: string; username: string };
  deviceId?: string;
  userId?: string;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  if (!deviceId && !userId) {
    throw new Error("Target deviceId or userId is required");
  }

  // 1. Locate device registration
  const targetDevice = await prisma.deviceRegistration.findFirst({
    where: {
      OR: [
        ...(deviceId ? [{ id: deviceId }] : []),
        ...(userId ? [{ userId }] : []),
      ],
    },
    include: {
      user: {
        include: { employeeProfile: true },
      },
    },
  });

  if (!targetDevice) {
    throw new Error("Device registration not found for the specified target.");
  }

  const employeeName = targetDevice.user.employeeProfile?.fullName || targetDevice.user.username;
  const employeeId = targetDevice.user.employeeProfile?.employeeId || targetDevice.user.id;
  const targetUserId = targetDevice.userId;
  const prevDev = targetDevice.deviceName;
  const prevTier = targetDevice.assuranceTier;
  const prevStatus = targetDevice.status;
  const now = new Date();

  // 2. Atomic transaction: Update device to REVOKED, delete sessions, expire unlock requests, write audit log
  await prisma.$transaction(async (tx) => {
    // A. Update device status = 'REVOKED' and isActive = false
    await tx.deviceRegistration.update({
      where: { id: targetDevice.id },
      data: {
        status: "REVOKED",
        isActive: false,
      },
    });

    // B. Invalidate and delete all active sessions immediately
    await tx.session.deleteMany({
      where: { userId: targetUserId },
    });

    // C. Expire any pending unlock requests
    await tx.deviceUnlockRequest.updateMany({
      where: { userId: targetUserId, status: "PENDING" },
      data: { status: "EXPIRED" },
    });

    // D. Cryptographically linked, Ed25519-signed audit record
    await recordTransactionalAuditLog(tx, {
      actorId: ownerUser.id,
      actorRole: "OWNER",
      actorName: ownerUser.username,
      action: "DEVICE_ACCESS_REVOKED",
      targetEntity: "DEVICE_SECURITY",
      targetId: targetDevice.id,
      previousValues: {
        deviceId: targetDevice.id,
        deviceName: prevDev,
        assuranceTier: prevTier,
        status: prevStatus,
        isActive: targetDevice.isActive,
      },
      newValues: {
        deviceId: targetDevice.id,
        status: "REVOKED",
        isActive: false,
        employee: employeeName,
        employeeId,
        revokedBy: ownerUser.username,
        revokedAt: now.toISOString(),
      },
      ipAddress,
      userAgent,
      reason: reason || "Manually revoked by Owner",
    });
  });

  // Best-effort non-blocking dispatch to external sink
  dispatchOutboxFlush();

  return {
    success: true,
    message: "Akses perangkat berhasil dicabut",
    deviceId: targetDevice.id,
    userId: targetUserId,
    status: "REVOKED",
    employeeName,
  };
}
