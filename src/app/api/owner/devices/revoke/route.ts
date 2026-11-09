import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { executeRevokeDeviceAccess } from "@/lib/device-service";

export async function POST(req: Request) {
  const current = await getCurrentUser(req);
  if (!current || current.user.role !== "OWNER") {
    return NextResponse.json({ error: "Owner authorization required" }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { deviceId, userId, reason } = body;

    const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
    const ua = req.headers.get("user-agent") || "Owner Console";

    const result = await executeRevokeDeviceAccess({
      ownerUser: current.user,
      deviceId,
      userId,
      reason,
      ipAddress: ip,
      userAgent: ua,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to revoke device access" },
      { status: 400 }
    );
  }
}
