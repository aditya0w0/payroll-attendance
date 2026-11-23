import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { triggerBackgroundFlush } from "@/lib/audit-outbox";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const current = await getCurrentUser(req);
  if (!current || current.user.role !== "OWNER") {
    return NextResponse.json({ error: "Owner authorization required" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const now = new Date();
  const year = parseInt(searchParams.get("year") || `${now.getFullYear()}`, 10);
  const month = parseInt(searchParams.get("month") || `${now.getMonth() + 1}`, 10);

  if (isNaN(year) || year < 2000 || year > 2100 || isNaN(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "Invalid year or month parameter" }, { status: 400 });
  }

  const monthStr = `${year}-${String(month).padStart(2, "0")}`;

  // Check if finalized period snapshot exists
  const existingPeriod = await prisma.payrollPeriod.findUnique({
    where: { year_month: { year, month } },
    include: {
      records: {
        include: {
          employee: {
            select: { fullName: true, employeeId: true },
          },
        },
      },
    },
  });

  // Fetch current live aggregation for the month
  const employees = await prisma.employeeProfile.findMany({
    include: {
      attendanceRecords: {
        where: {
          shiftDate: { startsWith: monthStr },
          status: { in: ["COMPLETED", "LATE_COMPLETED"] },
        },
      },
    },
    orderBy: { fullName: "asc" },
  });

  const liveSummaries = employees.map((emp) => {
    const completedDays = emp.attendanceRecords.length;
    const totalLateMinutes = emp.attendanceRecords.reduce((sum, r) => sum + r.lateMinutes, 0);
    const lateArrivalCount = emp.attendanceRecords.filter((r) => r.lateMinutes > 0).length;
    const totalLateDeductions = emp.attendanceRecords.reduce((sum, r) => sum + r.lateDeduction, 0);
    const grossEarnings = emp.attendanceRecords.reduce((sum, r) => sum + r.dailySalarySnapshot, 0);
    const netEarnings = emp.attendanceRecords.reduce((sum, r) => sum + r.netDailyEarnings, 0);

    return {
      employeeId: emp.id,
      code: emp.employeeId,
      fullName: emp.fullName,
      dailySalary: emp.dailySalary,
      completedDays,
      totalLateMinutes,
      lateArrivalCount,
      totalLateDeductions,
      grossEarnings,
      netEarnings,
      records: emp.attendanceRecords,
    };
  });

  let summaries = liveSummaries;

  // If period is finalized, authoritative report MUST come from immutable PayrollRecord snapshots
  if (existingPeriod?.status === "FINALIZED" && existingPeriod.records.length > 0) {
    summaries = existingPeriod.records.map((rec) => {
      return {
        employeeId: rec.employeeId,
        code: rec.employee.employeeId,
        fullName: rec.employee.fullName,
        dailySalary: rec.dailySalary, // Frozen snapshot rate
        completedDays: rec.completedDays,
        totalLateMinutes: rec.totalLateMinutes,
        lateArrivalCount: rec.lateArrivalCount,
        totalLateDeductions: rec.totalLateDeductions,
        grossEarnings: rec.grossEarnings,
        netEarnings: rec.netEarnings,
        records: [],
      };
    });
  }

  return NextResponse.json({
    year,
    month,
    monthStr,
    isFinalized: existingPeriod?.status === "FINALIZED",
    finalizedAt: existingPeriod?.finalizedAt,
    summaries,
    finalizedRecords: existingPeriod?.records,
  });
}

// Finalize Payroll Period
export async function POST(req: NextRequest) {
  const current = await getCurrentUser(req);
  if (!current || current.user.role !== "OWNER") {
    return NextResponse.json({ error: "Owner authorization required" }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || body.year === undefined || body.month === undefined) {
      return NextResponse.json({ error: "Year and month are required" }, { status: 400 });
    }
    const year = Number(body.year);
    const month = Number(body.month);

    if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: "Invalid year or month value" }, { status: 400 });
    }

    const monthStr = `${year}-${String(month).padStart(2, "0")}`;
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59));
    const now = new Date();

    // Immutability Guard: Prevent overwriting an already FINALIZED payroll period
    const existingPeriod = await prisma.payrollPeriod.findUnique({
      where: { year_month: { year, month } },
    });

    if (existingPeriod?.status === "FINALIZED") {
      return NextResponse.json(
        { error: `Payroll periode ${monthStr} sudah difinalisasi dan terkunci permanen.` },
        { status: 409 }
      );
    }

    const employees = await prisma.employeeProfile.findMany({
      include: {
        attendanceRecords: {
          where: {
            shiftDate: { startsWith: monthStr },
            status: { in: ["COMPLETED", "LATE_COMPLETED"] },
          },
        },
      },
    });

    const finalized = await prisma.$transaction(async (tx) => {
      // Concurrency Guard inside transaction: ensure period is not already FINALIZED
      const lockedCheck = await tx.payrollPeriod.findUnique({
        where: { year_month: { year, month } },
      });
      if (lockedCheck?.status === "FINALIZED") {
        throw new Error("PAYROLL_ALREADY_FINALIZED");
      }

      const period = await tx.payrollPeriod.upsert({
        where: { year_month: { year, month } },
        create: {
          year,
          month,
          startDate,
          endDate,
          status: "FINALIZED",
          finalizedAt: now,
          finalizedByUserId: current.user.id,
        },
        update: {
          status: "FINALIZED",
          finalizedAt: now,
          finalizedByUserId: current.user.id,
        },
      });

      // Insert or lock records snapshot
      for (const emp of employees) {
        const completedDays = emp.attendanceRecords.length;
        const totalLateMinutes = emp.attendanceRecords.reduce((sum, r) => sum + r.lateMinutes, 0);
        const lateArrivalCount = emp.attendanceRecords.filter((r) => r.lateMinutes > 0).length;
        const totalLateDeductions = emp.attendanceRecords.reduce((sum, r) => sum + r.lateDeduction, 0);
        const grossEarnings = emp.attendanceRecords.reduce((sum, r) => sum + r.dailySalarySnapshot, 0);
        const netEarnings = emp.attendanceRecords.reduce((sum, r) => sum + r.netDailyEarnings, 0);

        await tx.payrollRecord.upsert({
          where: {
            payrollPeriodId_employeeId: {
              payrollPeriodId: period.id,
              employeeId: emp.id,
            },
          },
          create: {
            payrollPeriodId: period.id,
            employeeId: emp.id,
            completedDays,
            dailySalary: emp.dailySalary,
            totalLateMinutes,
            lateArrivalCount,
            totalLateDeductions,
            grossEarnings,
            netEarnings,
            isFinalized: true,
          },
          update: {
            completedDays,
            dailySalary: emp.dailySalary,
            totalLateMinutes,
            lateArrivalCount,
            totalLateDeductions,
            grossEarnings,
            netEarnings,
            isFinalized: true,
          },
        });
      }

      return period;
    });

    await recordAuditLog({
      actorId: current.user.id,
      actorRole: "OWNER",
      actorName: current.user.username,
      action: "PAYROLL_PERIOD_FINALIZED",
      targetEntity: "PAYROLL",
      targetId: `${year}-${month}`,
      newValues: {
        year,
        month,
        totalEmployeesProcessed: employees.length,
        status: "FINALIZED",
      },
      reason: "Owner finalized payroll period. Snapshots permanently locked.",
    });

    // Event-driven non-blocking audit flush to ensure WORM archival
    triggerBackgroundFlush();

    return NextResponse.json({
      success: true,
      message: `Payroll for ${monthStr} successfully finalized and permanently locked!`,
      period: finalized,
    });
  } catch (error: any) {
    if (error?.message === "PAYROLL_ALREADY_FINALIZED") {
      return NextResponse.json(
        { error: "Payroll periode ini sudah difinalisasi dan terkunci permanen." },
        { status: 409 }
      );
    }
    console.error("Finalize payroll error:", error);
    return NextResponse.json({ error: "Failed to finalize payroll" }, { status: 500 });
  }
}
