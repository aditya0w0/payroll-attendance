import { describe, expect, it } from "vitest";
import { calculateLateDeduction, type DeductionPolicyConfig } from "@/lib/payroll";

const SCHEDULED_0800_WIB = new Date("2026-11-23T01:00:00.000Z"); // 08:00:00 WIB

function atMinutesAfterStart(minutes: number, extraSeconds = 0): Date {
  return new Date(SCHEDULED_0800_WIB.getTime() + (minutes * 60 + extraSeconds) * 1000);
}

describe("calculateLateDeduction (production src/lib/payroll.ts)", () => {
  const perMinutePolicy: DeductionPolicyConfig = {
    mode: "PER_MINUTE",
    rate: 500,
    gracePeriodMinutes: 10,
    maxDeductionPercent: 100,
  };

  describe("grace period and on-time boundaries", () => {
    it.each([
      { label: "early arrival (-15m)", checkIn: atMinutesAfterStart(-15) },
      { label: "exact scheduled start (0m)", checkIn: atMinutesAfterStart(0) },
      { label: "exact grace boundary (10m 00s)", checkIn: atMinutesAfterStart(10, 0) },
      { label: "within grace boundary with seconds (10m 59s -> floor 10m)", checkIn: atMinutesAfterStart(10, 59) },
    ])("charges zero deduction for $label", ({ checkIn }) => {
      const result = calculateLateDeduction(checkIn, SCHEDULED_0800_WIB, 150_000, perMinutePolicy);

      expect(result.isLate).toBe(false);
      expect(result.lateMinutes).toBe(0);
      expect(result.lateDeduction).toBe(0);
      expect(result.netDailyEarnings).toBe(150_000);
      expect(result.gracePeriodMinutes).toBe(10);
    });

    it("triggers 1 late minute immediately past grace boundary (11m 00s)", () => {
      const result = calculateLateDeduction(
        atMinutesAfterStart(11),
        SCHEDULED_0800_WIB,
        150_000,
        perMinutePolicy
      );

      expect(result.isLate).toBe(true);
      expect(result.lateMinutes).toBe(1);
      expect(result.lateDeduction).toBe(500);
      expect(result.netDailyEarnings).toBe(149_500);
    });

    it("prefers explicit shiftGraceMinutes (including 0) over policy gracePeriodMinutes", () => {
      const result = calculateLateDeduction(
        atMinutesAfterStart(5),
        SCHEDULED_0800_WIB,
        150_000,
        perMinutePolicy,
        0
      );

      expect(result.gracePeriodMinutes).toBe(0);
      expect(result.isLate).toBe(true);
      expect(result.lateMinutes).toBe(5);
      expect(result.lateDeduction).toBe(2_500);
      expect(result.netDailyEarnings).toBe(147_500);
    });
  });

  describe("PER_HOUR rounding modes", () => {
    it.each([
      { rounding: "ROUND_UP", lateAfterGraceMins: 15, expectedDeduction: 10_000 },
      { rounding: "ROUND_UP", lateAfterGraceMins: 61, expectedDeduction: 20_000 },
      { rounding: "ROUND_DOWN", lateAfterGraceMins: 59, expectedDeduction: 0 },
      { rounding: "ROUND_DOWN", lateAfterGraceMins: 61, expectedDeduction: 10_000 },
      { rounding: "ROUND_NEAREST", lateAfterGraceMins: 29, expectedDeduction: 0 },
      { rounding: "ROUND_NEAREST", lateAfterGraceMins: 30, expectedDeduction: 10_000 },
      { rounding: "ROUND_NEAREST", lateAfterGraceMins: 89, expectedDeduction: 10_000 },
      { rounding: "ROUND_NEAREST", lateAfterGraceMins: 90, expectedDeduction: 20_000 },
      { rounding: "EXACT", lateAfterGraceMins: 15, expectedDeduction: 2_500 },
      { rounding: "EXACT", lateAfterGraceMins: 45, expectedDeduction: 7_500 },
    ])(
      "computes Rp$expectedDeduction for $rounding when $lateAfterGraceMins min past grace",
      ({ rounding, lateAfterGraceMins, expectedDeduction }) => {
        const policy: DeductionPolicyConfig = {
          mode: "PER_HOUR",
          rate: 10_000,
          hourlyRounding: rounding,
          gracePeriodMinutes: 10,
          maxDeductionPercent: 100,
        };

        const result = calculateLateDeduction(
          atMinutesAfterStart(10 + lateAfterGraceMins),
          SCHEDULED_0800_WIB,
          150_000,
          policy
        );

        expect(result.isLate).toBe(true);
        expect(result.lateMinutes).toBe(lateAfterGraceMins);
        expect(result.lateDeduction).toBe(expectedDeduction);
        expect(result.netDailyEarnings).toBe(150_000 - expectedDeduction);
      }
    );
  });

  describe("maximum deduction cap and non-negative net earnings", () => {
    it("caps deduction at maxDeductionPercent of dailySalary", () => {
      const cappedPolicy: DeductionPolicyConfig = {
        mode: "PER_MINUTE",
        rate: 5_000,
        gracePeriodMinutes: 0,
        maxDeductionPercent: 50,
      };

      const result = calculateLateDeduction(
        atMinutesAfterStart(120),
        SCHEDULED_0800_WIB,
        100_000,
        cappedPolicy
      );

      expect(result.lateDeduction).toBe(50_000);
      expect(result.netDailyEarnings).toBe(50_000);
      expect(result.policyDescription).toContain("Capped");
    });

    it("never produces negative netDailyEarnings even when raw penalty exceeds dailySalary", () => {
      const severePolicy: DeductionPolicyConfig = {
        mode: "PER_MINUTE",
        rate: 10_000,
        gracePeriodMinutes: 0,
        maxDeductionPercent: 100,
      };

      const result = calculateLateDeduction(
        atMinutesAfterStart(60),
        SCHEDULED_0800_WIB,
        150_000,
        severePolicy
      );

      expect(result.lateDeduction).toBe(150_000);
      expect(result.netDailyEarnings).toBe(0);
    });
  });
});
