import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const current = await getCurrentUser();
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
