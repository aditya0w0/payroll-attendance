import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const current = await getCurrentUser();
  if (!current || current.user.role !== "EMPLOYEE" || !current.user.employeeProfile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const employee = current.user.employeeProfile;

  const records = await prisma.attendanceRecord.findMany({
    where: { employeeId: employee.id },
    include: {
      shift: {
        select: { name: true, startTime: true, endTime: true },
      },
    },
    orderBy: { checkInTime: "desc" },
    take: 60,
  });

  const totalEarned = records.reduce((sum, r) => sum + r.netDailyEarnings, 0);
  const totalDeducted = records.reduce((sum, r) => sum + r.lateDeduction, 0);
  const totalDays = records.filter((r) => r.status === "COMPLETED" || r.status === "LATE_COMPLETED").length;

  return NextResponse.json({
    summary: {
      totalCompletedDays: totalDays,
      totalEarned,
      totalDeducted,
    },
    records,
  });
}
