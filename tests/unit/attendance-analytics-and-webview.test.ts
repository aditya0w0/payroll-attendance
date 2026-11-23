import { afterEach, describe, expect, it, vi } from "vitest";
import {
  computeAttendanceAnalytics,
  getDateRangeList,
  isEmployeeScheduledOnDate,
  type AttendanceAnalyticsEmployee,
  type AttendanceAnalyticsRecord,
} from "@/lib/attendance-analytics";
import { detectInAppWebView } from "@/lib/webview-detect";

describe("attendance analytics engine (src/lib/attendance-analytics.ts)", () => {
  const refDateStr = "2026-11-09"; // Monday

  it.each([
    { range: "7d", expectedLength: 7, expectedStart: "2026-11-03", expectedEnd: "2026-11-09" },
    { range: "14d", expectedLength: 14, expectedStart: "2026-10-27", expectedEnd: "2026-11-09" },
    { range: "30d", expectedLength: 30, expectedStart: "2026-10-11", expectedEnd: "2026-11-09" },
    { range: "current_period", expectedLength: 9, expectedStart: "2026-11-01", expectedEnd: "2026-11-09" },
  ])("getDateRangeList($range) returns exact date window", ({ range, expectedLength, expectedStart, expectedEnd }) => {
    const dates = getDateRangeList(range, refDateStr);
    expect(dates).toHaveLength(expectedLength);
    expect(dates[0]).toBe(expectedStart);
    expect(dates[dates.length - 1]).toBe(expectedEnd);
  });

  it("respects shift applicableDays and employee joinedAt boundary", () => {
    const emp: AttendanceAnalyticsEmployee = {
      id: "emp_sched",
      fullName: "Test User",
      employeeId: "EMP-99",
      dailySalary: 150_000,
      joinedAt: "2026-11-05",
      shift: { id: "s1", name: "Shift Pagi", applicableDays: "1,2,3,4,5" },
    };

    expect(isEmployeeScheduledOnDate(emp, "2026-11-09")).toBe(true); // Monday, after join date
    expect(isEmployeeScheduledOnDate(emp, "2026-11-08")).toBe(false); // Sunday
    expect(isEmployeeScheduledOnDate(emp, "2026-11-04")).toBe(false); // Before join date
  });

  it("computes exact attendance rate, absences, late minutes, and daily balance invariant", () => {
    const targetDates = getDateRangeList("7d", refDateStr); // Tue Nov 3 .. Mon Nov 9 (5 weekdays)
    const employees: AttendanceAnalyticsEmployee[] = [
      {
        id: "emp_1",
        fullName: "Budi Santoso",
        employeeId: "EMP-001",
        dailySalary: 160_000,
        joinedAt: new Date("2026-01-01T00:00:00.000Z"),
        shift: { id: "s1", name: "Shift Pagi", applicableDays: "1,2,3,4,5" },
      },
    ];
    const records: AttendanceAnalyticsRecord[] = [
      {
        id: "r1",
        employeeId: "emp_1",
        shiftDate: "2026-11-03",
        checkInTime: "2026-11-03T00:55:00.000Z",
        checkOutTime: "2026-11-03T10:00:00.000Z",
        status: "COMPLETED",
        lateMinutes: 0,
        lateDeduction: 0,
        netDailyEarnings: 160_000,
      },
      {
        id: "r2",
        employeeId: "emp_1",
        shiftDate: "2026-11-04",
        checkInTime: "2026-11-04T01:25:00.000Z",
        checkOutTime: "2026-11-04T10:00:00.000Z",
        status: "LATE_COMPLETED",
        lateMinutes: 15,
        lateDeduction: 7_500,
        netDailyEarnings: 152_500,
      },
      {
        id: "r3",
        employeeId: "emp_1",
        shiftDate: "2026-11-05",
        checkInTime: "2026-11-05T00:58:00.000Z",
        checkOutTime: "2026-11-05T10:00:00.000Z",
        status: "COMPLETED",
        lateMinutes: 0,
        lateDeduction: 0,
        netDailyEarnings: 160_000,
      },
    ];

    const result = computeAttendanceAnalytics({
      range: "7d",
      employees,
      attendanceRecords: records,
      targetDates,
    });

    expect(result.employeeRoster).toHaveLength(1);
    const budi = result.employeeRoster[0];
    expect(budi.assignedShiftCount).toBe(5);
    expect(budi.onTimeCount).toBe(2);
    expect(budi.lateCount).toBe(1);
    expect(budi.presentCount).toBe(3);
    expect(budi.absentCount).toBe(2);
    expect(budi.attendanceRate).toBe(60);
    expect(budi.totalLateMinutes).toBe(15);
    expect(budi.accumulatedWage).toBe(472_500);

    // Accounting invariant: every day must balance hadir + terlambat + alpa === scheduled
    expect(result.dailyTrends).toHaveLength(7);
    for (const day of result.dailyTrends) {
      expect(day.hadir + day.terlambat + day.alpa).toBe(day.scheduled);
    }
  });

  it("handles empty employee list without NaN or division by zero", () => {
    const targetDates = getDateRangeList("7d", refDateStr);
    const result = computeAttendanceAnalytics({
      range: "7d",
      employees: [],
      attendanceRecords: [],
      targetDates,
    });

    expect(result.employeeRoster).toEqual([]);
    expect(result.kpi.attendanceRatePercentage).toBe(0);
    expect(result.kpi.totalAbsent).toBe(0);
    expect(Number.isNaN(result.kpi.attendanceRatePercentage)).toBe(false);
  });
});

describe("in-app WebView detector (src/lib/webview-detect.ts)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    {
      label: "WhatsApp iOS WebView",
      ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 WhatsApp/2.24.1",
      isInApp: true,
      appName: "WhatsApp",
      canUsePasskey: false,
    },
    {
      label: "Instagram WebView",
      ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Instagram 310.0.0.1",
      isInApp: true,
      appName: "Instagram",
      canUsePasskey: false,
    },
    {
      label: "Facebook WebView",
      ua: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 [FBAN/FBIOS;FBAV/440.0]",
      isInApp: true,
      appName: "Facebook",
      canUsePasskey: false,
    },
    {
      label: "Standard Mobile Safari (HTTPS + WebAuthn)",
      ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
      isInApp: false,
      appName: null,
      canUsePasskey: true,
    },
    {
      label: "Standard Chrome Android (HTTPS + WebAuthn)",
      ua: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
      isInApp: false,
      appName: null,
      canUsePasskey: true,
    },
  ])("detects $label accurately", ({ ua, isInApp, appName, canUsePasskey }) => {
    vi.stubGlobal("window", {
      isSecureContext: true,
      PublicKeyCredential: {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn(),
      },
    });

    const res = detectInAppWebView(ua);
    expect(res.isInApp).toBe(isInApp);
    expect(res.appName).toBe(appName);
    expect(res.canUsePasskey).toBe(canUsePasskey);
  });

  it("blocks passkey on insecure HTTP context even in standard Chrome", () => {
    vi.stubGlobal("window", {
      isSecureContext: false,
      PublicKeyCredential: {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn(),
      },
    });

    const res = detectInAppWebView(
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36"
    );
    expect(res.isInApp).toBe(false);
    expect(res.isSecureContext).toBe(false);
    expect(res.canUsePasskey).toBe(false);
    expect(res.reason).toContain("HTTP");
  });
});
