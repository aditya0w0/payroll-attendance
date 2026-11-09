import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  getDateRangeList,
  computeAttendanceAnalytics,
} from "@/lib/attendance-analytics";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const current = await getCurrentUser();
    if (!current || current.user.role !== "OWNER") {
      return NextResponse.json(
        { error: "Unauthorized. Owner administrative privileges required." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") || "7d";
    const employeeId = searchParams.get("employeeId") || undefined;

    const targetDates = getDateRangeList(range);

    const [employees, attendanceRecords] = await Promise.all([
      prisma.employeeProfile.findMany({
        where: {
          user: { status: "ACTIVE" },
          ...(employeeId ? { id: employeeId } : {}),
        },
        include: {
          shift: true,
        },
      }),
      prisma.attendanceRecord.findMany({
        where: {
          shiftDate: { in: targetDates },
          ...(employeeId ? { employeeId } : {}),
        },
        orderBy: {
          checkInTime: "desc",
        },
      }),
    ]);

    const analytics = computeAttendanceAnalytics({
      range,
      employees,
      attendanceRecords,
      targetDates,
    });

    return NextResponse.json({
      success: true,
      ...analytics,
    });
  } catch (error: any) {
    console.error("Attendance analytics API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to compute attendance analytics" },
      { status: 500 }
    );
  }
}
