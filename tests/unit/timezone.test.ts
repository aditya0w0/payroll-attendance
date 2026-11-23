import { describe, expect, it } from "vitest";
import {
  computeShiftTimestamps,
  determineActiveShiftDate,
  formatJakartaDateTime,
  formatJakartaTime,
  getJakartaDateString,
  getJakartaTimeString,
} from "@/lib/timezone";

describe("Asia/Jakarta timezone & overnight shift scheduling (src/lib/timezone.ts)", () => {
  describe("midnight 00:00–00:59 WIB formatting (regression for hour12:false -> '24:xx')", () => {
    it.each([
      { isoUtc: "2026-11-22T17:00:00.000Z", expectedDate: "2026-11-23", expectedHHmm: "00:00" },
      { isoUtc: "2026-11-22T17:15:30.000Z", expectedDate: "2026-11-23", expectedHHmm: "00:15" },
      { isoUtc: "2026-11-22T17:59:59.000Z", expectedDate: "2026-11-23", expectedHHmm: "00:59" },
      { isoUtc: "2026-11-23T16:59:59.000Z", expectedDate: "2026-11-23", expectedHHmm: "23:59" },
    ])("formats $isoUtc as $expectedDate $expectedHHmm WIB without '24:' hour", ({ isoUtc, expectedDate, expectedHHmm }) => {
      const date = new Date(isoUtc);
      expect(getJakartaDateString(date)).toBe(expectedDate);
      expect(getJakartaTimeString(date)).toBe(expectedHHmm);
      expect(formatJakartaTime(date, false)).toBe(expectedHHmm);
      expect(formatJakartaDateTime(date)).not.toContain("24:");
    });

    it("returns '--' for nullish date inputs", () => {
      expect(formatJakartaDateTime(null)).toBe("--");
      expect(formatJakartaDateTime(undefined)).toBe("--");
      expect(formatJakartaTime(null)).toBe("--");
    });
  });

  describe("computeShiftTimestamps UTC conversion and calendar rollover", () => {
    it("computes standard daytime shift (08:00–17:00 WIB) in exact UTC", () => {
      const { scheduledStart, scheduledEnd } = computeShiftTimestamps(
        "2026-11-23",
        "08:00",
        "17:00",
        false
      );

      expect(scheduledStart.toISOString()).toBe("2026-11-23T01:00:00.000Z");
      expect(scheduledEnd.toISOString()).toBe("2026-11-23T10:00:00.000Z");
    });

    it("rolls overnight shift across year boundary (2026-12-31 22:00 -> 2027-01-01 06:00 WIB)", () => {
      const { scheduledStart, scheduledEnd } = computeShiftTimestamps(
        "2026-12-31",
        "22:00",
        "06:00",
        true
      );

      expect(scheduledStart.toISOString()).toBe("2026-12-31T15:00:00.000Z");
      expect(scheduledEnd.toISOString()).toBe("2026-12-31T23:00:00.000Z");
      expect(getJakartaDateString(scheduledEnd)).toBe("2027-01-01");
      expect(getJakartaTimeString(scheduledEnd)).toBe("06:00");
    });
  });

  describe("determineActiveShiftDate overnight boundary accuracy", () => {
    it.each([
      // Shift Malam: 22:00–06:00 (cutoff = min(20, 10) = 10:00 WIB)
      {
        label: "Shift Malam check-in at 21:55 WIB belongs to today",
        isoUtc: "2026-11-23T14:55:00.000Z", // 21:55 WIB
        start: "22:00",
        end: "06:00",
        overnight: true,
        expected: "2026-11-23",
      },
      {
        label: "Shift Malam midnight scan at 00:05 WIB belongs to yesterday",
        isoUtc: "2026-11-22T17:05:00.000Z", // 2026-11-23 00:05 WIB
        start: "22:00",
        end: "06:00",
        overnight: true,
        expected: "2026-11-22",
      },
      {
        label: "Shift Malam check-out at 06:15 WIB belongs to yesterday",
        isoUtc: "2026-11-22T23:15:00.000Z", // 2026-11-23 06:15 WIB
        start: "22:00",
        end: "06:00",
        overnight: true,
        expected: "2026-11-22",
      },
      {
        label: "Shift Malam at 10:00 WIB (past 4h buffer) switches to today",
        isoUtc: "2026-11-23T03:00:00.000Z", // 2026-11-23 10:00 WIB
        start: "22:00",
        end: "06:00",
        overnight: true,
        expected: "2026-11-23",
      },
      {
        label: "Shift Malam at 12:30 WIB (regression: old <=12 bug returned yesterday) belongs to today",
        isoUtc: "2026-11-23T05:30:00.000Z", // 2026-11-23 12:30 WIB
        start: "22:00",
        end: "06:00",
        overnight: true,
        expected: "2026-11-23",
      },
      // Shift Sore: 16:00–00:00 (cutoff = min(14, 4) = 04:00 WIB)
      {
        label: "Shift Sore late checkout at 00:30 WIB belongs to yesterday",
        isoUtc: "2026-11-22T17:30:00.000Z", // 2026-11-23 00:30 WIB
        start: "16:00",
        end: "00:00",
        overnight: true,
        expected: "2026-11-22",
      },
      {
        label: "Shift Sore at 04:00 WIB switches to today",
        isoUtc: "2026-11-22T21:00:00.000Z", // 2026-11-23 04:00 WIB
        start: "16:00",
        end: "00:00",
        overnight: true,
        expected: "2026-11-23",
      },
      // Daytime shift never rolls back
      {
        label: "Shift Pagi at 00:10 WIB stays on today",
        isoUtc: "2026-11-22T17:10:00.000Z", // 2026-11-23 00:10 WIB
        start: "08:00",
        end: "17:00",
        overnight: false,
        expected: "2026-11-23",
      },
    ])("$label", ({ isoUtc, start, end, overnight, expected }) => {
      const result = determineActiveShiftDate(new Date(isoUtc), start, end, overnight);
      expect(result).toBe(expected);
    });
  });
});
