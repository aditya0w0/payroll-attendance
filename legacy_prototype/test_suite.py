"""
End-to-End Automated Verification Test Suite for Payroll Attendance System.
Tests:
1. Server launch and static file delivery.
2. Owner authentication and monthly salary setting.
3. Zero-Trust Cryptographic Audit Log chaining.
4. Employee late punch with daily salary deduction.
5. Single-device lock enforcement against bypass attempt.
6. Owner unlock code generation and device re-binding.
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE_URL = "http://127.0.0.1:8000"

def request_json(path, method="GET", payload=None, token=None, headers_extra=None):
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if headers_extra:
        headers.update(headers_extra)

    data = json.dumps(payload).encode("utf-8") if payload else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, json.loads(body)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, {"raw": body}

def run_tests():
    print("=== STARTING ZERO-TRUST PAYROLL TEST SUITE ===")

    # 1. Test Static files
    req = urllib.request.Request(f"{BASE_URL}/")
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        html = resp.read().decode("utf-8")
        assert "CyberGuard Payroll" in html
    print("✓ [PASS] Static HTML UI served successfully.")

    # 2. Owner Login
    status, res = request_json("/api/auth/login", method="POST", payload={
        "email": "owner@company.com",
        "password": "admin123",
        "device_id": "owner_test_device",
        "device_name": "Owner Admin Terminal"
    })
    assert status == 200, f"Owner login failed: {res}"
    owner_token = res["token"]
    print("✓ [PASS] Owner authenticated successfully.")

    # 3. Owner sets monthly salary for employee
    status, emp_res = request_json("/api/owner/employees", method="GET", token=owner_token)
    assert status == 200
    emps = [e for e in emp_res["employees"] if e["role"] == "employee"]
    alice = next(e for e in emps if e["email"] == "alice@company.com")
    old_sal = alice["monthly_salary"]
    new_sal = 3960.0

    status, sal_res = request_json(f"/api/owner/employees/{alice['id']}/salary", method="PUT", payload={
        "monthly_salary": new_sal,
        "working_days_per_month": 22,
        "reason": "Test salary increase"
    }, token=owner_token)
    assert status == 200, f"Salary update failed: {sal_res}"
    assert sal_res["monthly_salary"] == new_sal
    assert sal_res["daily_rate"] == 180.0
    print(f"✓ [PASS] Owner set monthly salary: ${old_sal} -> ${new_sal} (Daily rate: $180.00/day).")

    # 4. Zero-Trust Audit Log check: Verify SALARY_MODIFIED is logged with cryptographic hash
    status, audit_res = request_json("/api/owner/audit-logs?limit=5", method="GET", token=owner_token)
    assert status == 200
    latest_log = audit_res["logs"][0]
    assert latest_log["action_type"] == "SALARY_MODIFIED"
    assert latest_log["actor_name"] == "Alex Vance (Owner)"
    assert len(latest_log["entry_hash"]) == 64
    print(f"✓ [PASS] Zero Trust audit ledger logged mutation with SHA-256: {latest_log['entry_hash'][:16]}...")

    # 5. Cryptographic chain integrity validation
    status, verify_res = request_json("/api/owner/verify-audit-chain", method="POST", token=owner_token)
    assert status == 200
    assert verify_res["valid"] is True, f"Integrity check failed: {verify_res}"
    print(f"✓ [PASS] Cryptographic ledger verified 100% valid across {verify_res['total_entries']} chained blocks.")

    # 6. Single-Device Security Policy: Authorized vs Rogue Device
    # First, test Bob login (Bob is unbound, so first login should auto-bind)
    status, bob_res = request_json("/api/auth/login", method="POST", payload={
        "email": "bob@company.com",
        "password": "employee123",
        "device_id": "bobs_laptop_device_01",
        "device_name": "Bob's Work Laptop"
    })
    assert status == 200
    bob_token = bob_res["token"]
    print("✓ [PASS] Bob's first login auto-bound his device: bobs_laptop_device_01.")

    # Now Bob attempts to log in from a second / rogue device
    status, rogue_res = request_json("/api/auth/login", method="POST", payload={
        "email": "bob@company.com",
        "password": "employee123",
        "device_id": "bobs_unauthorized_phone",
        "device_name": "Bob's Personal Phone (Unauthorized)"
    })
    assert status == 423, f"Rogue device should be HTTP 423 Locked, got: {status}"
    assert rogue_res["error"] == "DEVICE_LOCKED"
    req_code = rogue_res["request_code"]
    print(f"✓ [PASS] Single-device lock blocked second device! Request ID: {req_code}.")

    # 7. Owner views pending unlock request and gets unlock code
    status, unlock_res = request_json("/api/owner/unlock-requests", method="GET", token=owner_token)
    assert status == 200
    pending_req = next(r for r in unlock_res["requests"] if r["request_code"] == req_code)
    unlock_code = pending_req["unlock_code"]
    print(f"✓ [PASS] Owner retrieved 6-digit Unlock Code from dashboard: {unlock_code}.")

    # 8. Employee submits unlock code to authorize new device
    status, verify_unlock_res = request_json("/api/auth/verify-unlock-code", method="POST", payload={
        "email": "bob@company.com",
        "unlock_code": unlock_code,
        "device_id": "bobs_unauthorized_phone",
        "device_name": "Bob's New Authorized Phone"
    })
    assert status == 200, f"Unlock verification failed: {verify_unlock_res}"
    new_bob_token = verify_unlock_res["token"]
    assert verify_unlock_res["user"]["bound_device_id"] == "bobs_unauthorized_phone"
    print("✓ [PASS] Device successfully authorized and re-bound using Owner unlock code.")

    # 9. Attendance Punch & Late Deduction Test
    # Test late punch (simulated clock-in at 09:35, scheduled 09:00 + 10m grace)
    status, clock_res = request_json("/api/attendance/clock-in", method="POST", payload={
        "simulated_time": "2026-11-06T09:35:00Z",
        "device_id": "bobs_unauthorized_phone",
        "device_name": "Bob's New Authorized Phone"
    }, token=new_bob_token)
    assert status == 200, f"Clock-in failed: {clock_res}"
    assert clock_res["is_late"] is True
    assert clock_res["status"] == "LATE"
    assert clock_res["late_minutes"] == 35
    assert clock_res["deduction_amount"] == clock_res["daily_rate"]
    assert clock_res["net_daily_earned"] == 0.0
    print(f"✓ [PASS] Late clock-in evaluated: 35m late, Daily rate ${clock_res['daily_rate']} fully deducted (-${clock_res['deduction_amount']}).")

    # 10. Verify Payroll Summary reflects deductions
    status, pay_res = request_json("/api/owner/payroll-summary?month=2026-11", method="GET", token=owner_token)
    assert status == 200
    bob_summary = next(s for s in pay_res["summaries"] if s["email"] == "bob@company.com")
    assert bob_summary["days_late"] >= 1
    assert bob_summary["total_late_deductions"] > 0
    print(f"✓ [PASS] Payroll Summary calculated: Bob has {bob_summary['days_late']} late days with ${bob_summary['total_late_deductions']} deducted.")

    # 11. Final Zero-Trust Chain Check after all mutations
    status, final_verify = request_json("/api/owner/verify-audit-chain", method="POST", token=owner_token)
    assert status == 200
    assert final_verify["valid"] is True
    print(f"✓ [PASS] Final Zero-Trust Audit Chain fully verified with {final_verify['total_entries']} immutable blocks!")

    print("\n🎉 ALL TESTS PASSED SUCCESSFULLY! The system is 100% operational.")

if __name__ == "__main__":
    run_tests()
