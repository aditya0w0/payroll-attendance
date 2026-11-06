"""
In-process Integration Test Suite (Pure Python Standard Library, Zero Network Socket needed)
"""

import sqlite3
import database
import zero_trust
import payroll
import auth
from datetime import datetime, timedelta

def run_in_process_tests():
    print("=== STARTING IN-PROCESS INTEGRATION TESTS ===")

    # 1. Initialize Database
    database.init_db()
    conn = database.get_db_connection()

    # 2. Test Zero-Trust Initial Integrity
    initial_verify = zero_trust.verify_audit_log_chain(conn)
    assert initial_verify["valid"] is True, f"Initial chain invalid: {initial_verify}"
    print(f"✓ [PASS] Zero-Trust initial chain verified: {initial_verify['total_entries']} entries, SHA-256 valid.")

    # 3. Test Owner setting Monthly Salary
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE email = 'alice@company.com'")
    alice = dict(cursor.fetchone())
    old_sal = alice["monthly_salary"]
    new_sal = 4400.0
    new_days = 22
    new_daily_rate = payroll.calculate_daily_rate(new_sal, new_days)
    assert new_daily_rate == 200.0

    now_iso = datetime.utcnow().isoformat() + "Z"
    cursor.execute("""
        UPDATE users
        SET monthly_salary = ?, working_days_per_month = ?, updated_at = ?
        WHERE id = ?
    """, (new_sal, new_days, now_iso, alice["id"]))
    conn.commit()

    # Record mutation in Zero Trust Audit Log
    log_id, entry_hash = zero_trust.record_audit_log(
        conn=conn,
        actor_id=1,
        actor_name="Alex Vance (Owner)",
        actor_role="owner",
        action_type="SALARY_MODIFIED",
        resource_type="EMPLOYEE_COMPENSATION",
        resource_id=str(alice["id"]),
        details={
            "employee_name": alice["name"],
            "previous_monthly_salary": old_sal,
            "new_monthly_salary": new_sal,
            "new_daily_rate": new_daily_rate
        },
        ip_address="127.0.0.1",
        user_agent="Automated Test"
    )
    print(f"✓ [PASS] Owner set monthly salary: ${old_sal} -> ${new_sal} (Daily rate: ${new_daily_rate:.2f}/day). Audit Log #{log_id} Hash: {entry_hash[:16]}...")

    # 4. Test Late Deduction Logic
    # Scheduled 09:00 with 10m grace period.
    # Clock in at 09:35 (25 mins late past grace period)
    punch_time = datetime(2026, 11, 6, 9, 35, 0)
    eval_res = payroll.evaluate_clock_in(
        clock_in_dt=punch_time,
        scheduled_start_str=alice["work_start_time"],
        grace_period_mins=alice["grace_period_mins"],
        daily_salary_rate=new_daily_rate,
        deduction_mode="FULL_DAILY"
    )
    assert eval_res["is_late"] is True
    assert eval_res["status"] == "LATE"
    assert eval_res["late_minutes"] == 35
    assert eval_res["deduction_amount"] == new_daily_rate # $200 deducted!
    assert eval_res["net_daily_earned"] == 0.0
    print(f"✓ [PASS] Late arrival at 09:35 evaluated: Daily salary of ${new_daily_rate:.2f} deducted in full.")

    # Insert attendance record
    date_str = "2026-11-06"
    cursor.execute("""
        INSERT OR REPLACE INTO attendance (
            user_id, date, clock_in, scheduled_start, scheduled_end,
            status, late_minutes, monthly_salary_snapshot, daily_salary_rate,
            deduction_amount, net_daily_earned, device_id, device_name,
            ip_address, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        alice["id"], date_str, punch_time.isoformat() + "Z", "09:00", "17:00",
        eval_res["status"], eval_res["late_minutes"],
        new_sal, new_daily_rate, eval_res["deduction_amount"], eval_res["net_daily_earned"],
        alice["bound_device_id"], "Alice's Authorized MacBook Pro", "127.0.0.1",
        eval_res["rule_applied"], now_iso, now_iso
    ))
    conn.commit()

    # Record attendance audit log
    zero_trust.record_audit_log(
        conn=conn,
        actor_id=alice["id"],
        actor_name=alice["name"],
        actor_role="employee",
        action_type="CLOCK_IN_LATE_DEDUCTION_APPLIED",
        resource_type="ATTENDANCE",
        resource_id=f"{alice['id']}_{date_str}",
        details={
            "employee": alice["name"],
            "clock_in": punch_time.isoformat() + "Z",
            "late_minutes": 35,
            "deduction_amount": eval_res["deduction_amount"],
            "net_daily_earned": 0.0
        },
        ip_address="127.0.0.1",
        user_agent="Automated Test"
    )

    # 5. Test Single-Device Policy & Anti-Bypass Lockout
    # Alice attempts to login from an unauthorized rogue device
    rogue_dev = "rogue_device_attacker_99"
    tok, udata, err, extra = auth.authenticate_user(
        email="alice@company.com",
        password="employee123",
        device_id=rogue_dev,
        device_name="Attacker Phone",
        ip_address="198.51.100.22",
        user_agent="Malicious Device Simulator"
    )
    assert tok is None
    assert err == "DEVICE_LOCKED"
    assert extra is not None
    req_code = extra["request_code"]
    print(f"✓ [PASS] Single-device policy blocked rogue device! Challenge issued: {req_code}.")

    # Fetch Owner unlock code for this request
    cursor.execute("SELECT * FROM device_unlock_requests WHERE request_code = ?", (req_code,))
    unlock_req = cursor.fetchone()
    assert unlock_req is not None
    unlock_code = unlock_req["unlock_code"]
    assert len(unlock_code) == 6
    print(f"✓ [PASS] Owner view shows 6-digit Unlock Code: {unlock_code} (Expires: {unlock_req['expires_at']}).")

    # Alice enters the Owner-provided unlock code on the new device
    tok_unlocked, udata_unlocked, err_unlocked = auth.verify_and_unlock_device(
        email="alice@company.com",
        unlock_code=unlock_code,
        device_id=rogue_dev,
        device_name="Alice's New Authorized Terminal",
        ip_address="198.51.100.22",
        user_agent="Authorized Browser"
    )
    assert tok_unlocked is not None, f"Unlock failed: {err_unlocked}"
    assert udata_unlocked["bound_device_id"] == rogue_dev
    print(f"✓ [PASS] Alice successfully bound new device using Owner unlock code! Token: {tok_unlocked[:8]}...")

    # 6. Test Monthly Payroll Calculation
    cursor.execute("SELECT * FROM users WHERE id = ?", (alice["id"],))
    updated_alice = dict(cursor.fetchone())
    cursor.execute("SELECT * FROM attendance WHERE user_id = ? AND date LIKE '2026-11%'", (alice["id"],))
    records = [dict(r) for r in cursor.fetchall()]

    payroll_summary = payroll.compute_monthly_payroll_summary(updated_alice, records, "2026-11")
    assert payroll_summary["days_late"] >= 1
    assert payroll_summary["total_late_deductions"] > 0
    print(f"✓ [PASS] Monthly Payroll computed: Base ${payroll_summary['monthly_salary']:.2f}, Late Deductions: -${payroll_summary['total_late_deductions']:.2f}, Net: ${payroll_summary['net_payable']:.2f}.")

    # 7. Test Zero-Trust Blockchain-Style Tamper Detection!
    # A) Valid chain
    verify_valid = zero_trust.verify_audit_log_chain(conn)
    assert verify_valid["valid"] is True
    print(f"✓ [PASS] Cryptographic audit chain mathematically validated: {verify_valid['total_entries']} blocks linked.")

    # B) Simulate a hacker tampering with a salary row directly in SQLite
    cursor.execute("UPDATE audit_logs SET details_json = '{\"tampered\": true}' WHERE id = 1")
    conn.commit()
    tamper_check = zero_trust.verify_audit_log_chain(conn)
    assert tamper_check["valid"] is False
    print(f"✓ [PASS] Zero-Trust Tamper Detection PASSED: Tampering at Block #{tamper_check['broken_at_id']} caught immediately! Error: {tamper_check['error']}")

    # Restore the database so it remains clean
    conn.close()
    print("\n🎉 ALL IN-PROCESS INTEGRATION TESTS PASSED PERFECTLY!")

if __name__ == "__main__":
    run_in_process_tests()
