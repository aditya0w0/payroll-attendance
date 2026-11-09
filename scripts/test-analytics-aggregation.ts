import {
  getDateRangeList,
  isEmployeeScheduledOnDate,
  computeAttendanceAnalytics,
  type AttendanceAnalyticsEmployee,
  type AttendanceAnalyticsRecord,
} from "../src/lib/attendance-analytics";
import { prisma } from "../src/lib/db";
import bcrypt from "bcryptjs";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${testName}${detail ? ` (${detail})` : ""}`);
    passedCount++;
  } else {
    console.error(`  [FAIL] ${testName}${detail ? ` (${detail})` : ""}`);
    failedCount++;
    throw new Error(`Test assertion failed: ${testName}`);
  }
}

async function runAnalyticsAggregationSuite() {
  console.log("================================================================================");
  console.log("STARTING OWNER ATTENDANCE ANALYTICS & BREAKDOWN VERIFICATION SUITE");
  console.log("================================================================================\n");

  // ---------------------------------------------------------------------------
  // SECTION 1: Date Range List Generator Tests
  // ---------------------------------------------------------------------------
  console.log("--- TEST 1: Date Range List Generator ---");

  const range7d = getDateRangeList("7d", "2026-11-09");
  assert(range7d.length === 7, "7d range produces exactly 7 dates", `Count: ${range7d.length}`);
  assert(range7d[0] === "2026-11-03", "7d starts 6 days prior", `Start: ${range7d[0]}`);
  assert(range7d[6] === "2026-11-09", "7d ends on target date", `End: ${range7d[6]}`);

  const range14d = getDateRangeList("14d", "2026-11-09");
  assert(range14d.length === 14, "14d range produces exactly 14 dates", `Count: ${range14d.length}`);
  assert(range14d[0] === "2026-10-27", "14d starts 13 days prior", `Start: ${range14d[0]}`);

  const range30d = getDateRangeList("30d", "2026-11-09");
  assert(range30d.length === 30, "30d range produces exactly 30 dates", `Count: ${range30d.length}`);

  const rangeMonth = getDateRangeList("current_period", "2026-11-09");
  assert(rangeMonth.length === 9, "current_period produces dates from 1st to today", `Count: ${rangeMonth.length}`);
  assert(rangeMonth[0] === "2026-11-01", "current_period starts on 1st of month", `Start: ${rangeMonth[0]}`);
  assert(rangeMonth[8] === "2026-11-09", "current_period ends on today", `End: ${rangeMonth[8]}`);

  // ---------------------------------------------------------------------------
  // SECTION 2: Shift Schedule & Day of Week Matching Tests
  // ---------------------------------------------------------------------------
  console.log("\n--- TEST 2: Employee Shift Schedule Matching ---");

  const mockEmployeeA: AttendanceAnalyticsEmployee = {
    id: "emp-mock-a",
    fullName: "Budi Santoso",
    employeeId: "EMP-001",
    dailySalary: 160000,
    joinedAt: "2026-11-01",
    shift: {
      id: "shift-general",
      name: "Morning Shift (Mon-Fri)",
      applicableDays: "1,2,3,4,5", // Mon-Fri
    },
  };

  // 2026-11-09 is Monday (Day 1)
  assert(
    isEmployeeScheduledOnDate(mockEmployeeA, "2026-11-09") === true,
    "Employee is scheduled on Monday (applicableDays 1,2,3,4,5)"
  );

  // 2026-11-08 is Sunday (Day 0)
  assert(
    isEmployeeScheduledOnDate(mockEmployeeA, "2026-11-08") === false,
    "Employee is NOT scheduled on Sunday (applicableDays 1,2,3,4,5)"
  );

  // Dates before joinedAt must return false
  assert(
    isEmployeeScheduledOnDate(mockEmployeeA, "2026-10-31") === false,
    "Dates before joinedAt are not scheduled"
  );

  // ---------------------------------------------------------------------------
  // SECTION 3: Mathematical Absence Calculation & KPI Aggregation
  // ---------------------------------------------------------------------------
  console.log("\n--- TEST 3: Mathematical Absence & Lateness Calculation ---");

  const targetDates = [
    "2026-11-03", // Tue (1)
    "2026-11-04", // Wed (2)
    "2026-11-05", // Thu (3)
    "2026-11-06", // Fri (4)
    "2026-11-07", // Sat (not scheduled)
    "2026-11-08", // Sun (not scheduled)
    "2026-11-09", // Mon (5)
  ];
  // mockEmployeeA is scheduled on 5 of these 7 days (Tue, Wed, Thu, Fri, Mon)

  // Simulate 3 check-in records:
  // - 2026-11-03: On-Time (lateMinutes = 0)
  // - 2026-11-04: Late (lateMinutes = 15, deduction = 7500)
  // - 2026-11-05: On-Time (lateMinutes = 0)
  // - 2026-11-06: NO RECORD (Alpa #1)
  // - 2026-11-09: NO RECORD (Alpa #2)
  const mockRecords: AttendanceAnalyticsRecord[] = [
    {
      id: "rec-1",
      employeeId: "emp-mock-a",
      shiftDate: "2026-11-03",
      checkInTime: "2026-11-03T08:00:00Z",
      checkOutTime: "2026-11-03T17:00:00Z",
      status: "COMPLETED",
      lateMinutes: 0,
      lateDeduction: 0,
      netDailyEarnings: 160000,
    },
    {
      id: "rec-2",
      employeeId: "emp-mock-a",
      shiftDate: "2026-11-04",
      checkInTime: "2026-11-04T08:15:00Z",
      checkOutTime: "2026-11-04T17:00:00Z",
      status: "LATE_COMPLETED",
      lateMinutes: 15,
      lateDeduction: 7500,
      netDailyEarnings: 152500,
    },
    {
      id: "rec-3",
      employeeId: "emp-mock-a",
      shiftDate: "2026-11-05",
      checkInTime: "2026-11-05T07:55:00Z",
      checkOutTime: "2026-11-05T17:00:00Z",
      status: "COMPLETED",
      lateMinutes: 0,
      lateDeduction: 0,
      netDailyEarnings: 160000,
    },
  ];

  const analytics = computeAttendanceAnalytics({
    range: "7d",
    employees: [mockEmployeeA],
    attendanceRecords: mockRecords,
    targetDates,
  });

  const rosterItem = analytics.employeeRoster[0];
  assert(Boolean(rosterItem), "Employee roster item is generated");
  assert(rosterItem.assignedShiftCount === 5, "Total scheduled shifts is 5", `Assigned: ${rosterItem.assignedShiftCount}`);
  assert(rosterItem.onTimeCount === 2, "On-time count is 2", `On-Time: ${rosterItem.onTimeCount}`);
  assert(rosterItem.lateCount === 1, "Late count is 1", `Late: ${rosterItem.lateCount}`);
  assert(rosterItem.presentCount === 3, "Total present count is 3 (2 on-time + 1 late)", `Present: ${rosterItem.presentCount}`);
  assert(rosterItem.absentCount === 2, "Absent count is exactly 2 (5 scheduled - 3 present)", `Absent: ${rosterItem.absentCount}`);
  assert(rosterItem.attendanceRate === 60.0, "Attendance rate is 60.0% (3/5)", `Rate: ${rosterItem.attendanceRate}%`);
  assert(rosterItem.totalLateMinutes === 15, "Total late minutes is 15", `Late mins: ${rosterItem.totalLateMinutes}`);
  assert(rosterItem.accumulatedWage === 472500, "Accumulated wage is Rp472,500 (160k + 152.5k + 160k)", `Wage: ${rosterItem.accumulatedWage}`);

  // ---------------------------------------------------------------------------
  // SECTION 4: Daily Trend Aggregation Balance Tests
  // ---------------------------------------------------------------------------
  console.log("\n--- TEST 4: Daily Trend Date Grouping Balance ---");

  assert(analytics.dailyTrends.length === 7, "Daily trends array contains exactly 7 points");

  for (const day of analytics.dailyTrends) {
    const sum = day.hadir + day.terlambat + day.alpa;
    assert(
      sum === day.scheduled,
      `Day ${day.rawDate} balances: hadir (${day.hadir}) + telat (${day.terlambat}) + alpa (${day.alpa}) === scheduled (${day.scheduled})`
    );
  }

  // ---------------------------------------------------------------------------
  // SECTION 5: HTTP Endpoint Integration Tests (/api/owner/analytics/attendance)
  // ---------------------------------------------------------------------------
  console.log("\n--- TEST 5: HTTP Endpoint Integration (/api/owner/analytics/attendance) ---");

  // 5.1 Unauthenticated access must be rejected with HTTP 403
  const unauthRes = await fetch(`${BASE_URL}/api/owner/analytics/attendance`);
  assert(
    unauthRes.status === 403,
    "Unauthenticated access rejected with HTTP 403",
    `Status: ${unauthRes.status}`
  );

  // 5.2 Authenticated Owner access produces valid JSON analytics
  const ownerUser = await prisma.user.findFirst({
    where: { role: "OWNER" },
  });
  if (!ownerUser) {
    throw new Error("No owner user found in database");
  }

  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: ownerUser.email,
      password: "admin123",
      deviceFingerprint: "fp_test_owner_terminal",
      deviceName: "Owner Terminal",
    }),
  });
  const ownerCookie = loginRes.headers.get("set-cookie")?.split(";")[0] || "";
  assert(loginRes.status === 200, "Owner login succeeds with HTTP 200");

  const analyticsRes = await fetch(`${BASE_URL}/api/owner/analytics/attendance?range=7d`, {
    headers: { Cookie: ownerCookie },
  });
  assert(analyticsRes.status === 200, "Owner analytics endpoint returns HTTP 200", `Status: ${analyticsRes.status}`);

  const analyticsJson = await analyticsRes.json();
  assert(analyticsJson.success === true, "Response payload indicates success: true");
  assert(typeof analyticsJson.kpi === "object", "KPI counters object is present");
  assert(Array.isArray(analyticsJson.dailyTrends), "dailyTrends array is present");
  assert(Array.isArray(analyticsJson.employeeRoster), "employeeRoster array is present");
  assert(analyticsJson.dailyTrends.length === 7, "Default 7d query produces 7 daily trend points");

  console.log("\n================================================================================");
  console.log(`ANALYTICS TESTS PASSED: ${passedCount}, FAILED: ${failedCount} (TOTAL: ${passedCount + failedCount})`);
  console.log("================================================================================");
}

runAnalyticsAggregationSuite()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("Fatal test error:", err);
    process.exit(1);
  });
