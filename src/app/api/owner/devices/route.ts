import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";

const deviceActionSchema = z.object({
  action: z.enum(["APPROVE_UNLOCK", "REJECT_UNLOCK", "RESET_DEVICE"]),
  requestId: z.string().optional(),
  userId: z.string().optional(),
  reason: z.string().optional(),
});

export async function GET() {
  const current = await getCurrentUser();
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

export async function POST(req: NextRequest) {
  const current = await getCurrentUser();
  if (!current || current.user.role !== "OWNER") {
    return NextResponse.json({ error: "Owner authorization required" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const result = deviceActionSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ error: "Validation error", details: result.error.flatten() }, { status: 400 });
    }

    const { action, requestId, userId, reason } = result.data;
    const now = new Date();

    // 1. APPROVE UNLOCK REQUEST
    if (action === "APPROVE_UNLOCK") {
      if (!requestId) return NextResponse.json({ error: "requestId is required" }, { status: 400 });

      const request = await prisma.deviceUnlockRequest.findUnique({
        where: { id: requestId },
        include: { user: { include: { employeeProfile: true } } },
      });

      if (!request || request.status !== "PENDING") {
        return NextResponse.json({ error: "Request not found or already processed" }, { status: 404 });
      }

      await prisma.$transaction(async (tx) => {
        // Revoke all active sessions on previous device
        await tx.session.deleteMany({
          where: { userId: request.userId },
        });

        // Revoke old device
        await tx.deviceRegistration.deleteMany({
          where: { userId: request.userId },
        });

        // Register new requested device
        await tx.deviceRegistration.create({
          data: {
            userId: request.userId,
            deviceFingerprint: request.requestedFingerprint,
            deviceName: request.requestedDeviceName,
            platform: "Authorized via Owner Approval",
            isActive: true,
          },
        });

        // Mark request as APPROVED
        await tx.deviceUnlockRequest.update({
          where: { id: request.id },
          data: {
            status: "APPROVED",
            resolvedAt: now,
            resolvedByUserId: current.user.id,
          },
        });
      });

      await recordAuditLog({
        actorId: current.user.id,
        actorRole: "OWNER",
        actorName: current.user.username,
        action: "DEVICE_UNLOCK_APPROVED_BY_OWNER",
        targetEntity: "DEVICE_SECURITY",
        targetId: request.requestCode,
        previousValues: { boundDevice: request.previousDeviceName },
        newValues: {
          approvedDevice: request.requestedDeviceName,
          employee: request.user.employeeProfile?.fullName || request.user.username,
        },
        reason: reason || "Owner manually authorized device switch",
      });

      return NextResponse.json({ success: true, message: "Device successfully authorized and bound!" });
    }

    // 2. RESET DEVICE BINDING
    if (action === "RESET_DEVICE") {
      if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

      const targetUser = await prisma.user.findUnique({
        where: { id: userId },
        include: { employeeProfile: true, deviceRegistration: true },
      });

      if (!targetUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

      const prevDev = targetUser.deviceRegistration?.deviceName || "None";

      await prisma.$transaction(async (tx) => {
        // Revoke all active sessions immediately
        await tx.session.deleteMany({
          where: { userId },
        });
        await tx.deviceRegistration.deleteMany({
          where: { userId },
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
        previousValues: { revokedDevice: prevDev },
        newValues: { status: "UNBOUND_READY_FOR_NEXT_LOGIN" },
        reason: reason || "Owner reset single-device binding",
      });

      return NextResponse.json({
        success: true,
        message: `Device registration cleared for ${targetUser.employeeProfile?.fullName || targetUser.username}. Next login will register their new device.`,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Device action failed" }, { status: 500 });
  }
}
