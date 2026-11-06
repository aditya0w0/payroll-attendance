/**
 * Daily Salary & Late Deduction Computation Engine
 * Strict Integer IDR Currency calculations.
 */

export interface DeductionPolicyConfig {
  mode: "PER_MINUTE" | "PER_HOUR" | string;
  rate: number; // e.g. 500 for Rp500/min or 10000 for Rp10,000/hr
  hourlyRounding?: "EXACT" | "ROUND_UP" | "ROUND_DOWN" | "ROUND_NEAREST" | string;
  gracePeriodMinutes?: number;
  maxDeductionPercent?: number; // default 100
}

export interface LateCalculationResult {
  isLate: boolean;
  lateMinutes: number;
  gracePeriodMinutes: number;
  dailySalary: number;
  lateDeduction: number;
  netDailyEarnings: number;
  policyDescription: string;
}

/**
 * Calculates late arrival minutes and exact IDR deduction based on owner's policy.
 */
export function calculateLateDeduction(
  actualCheckIn: Date,
  scheduledStart: Date,
  dailySalary: number,
  policy: DeductionPolicyConfig,
  shiftGraceMinutes?: number
): LateCalculationResult {
  const graceMinutes = shiftGraceMinutes ?? policy.gracePeriodMinutes ?? 10;
  
  // Calculate difference in milliseconds
  const diffMs = actualCheckIn.getTime() - scheduledStart.getTime();
  const rawDiffMinutes = Math.floor(diffMs / (1000 * 60));

  // If actual check-in is before or within grace period, no deduction
  if (rawDiffMinutes <= graceMinutes) {
    return {
      isLate: false,
      lateMinutes: 0,
      gracePeriodMinutes: graceMinutes,
      dailySalary,
      lateDeduction: 0,
      netDailyEarnings: dailySalary,
      policyDescription: `On time (within ${graceMinutes}m grace window).`,
    };
  }

  // Late Minutes = max(0, Actual Check-in - Scheduled Start - Grace Period)
  // Per specification: diff after subtracting grace window
  const lateMinutes = rawDiffMinutes - graceMinutes;

  let lateDeduction = 0;
  let policyDesc = "";

  if (policy.mode === "PER_HOUR") {
    const hoursFraction = lateMinutes / 60.0;
    const rounding = policy.hourlyRounding || "ROUND_UP";

    if (rounding === "ROUND_UP") {
      const units = Math.ceil(hoursFraction);
      lateDeduction = units * policy.rate;
      policyDesc = `Hourly (Round Up): ${units} hr(s) x Rp${policy.rate.toLocaleString()} = Rp${lateDeduction.toLocaleString()}`;
    } else if (rounding === "ROUND_DOWN") {
      const units = Math.floor(hoursFraction);
      lateDeduction = units * policy.rate;
      policyDesc = `Hourly (Round Down): ${units} hr(s) x Rp${policy.rate.toLocaleString()} = Rp${lateDeduction.toLocaleString()}`;
    } else if (rounding === "ROUND_NEAREST") {
      const units = Math.round(hoursFraction);
      lateDeduction = units * policy.rate;
      policyDesc = `Hourly (Round Nearest): ${units} hr(s) x Rp${policy.rate.toLocaleString()} = Rp${lateDeduction.toLocaleString()}`;
    } else {
      // EXACT
      lateDeduction = Math.round(hoursFraction * policy.rate);
      policyDesc = `Hourly (Exact): ${lateMinutes}m x Rp${policy.rate.toLocaleString()}/hr = Rp${lateDeduction.toLocaleString()}`;
    }
  } else {
    // Mode A: PER_MINUTE (Default)
    lateDeduction = lateMinutes * policy.rate;
    policyDesc = `Per-Minute: ${lateMinutes} mins late x Rp${policy.rate.toLocaleString()}/min = Rp${lateDeduction.toLocaleString()}`;
  }

  // Cap maximum deduction at applicable daily salary
  const maxCapPercent = policy.maxDeductionPercent ?? 100;
  const maxDeductionLimit = Math.round(dailySalary * (maxCapPercent / 100));
  
  if (lateDeduction > maxDeductionLimit) {
    lateDeduction = maxDeductionLimit;
    policyDesc += ` (Capped at maximum daily limit: Rp${maxDeductionLimit.toLocaleString()})`;
  }

  const netDailyEarnings = Math.max(0, dailySalary - lateDeduction);

  return {
    isLate: true,
    lateMinutes,
    gracePeriodMinutes: graceMinutes,
    dailySalary,
    lateDeduction,
    netDailyEarnings,
    policyDescription: policyDesc,
  };
}
