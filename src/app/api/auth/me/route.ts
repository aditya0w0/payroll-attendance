import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const current = await getCurrentUser(req);
  if (!current) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const { user } = current;
  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      name: user.employeeProfile?.fullName || user.username,
      employeeProfile: user.employeeProfile,
      deviceRegistration: user.deviceRegistration,
    },
  });
}
