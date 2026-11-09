import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { executeRevokeDeviceAccess } from "@/lib/device-service";

const deviceActionSchema = z.object({
  action: z.enum([
    "APPROVE_UNLOCK",
    "REJECT_UNLOCK",
    "RESET_DEVICE",
    "APPROVE_REPLACEMENT",
    "REVOKE_ACCESS",
  ]),
  requestId: z.string().optional(),
  userId: z.string().optional(),
  deviceId: z.string().optional(),
  reason: z.string().optional(),
});

export async function GET(req: Request) {
  const current = await getCurrentUser(req);
  if (!current || current.user.role !== "OWNER") {
    return NextResponse.json({ error: "Owner authorization required" }, { status: 403 });
  }

  const [devices, unlockRequests] = await Promise.all([
    prisma.deviceRegistration.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            employeeProfile: {
              select: { fullName: true, employeeId: true },
            },
          },
        },
      },
      orderBy: { registeredAt: "desc" },
    }),
    prisma.deviceUnlockRequest.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            employeeProfile: {
              select: { fullName: true, employeeId: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return NextResponse.json({ devices, unlockRequests });
}

export async function POST(req: Request) {
  const current = await getCurrentUser(req);
  if (!current || current.user.role !== "OWNER") {
    return NextResponse.json({ error: "Owner authorization required" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const result = deviceActionSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ error: "Validation error", details: result.error.flatten() }, { status: 400 });
    }

    const { action, requestId, userId, deviceId, reason } = result.data;
    const now = new Date();

    // 1. APPROVE UNLOCK / REPLACEMENT REQUEST
    if (action === "APPROVE_UNLOCK" || action === "APPROVE_REPLACEMENT") {
      if (!requestId) return NextResponse.json({ error: "requestId is required" }, { status: 400 });

      const request = await prisma.deviceUnlockRequest.findUnique({
        where: { id: requestId },
        include: { user: { include: { employeeProfile: true } } },
      });

      if (!request || request.status !== "PENDING") {
        return NextResponse.json({ error: "Request not found or already processed" }, { status: 404 });
      }

      await prisma.$transaction(async (tx) => {
        // Concurrency Guard: Atomic update transition PENDING -> APPROVED
        const updateRes = await tx.deviceUnlockRequest.updateMany({
          where: { id: request.id, status: "PENDING" },
          data: {
            status: "APPROVED",
            resolvedAt: now,
            resolvedByUserId: current.user.id,
          },
        });

        if (updateRes.count === 0) {
          throw new Error("Concurrent modification detected: Request already processed");
        }

        // Revoke all active sessions on previous device
        await tx.session.deleteMany({
          where: { userId: request.userId },
        });

        // Revoke old device registration / WebAuthn passkey via atomic update
        await tx.deviceRegistration.updateMany({
          where: { userId: request.userId },
          data: {
            status: "REVOKED",
            isActive: false,
            credentialId: null,
            credentialPublicKey: null,
            counter: 0,
          },
        });
      });

      await recordAuditLog({
        actorId: current.user.id,
        actorRole: "OWNER",
        actorName: current.user.username,
        action: action === "APPROVE_REPLACEMENT" ? "DEVICE_REPLACEMENT_APPROVED" : "DEVICE_UNLOCK_APPROVED_BY_OWNER",
        targetEntity: "DEVICE_SECURITY",
        targetId: request.requestCode,
        previousValues: {
          boundDevice: request.previousDeviceName,
          previousAssuranceTier: request.previousAssuranceTier,
        },
        newValues: {
          approvedDevice: request.requestedDeviceName,
          employee: request.user.employeeProfile?.fullName || request.user.username,
          status: "TRANSITIONED_TO_RE_ENROLLMENT",
          reason: request.reason,
        },
        reason: reason || request.reason || "Owner authorized device replacement / unlock",
      });

      return NextResponse.json({
        success: true,
        message: "Device replacement approved! Old credential revoked and sessions invalidated. Employee is ready to enroll new passkey.",
      });
    }

    // 2. REJECT REQUEST
    if (action === "REJECT_UNLOCK") {
      if (!requestId) return NextResponse.json({ error: "requestId is required" }, { status: 400 });

      const request = await prisma.deviceUnlockRequest.findUnique({
        where: { id: requestId },
        include: { user: true },
      });

      if (!request || request.status !== "PENDING") {
        return NextResponse.json({ error: "Request not found or already processed" }, { status: 404 });
      }

      await prisma.deviceUnlockRequest.update({
        where: { id: requestId },
        data: {
          status: "REJECTED",
          resolvedAt: now,
          resolvedByUserId: current.user.id,
        },
      });

      await recordAuditLog({
        actorId: current.user.id,
        actorRole: "OWNER",
        actorName: current.user.username,
        action: "DEVICE_UNLOCK_REJECTED",
        targetEntity: "DEVICE_SECURITY",
        targetId: request.requestCode,
        reason: reason || "Owner rejected device unlock request",
      });

      return NextResponse.json({ success: true, message: "Request rejected." });
    }

    // 3. RESET DEVICE BINDING
    if (action === "RESET_DEVICE") {
      if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

      const targetUser = await prisma.user.findUnique({
        where: { id: userId },
        include: { employeeProfile: true, deviceRegistration: true },
      });

      if (!targetUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

      const prevDev = targetUser.deviceRegistration?.deviceName || "None";
      const prevTier = targetUser.deviceRegistration?.assuranceTier || "None";

      await prisma.$transaction(async (tx) => {
        // Revoke all active sessions immediately
        await tx.session.deleteMany({
          where: { userId },
        });
        await tx.deviceRegistration.updateMany({
          where: { userId },
          data: {
            status: "REVOKED",
            isActive: false,
            credentialId: null,
            credentialPublicKey: null,
            counter: 0,
          },
        });
        await tx.deviceUnlockRequest.updateMany({
          where: { userId, status: "PENDING" },
          data: { status: "EXPIRED" },
        });
      });

      await recordAuditLog({
        actorId: current.user.id,
        actorRole: "OWNER",
        actorName: current.user.username,
        action: "DEVICE_REGISTRATION_RESET_BY_OWNER",
        targetEntity: "DEVICE_SECURITY",
        targetId: userId,
        previousValues: { revokedDevice: prevDev, previousAssuranceTier: prevTier },
        newValues: { status: "UNBOUND_READY_FOR_NEXT_LOGIN" },
        reason: reason || "Owner reset single-device binding",
      });

      return NextResponse.json({
        success: true,
        message: `Device registration cleared for ${targetUser.employeeProfile?.fullName || targetUser.username}. Next login will register their new passkey.`,
      });
    }

    // 4. UNILATERALLY REVOKE ACCESS IMMEDIATELY
    if (action === "REVOKE_ACCESS") {
      const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
      const ua = req.headers.get("user-agent") || "Owner Console";

      const revokeResult = await executeRevokeDeviceAccess({
        ownerUser: current.user,
        deviceId,
        userId,
        reason,
        ipAddress: ip,
        userAgent: ua,
      });

      return NextResponse.json(revokeResult);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Device action failed" }, { status: 500 });
  }
}
