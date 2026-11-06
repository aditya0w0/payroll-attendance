"""
Payroll & Late Deduction Computation Engine
Handles standard daily salary calculation, late penalty deduction, and monthly pay summary.
"""

from datetime import datetime, time
import math
from typing import Dict, Any, List, Optional

def calculate_daily_rate(monthly_salary: float, working_days: int = 22) -> float:
    """Calculates standard daily salary rate rounded to 2 decimal places."""
    if working_days <= 0:
        working_days = 22
    return round(monthly_salary / working_days, 2)

def evaluate_clock_in(
    clock_in_dt: datetime,
    scheduled_start_str: str = "09:00",
    grace_period_mins: int = 10,
    daily_salary_rate: float = 100.0,
    deduction_mode: str = "FULL_DAILY",
    deduction_percentage: float = 100.0
) -> Dict[str, Any]:
    """
    Evaluates whether a clock-in is late and calculates exact daily salary deduction.
    Returns:
        {
            "is_late": bool,
            "late_minutes": int,
            "status": "ON_TIME" or "LATE",
            "daily_salary_rate": float,
            "deduction_amount": float,
            "net_daily_earned": float,
            "rule_applied": str
        }
    """
    # Parse scheduled start time
    parts = scheduled_start_str.split(":")
    sched_hour = int(parts[0])
    sched_min = int(parts[1]) if len(parts) > 1 else 0
    scheduled_time = clock_in_dt.replace(hour=sched_hour, minute=sched_min, second=0, microsecond=0)

    # Actual difference from scheduled start
    diff_seconds = (clock_in_dt - scheduled_time).total_seconds()
    diff_minutes = int(diff_seconds // 60)

    # Within grace period?
    if diff_minutes <= grace_period_mins:
        return {
            "is_late": False,
            "late_minutes": 0,
            "status": "ON_TIME",
            "daily_salary_rate": daily_salary_rate,
            "deduction_amount": 0.0,
            "net_daily_earned": daily_salary_rate,
            "rule_applied": f"Clocked in on time (within {grace_period_mins}m grace period)."
        }

    # Otherwise LATE
    late_minutes = diff_minutes
    deduction_amount = 0.0
    rule_desc = ""

    mode = deduction_mode.upper() if deduction_mode else "FULL_DAILY"

    if mode == "FULL_DAILY":
        # 100% of daily salary deducted
        deduction_amount = daily_salary_rate
        rule_desc = f"Full daily salary forfeited due to late arrival ({late_minutes}m late)."
    elif mode == "HALF_DAILY":
        # 50% of daily salary deducted
        deduction_amount = round(daily_salary_rate * 0.5, 2)
        rule_desc = f"Half daily salary (50%) deducted due to late arrival ({late_minutes}m late)."
    elif mode == "PERCENTAGE":
        pct = max(0.0, min(100.0, deduction_percentage))
        deduction_amount = round(daily_salary_rate * (pct / 100.0), 2)
        rule_desc = f"{pct}% of daily salary deducted ({late_minutes}m late)."
    elif mode == "PRO_RATED_HOURLY":
        # Pro-rated hourly deduction (assumes 8h workday)
        hourly_rate = daily_salary_rate / 8.0
        late_hours = math.ceil(late_minutes / 60.0)
        deduction_amount = min(daily_salary_rate, round(hourly_rate * late_hours, 2))
        rule_desc = f"Hourly deduction applied: {late_hours}h x ${hourly_rate:.2f} = ${deduction_amount:.2f} ({late_minutes}m late)."
    elif mode == "TIERED":
        # Tiered penalty
        if late_minutes <= 15:
            pct = 25.0
        elif late_minutes <= 60:
            pct = 50.0
        else:
            pct = 100.0
        deduction_amount = round(daily_salary_rate * (pct / 100.0), 2)
        rule_desc = f"Tiered penalty ({pct}% daily salary deducted for {late_minutes}m late)."
    else:
        # Default fallback to percentage / full daily
        pct = max(0.0, min(100.0, deduction_percentage)) if deduction_percentage > 0 else 100.0
        deduction_amount = round(daily_salary_rate * (pct / 100.0), 2)
        rule_desc = f"Late deduction applied: ${deduction_amount:.2f} ({late_minutes}m late)."

    net_daily_earned = max(0.0, round(daily_salary_rate - deduction_amount, 2))

    return {
        "is_late": True,
        "late_minutes": late_minutes,
        "status": "LATE",
        "daily_salary_rate": daily_salary_rate,
        "deduction_amount": deduction_amount,
        "net_daily_earned": net_daily_earned,
        "rule_applied": rule_desc
    }

def compute_monthly_payroll_summary(
    user: Dict[str, Any],
    attendance_records: List[Dict[str, Any]],
    month_str: str # 'YYYY-MM'
) -> Dict[str, Any]:
    """
    Calculates monthly payroll statement for an employee:
    - Base monthly salary
    - Daily rate
    - Present days count
    - On-time days count
    - Late days count
    - Total late deductions
    - Estimated net payout
    """
    monthly_salary = float(user.get("monthly_salary", 3000.0))
    working_days = int(user.get("working_days_per_month", 22))
    daily_rate = calculate_daily_rate(monthly_salary, working_days)

    present_count = len(attendance_records)
    on_time_count = sum(1 for r in attendance_records if r.get("status") == "ON_TIME")
    late_count = sum(1 for r in attendance_records if r.get("status") == "LATE")
    total_late_deductions = round(sum(float(r.get("deduction_amount", 0.0)) for r in attendance_records), 2)
    total_earned = round(sum(float(r.get("net_daily_earned", 0.0)) for r in attendance_records), 2)

    # Unworked days in standard month
    unworked_days = max(0, working_days - present_count)
    unworked_deduction = round(unworked_days * daily_rate, 2)

    # Net payable for current month based on actual attendance and late penalties
    net_payable = round(max(0.0, monthly_salary - total_late_deductions - unworked_deduction), 2)

    return {
        "user_id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "month": month_str,
        "monthly_salary": monthly_salary,
        "working_days_standard": working_days,
        "daily_rate": daily_rate,
        "days_present": present_count,
        "days_on_time": on_time_count,
        "days_late": late_count,
        "total_late_deductions": total_late_deductions,
        "unworked_days": unworked_days,
        "unworked_deduction": unworked_deduction,
        "net_payable": net_payable,
        "records": attendance_records
    }
