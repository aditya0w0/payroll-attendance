import { getJakartaDateString } from "@/lib/timezone";

export interface AttendanceAnalyticsEmployee {
  id: string;
  fullName: string;
  employeeId: string;
  dailySalary: number;
  joinedAt: Date | string;
  shift: {
    id: string;
    name: string;
    applicableDays: string; // e.g. "1,2,3,4,5"
  };
}

export interface AttendanceAnalyticsRecord {
  id: string;
  employeeId: string;
  shiftDate: string; // "YYYY-MM-DD"
  checkInTime: Date | string;
  checkOutTime: Date | string | null;
  status: string;
  lateMinutes: number;
  lateDeduction: number;
  netDailyEarnings: number;
  checkInLatitude?: number | null;
  checkInLongitude?: number | null;
  checkInDistanceMeters?: number | null;
  checkInClientIp?: string | null;
}

export interface DailyTrendPoint {
  date: string;
  rawDate: string;
  dayName: string;
  scheduled: number;
  hadir: number; // On-time
  terlambat: number; // Late
  alpa: number; // Absent
  totalPresent: number;
}

export interface EmployeeRosterItem {
  id: string;
  name: string;
  employeeCode: string;
  dailySalary: number;
  shiftName: string;
  assignedShiftCount: number;
  presentCount: number;
  onTimeCount: number;
  lateCount: number;
  absentCount: number;
  totalLateMinutes: number;
  accumulatedWage: number;
  attendanceRate: number;
  records: Array<{
    id: string;
    shiftDate: string;
    checkInTime: string;
    checkOutTime: string | null;
    status: string;
    lateMinutes: number;
    lateDeduction: number;
    netDailyEarnings: number;
    checkInLatitude: number | null;
    checkInLongitude: number | null;
    checkInDistanceMeters: number | null;
    checkInClientIp: string | null;
  }>;
}

export interface AttendanceAnalyticsResult {
  range: string;
  startDate: string;
  endDate: string;
  kpi: {
    totalScheduledShifts: number;
    totalPresentOnTime: number;
    totalPresentLate: number;
    totalPresent: number;
    totalAbsent: number;
    attendanceRatePercentage: number;
    totalLateMinutes: number;
    totalLateDeductions: number;
    totalAccumulatedWages: number;
  };
  dailyTrends: DailyTrendPoint[];
  employeeRoster: EmployeeRosterItem[];
}

/**
 * Returns an array of YYYY-MM-DD strings for the specified date range ending at todayDateStr.
 */
export function getDateRangeList(
  range: "7d" | "14d" | "30d" | "current_period" | string,
  todayDateStr: string = getJakartaDateString()
): string[] {
  const [year, month, day] = todayDateStr.split("-").map(Number);
  const targetDates: string[] = [];

  if (range === "current_period") {
    for (let d = 1; d <= day; d++) {
      const dStr = String(d).padStart(2, "0");
      const mStr = String(month).padStart(2, "0");
      targetDates.push(`${year}-${mStr}-${dStr}`);
    }
    return targetDates;
  }

  const daysCount = range === "30d" ? 30 : range === "14d" ? 14 : 7;
  const baseDate = new Date(Date.UTC(year, month - 1, day));
  for (let i = daysCount - 1; i >= 0; i--) {
    const d = new Date(baseDate.getTime() - i * 86400000);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dt = String(d.getUTCDate()).padStart(2, "0");
    targetDates.push(`${y}-${m}-${dt}`);
  }

  return targetDates;
}

/**
 * Checks if an employee is scheduled to work on a given shiftDate (YYYY-MM-DD).
 */
export function isEmployeeScheduledOnDate(
  employee: AttendanceAnalyticsEmployee,
  dateStr: string
): boolean {
  const joinedDateStr =
    typeof employee.joinedAt === "string"
      ? employee.joinedAt.substring(0, 10)
      : getJakartaDateString(employee.joinedAt);

  if (dateStr < joinedDateStr) {
    return false;
  }

  const [y, m, d] = dateStr.split("-").map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d));
  const dayOfWeek = dateObj.getUTCDay(); // 0 = Sun, 1 = Mon ... 6 = Sat

  const applicableDays = (employee.shift?.applicableDays || "1,2,3,4,5")
    .split(",")
    .map((s) => s.trim());

  return applicableDays.includes(String(dayOfWeek));
}

const MONTH_NAMES_ID = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des"
];

const DAY_NAMES_ID = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

/**
 * Aggregates daily trends, executive KPIs, and employee performance rosters.
 */
export function computeAttendanceAnalytics(params: {
  range: string;
  employees: AttendanceAnalyticsEmployee[];
  attendanceRecords: AttendanceAnalyticsRecord[];
  targetDates: string[];
}): AttendanceAnalyticsResult {
  const { range, employees, attendanceRecords, targetDates } = params;

  // Build lookup maps for O(1) matching:
  // Map<"employeeId_shiftDate", AttendanceAnalyticsRecord>
  const recordMap = new Map<string, AttendanceAnalyticsRecord>();
  // Map<shiftDate, AttendanceAnalyticsRecord[]>
  const dateRecordsMap = new Map<string, AttendanceAnalyticsRecord[]>();
  // Map<employeeId, AttendanceAnalyticsRecord[]>
  const empRecordsMap = new Map<string, AttendanceAnalyticsRecord[]>();

  for (const rec of attendanceRecords) {
    recordMap.set(`${rec.employeeId}_${rec.shiftDate}`, rec);

    const byDate = dateRecordsMap.get(rec.shiftDate) || [];
    byDate.push(rec);
    dateRecordsMap.set(rec.shiftDate, byDate);

    const byEmp = empRecordsMap.get(rec.employeeId) || [];
    byEmp.push(rec);
    empRecordsMap.set(rec.employeeId, byEmp);
  }

  // 1. Compute Daily Trends
  const dailyTrends: DailyTrendPoint[] = [];
  let totalScheduledShifts = 0;
  let totalPresentOnTime = 0;
  let totalPresentLate = 0;
  let totalLateMinutes = 0;
  let totalLateDeductions = 0;
  let totalAccumulatedWages = 0;

  for (const dateStr of targetDates) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d));
    const dayOfWeek = dateObj.getUTCDay();
    const dayName = DAY_NAMES_ID[dayOfWeek] || "";
    const displayDate = `${d} ${MONTH_NAMES_ID[m - 1] || ""}`;

    // Scheduled active employees on this date
    let scheduledOnDate = 0;
    for (const emp of employees) {
      if (isEmployeeScheduledOnDate(emp, dateStr)) {
        scheduledOnDate++;
      }
    }
    totalScheduledShifts += scheduledOnDate;

    const dayRecords = dateRecordsMap.get(dateStr) || [];
    let dayOnTime = 0;
    let dayLate = 0;

    for (const rec of dayRecords) {
      if (rec.lateMinutes > 0) {
        dayLate++;
        totalPresentLate++;
      } else {
        dayOnTime++;
        totalPresentOnTime++;
      }
      totalLateMinutes += rec.lateMinutes || 0;
      totalLateDeductions += rec.lateDeduction || 0;
      totalAccumulatedWages += rec.netDailyEarnings || 0;
    }

    const totalDayPresent = dayOnTime + dayLate;
    const dayAbsent = Math.max(0, scheduledOnDate - totalDayPresent);

    dailyTrends.push({
      date: displayDate,
      rawDate: dateStr,
      dayName,
      scheduled: scheduledOnDate,
      hadir: dayOnTime,
      terlambat: dayLate,
      alpa: dayAbsent,
      totalPresent: totalDayPresent,
    });
  }

  const totalPresent = totalPresentOnTime + totalPresentLate;
  const totalAbsent = Math.max(0, totalScheduledShifts - totalPresent);
  const attendanceRatePercentage =
    totalScheduledShifts > 0
      ? Number(((totalPresent / totalScheduledShifts) * 100).toFixed(1))
      : 0;

  // 2. Compute Employee Performance Roster
  const employeeRoster: EmployeeRosterItem[] = employees.map((emp) => {
    let empAssignedCount = 0;
    for (const dateStr of targetDates) {
      if (isEmployeeScheduledOnDate(emp, dateStr)) {
        empAssignedCount++;
      }
    }

    const empRecords = empRecordsMap.get(emp.id) || [];
    let empOnTime = 0;
    let empLate = 0;
    let empTotalLateMins = 0;
    let empWages = 0;

    const formattedRecords = empRecords
      .map((r) => {
        if (r.lateMinutes > 0) {
          empLate++;
        } else {
          empOnTime++;
        }
        empTotalLateMins += r.lateMinutes || 0;
        empWages += r.netDailyEarnings || 0;

        return {
          id: r.id,
          shiftDate: r.shiftDate,
          checkInTime:
            typeof r.checkInTime === "string"
              ? r.checkInTime
              : r.checkInTime.toISOString(),
          checkOutTime: r.checkOutTime
            ? typeof r.checkOutTime === "string"
              ? r.checkOutTime
              : r.checkOutTime.toISOString()
            : null,
          status: r.status,
          lateMinutes: r.lateMinutes || 0,
          lateDeduction: r.lateDeduction || 0,
          netDailyEarnings: r.netDailyEarnings || 0,
          checkInLatitude: r.checkInLatitude ?? null,
          checkInLongitude: r.checkInLongitude ?? null,
          checkInDistanceMeters: r.checkInDistanceMeters ?? null,
          checkInClientIp: r.checkInClientIp ?? null,
        };
      })
      .sort((a, b) => b.shiftDate.localeCompare(a.shiftDate));

    const empPresentCount = empOnTime + empLate;
    const empAbsentCount = Math.max(0, empAssignedCount - empPresentCount);
    const empAttendanceRate =
      empAssignedCount > 0
        ? Number(((empPresentCount / empAssignedCount) * 100).toFixed(1))
        : 0;

    return {
      id: emp.id,
      name: emp.fullName,
      employeeCode: emp.employeeId,
      dailySalary: emp.dailySalary,
      shiftName: emp.shift?.name || "General Shift",
      assignedShiftCount: empAssignedCount,
      presentCount: empPresentCount,
      onTimeCount: empOnTime,
      lateCount: empLate,
      absentCount: empAbsentCount,
      totalLateMinutes: empTotalLateMins,
      accumulatedWage: empWages,
      attendanceRate: empAttendanceRate,
      records: formattedRecords,
    };
  });

  // Sort employee roster by attendanceRate ascending (putting those with attendance issues first)
  employeeRoster.sort((a, b) => {
    if (a.absentCount !== b.absentCount) {
      return b.absentCount - a.absentCount; // Highest absent first
    }
    if (a.lateCount !== b.lateCount) {
      return b.lateCount - a.lateCount; // Highest late next
    }
    return a.name.localeCompare(b.name);
  });

  return {
    range,
    startDate: targetDates[0] || "",
    endDate: targetDates[targetDates.length - 1] || "",
    kpi: {
      totalScheduledShifts,
      totalPresentOnTime,
      totalPresentLate,
      totalPresent,
      totalAbsent,
      attendanceRatePercentage,
      totalLateMinutes,
      totalLateDeductions,
      totalAccumulatedWages,
    },
    dailyTrends,
    employeeRoster,
  };
}
