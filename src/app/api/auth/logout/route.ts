import { NextResponse } from "next/server";
import { destroySession, getCurrentUser } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";

export async function POST() {
  const current = await getCurrentUser();
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
