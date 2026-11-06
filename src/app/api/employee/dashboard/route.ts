import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  determineActiveShiftDate,
  computeShiftTimestamps,
  formatJakartaDateTime,
} from "@/lib/timezone";

export const dynamic = "force-dynamic";

export async function GET() {
  const current = await getCurrentUser();
  if (!current || current.user.role !== "EMPLOYEE" || !current.user.employeeProfile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const employee = current.user.employeeProfile;
  const shift = employee.shift;
  const now = new Date();

  // Determine active shift date
  const shiftDate = determineActiveShiftDate(
    now,
    shift.startTime,
    shift.endTime,
    shift.isOvernight
  );

  const { scheduledStart, scheduledEnd } = computeShiftTimestamps(
    shiftDate,
    shift.startTime,
    shift.endTime,
    shift.isOvernight
  );

  // Find attendance for this active shift session
  const activeRecord = await prisma.attendanceRecord.findUnique({
    where: {
      employeeId_shiftDate: {
        employeeId: employee.id,
        shiftDate,
      },
    },
  });

  let attendanceState: "NOT_CHECKED_IN" | "CHECKED_IN" | "COMPLETED" = "NOT_CHECKED_IN";
  if (activeRecord) {
    if (activeRecord.status === "COMPLETED" || activeRecord.status === "LATE_COMPLETED") {
      attendanceState = "COMPLETED";
    } else {
      attendanceState = "CHECKED_IN";
    }
  }

  // Find latest completed payslip (either today's or most recent completed)
  const latestCompleted = await prisma.attendanceRecord.findFirst({
    where: {
      employeeId: employee.id,
      status: { in: ["COMPLETED", "LATE_COMPLETED"] },
    },
    include: { shift: true },
    orderBy: { checkOutTime: "desc" },
  });

  return NextResponse.json({
    employee: {
      id: employee.id,
      fullName: employee.fullName,
      employeeId: employee.employeeId,
      dailySalary: employee.dailySalary,
      shift: {
        id: shift.id,
        name: shift.name,
        startTime: shift.startTime,
        endTime: shift.endTime,
        isOvernight: shift.isOvernight,
        gracePeriodMinutes: shift.gracePeriodMinutes,
        policy: shift.deductionPolicy,
      },
      device: current.user.deviceRegistration,
    },
    today: {
      shiftDate,
      scheduledStart: formatJakartaDateTime(scheduledStart),
      scheduledEnd: formatJakartaDateTime(scheduledEnd),
      state: attendanceState,
      activeRecord: activeRecord
        ? {
            id: activeRecord.id,
            checkInTime: formatJakartaDateTime(activeRecord.checkInTime),
            checkOutTime: formatJakartaDateTime(activeRecord.checkOutTime),
            status: activeRecord.status,
            lateMinutes: activeRecord.lateMinutes,
            lateDeduction: activeRecord.lateDeduction,
            netDailyEarnings: activeRecord.netDailyEarnings,
            dailySalarySnapshot: activeRecord.dailySalarySnapshot,
          }
        : null,
    },
    latestCompletedPayslip: latestCompleted
      ? {
          shiftDate: latestCompleted.shiftDate,
          shiftName: latestCompleted.shift.name,
          dailySalary: latestCompleted.dailySalarySnapshot,
          scheduledCheckIn: formatJakartaDateTime(latestCompleted.scheduledStartTime),
          actualCheckIn: formatJakartaDateTime(latestCompleted.checkInTime),
          scheduledCheckOut: formatJakartaDateTime(latestCompleted.scheduledEndTime),
          actualCheckOut: formatJakartaDateTime(latestCompleted.checkOutTime),
          lateDurationMinutes: latestCompleted.lateMinutes,
          lateDeduction: latestCompleted.lateDeduction,
          netDailyEarnings: latestCompleted.netDailyEarnings,
          status: latestCompleted.status,
        }
      : null,
  });
}
