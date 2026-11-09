import { NextResponse } from "next/server";
import { destroySession, getCurrentUser } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const current = await getCurrentUser(req);
  if (current) {
    await recordAuditLog({
      actorId: current.user.id,
      actorRole: current.user.role,
      actorName: current.user.employeeProfile?.fullName || current.user.username,
      action: "AUTH_LOGOUT",
      targetEntity: "SESSION",
      targetId: current.user.id,
      reason: "User logged out safely",
    });
  }
  await destroySession();
  return NextResponse.json({ success: true, message: "Logged out successfully" });
}
