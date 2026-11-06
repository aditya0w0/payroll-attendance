"""
High-Performance Zero-Dependency Web Server for Payroll Attendance System.
Built with Python 3 standard library ThreadingHTTPServer.
"""

import json
import mimetypes
import os
import re
import sqlite3
import traceback
from datetime import datetime, timedelta
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import auth
import database
import payroll
import zero_trust

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
HOST = "0.0.0.0"
PORT = 8000

class PayrollRequestHandler(BaseHTTPRequestHandler):
    server_version = "ZeroTrustPayroll/1.0"

    def log_message(self, format, *args):
        # Concise logging
        print(f"[{datetime.utcnow().strftime('%H:%M:%S')}] {self.command} {self.path} - {args[0]}")

    def send_json(self, data, status=HTTPStatus.OK):
        payload = json.dumps(data, indent=2, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Device-Id, X-Device-Name")
        self.end_headers()
        self.wfile.write(payload)

    def send_error_json(self, message, status=HTTPStatus.BAD_REQUEST, extra=None):
        data = {"error": message, "status": status.value}
        if extra:
            data.update(extra)
        self.send_json(data, status=status)

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Device-Id, X-Device-Name")
        self.end_headers()

    def get_bearer_token(self) -> str:
        auth_header = self.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            return auth_header[7:].strip()
        # Fallback to query param or cookie
        cookie_header = self.headers.get("Cookie", "")
        for item in cookie_header.split(";"):
            if item.strip().startswith("session="):
                return item.strip()[8:]
        return ""

    def get_current_user(self):
        token = self.get_bearer_token()
        session = auth.get_session(token)
        if not session:
            return None
        conn = database.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE id = ?", (session["user_id"],))
        user = cursor.fetchone()
        conn.close()
        if not user or user["status"] != "ACTIVE":
            return None
        user_dict = dict(user)
        del user_dict["password_hash"]
        del user_dict["salt"]
        user_dict["token"] = token
        return user_dict

    def read_json_body(self):
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length <= 0:
            return {}
        body = self.rfile.read(content_length).decode("utf-8")
        try:
            return json.loads(body)
        except Exception:
            return {}

    def get_client_ip(self):
        # Support X-Forwarded-For if behind reverse proxy
        xff = self.headers.get("X-Forwarded-For")
        if xff:
            return xff.split(",")[0].strip()
        return self.client_address[0]

    def get_user_agent(self):
        return self.headers.get("User-Agent", "Unknown Browser")

    # -------------------------------------------------------------
    # GET Router
    # -------------------------------------------------------------
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        # Static assets
        if path == "/" or not path.startswith("/api/"):
            self.serve_static(path)
            return

        # API Routes
        try:
            # 1. Check current logged-in user
            if path == "/api/auth/me":
                user = self.get_current_user()
                if not user:
                    self.send_error_json("Unauthenticated", HTTPStatus.UNAUTHORIZED)
                    return
                self.send_json({"user": user})
                return

            # 2. System status / info
            if path == "/api/system/info":
                conn = database.get_db_connection()
                cursor = conn.cursor()
                cursor.execute("SELECT COUNT(*) FROM users")
                u_cnt = cursor.fetchone()[0]
                cursor.execute("SELECT COUNT(*) FROM audit_logs")
                a_cnt = cursor.fetchone()[0]
                cursor.execute("SELECT COUNT(*) FROM device_unlock_requests WHERE status = 'PENDING'")
                p_cnt = cursor.fetchone()[0]
                conn.close()
                self.send_json({
                    "app_name": "Zero-Trust Payroll Attendance Engine",
                    "version": "1.0.0",
                    "time": datetime.utcnow().isoformat() + "Z",
                    "user_count": u_cnt,
                    "audit_log_count": a_cnt,
                    "pending_unlock_count": p_cnt
                })
                return

            # Owner or Employee: Today's attendance
            if path == "/api/attendance/today":
                user = self.get_current_user()
                if not user:
                    self.send_error_json("Unauthenticated", HTTPStatus.UNAUTHORIZED)
                    return
                today_str = datetime.utcnow().strftime("%Y-%m-%d")
                conn = database.get_db_connection()
                cursor = conn.cursor()

                if user["role"] == "owner":
                    cursor.execute("""
                        SELECT a.*, u.name as employee_name, u.email as employee_email,
                               u.monthly_salary, u.work_start_time, u.grace_period_mins
                        FROM users u
                        LEFT JOIN attendance a ON u.id = a.user_id AND a.date = ?
                        WHERE u.role = 'employee'
                        ORDER BY u.name ASC
                    """, (today_str,))
                    rows = [dict(r) for r in cursor.fetchall()]
                    conn.close()
                    self.send_json({"today": today_str, "attendances": rows})
                else:
                    cursor.execute("""
                        SELECT * FROM attendance WHERE user_id = ? AND date = ?
                    """, (user["id"], today_str))
                    row = cursor.fetchone()
                    conn.close()
                    self.send_json({"today": today_str, "attendance": dict(row) if row else None})
                return

            # Attendance History
            if path == "/api/attendance/history":
                user = self.get_current_user()
                if not user:
                    self.send_error_json("Unauthenticated", HTTPStatus.UNAUTHORIZED)
                    return
                target_user_id = user["id"]
                if user["role"] == "owner" and "user_id" in query:
                    target_user_id = int(query["user_id"][0])

                month_filter = query.get("month", [datetime.utcnow().strftime("%Y-%m")])[0]

                conn = database.get_db_connection()
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT a.*, u.name as employee_name, u.email as employee_email
                    FROM attendance a
                    JOIN users u ON a.user_id = u.id
                    WHERE a.user_id = ? AND a.date LIKE ?
                    ORDER BY a.date DESC
                """, (target_user_id, f"{month_filter}%"))
                records = [dict(r) for r in cursor.fetchall()]
                conn.close()
                self.send_json({"month": month_filter, "records": records})
                return

            # OWNER ONLY: List all employees
            if path == "/api/owner/employees":
                user = self.get_current_user()
                if not user or user["role"] != "owner":
                    self.send_error_json("Owner authorization required", HTTPStatus.FORBIDDEN)
                    return
                conn = database.get_db_connection()
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT id, email, name, role, monthly_salary, working_days_per_month,
                           work_start_time, work_end_time, grace_period_mins,
                           deduction_percentage, deduction_mode, bound_device_id,
                           bound_device_name, device_bound_at, status, created_at, updated_at
                    FROM users
                    ORDER BY role DESC, name ASC
                """)
                employees = [dict(r) for r in cursor.fetchall()]
                for emp in employees:
                    emp["daily_rate"] = payroll.calculate_daily_rate(emp["monthly_salary"], emp["working_days_per_month"])
                conn.close()
                self.send_json({"employees": employees})
                return

            # OWNER ONLY: List audit logs
            if path == "/api/owner/audit-logs":
                user = self.get_current_user()
                if not user or user["role"] != "owner":
                    self.send_error_json("Owner authorization required", HTTPStatus.FORBIDDEN)
                    return
                limit = int(query.get("limit", [100])[0])
                action_filter = query.get("action", [None])[0]

                conn = database.get_db_connection()
                cursor = conn.cursor()
                if action_filter:
                    cursor.execute("""
                        SELECT * FROM audit_logs WHERE action_type = ? ORDER BY id DESC LIMIT ?
                    """, (action_filter, limit))
                else:
                    cursor.execute("""
                        SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?
                    """, (limit,))
                logs = [dict(r) for r in cursor.fetchall()]
                # Parse details_json for easy UI display
                for lg in logs:
                    try:
                        lg["details"] = json.loads(lg["details_json"])
                    except Exception:
                        lg["details"] = lg["details_json"]
                conn.close()
                self.send_json({"logs": logs, "total_returned": len(logs)})
                return

            # OWNER ONLY: Unlock requests
            if path == "/api/owner/unlock-requests":
                user = self.get_current_user()
                if not user or user["role"] != "owner":
                    self.send_error_json("Owner authorization required", HTTPStatus.FORBIDDEN)
                    return
                conn = database.get_db_connection()
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT r.*, u.name as employee_name, u.email as employee_email
                    FROM device_unlock_requests r
                    JOIN users u ON r.user_id = u.id
                    ORDER BY r.id DESC LIMIT 50
                """)
                reqs = [dict(r) for r in cursor.fetchall()]
                conn.close()
                self.send_json({"requests": reqs})
                return

            # OWNER ONLY: Payroll summary
            if path == "/api/owner/payroll-summary":
                user = self.get_current_user()
                if not user or user["role"] != "owner":
                    self.send_error_json("Owner authorization required", HTTPStatus.FORBIDDEN)
                    return
                month = query.get("month", [datetime.utcnow().strftime("%Y-%m")])[0]
                conn = database.get_db_connection()
                cursor = conn.cursor()

                cursor.execute("SELECT * FROM users WHERE role = 'employee' AND status = 'ACTIVE' ORDER BY name ASC")
                emps = [dict(r) for r in cursor.fetchall()]

                summaries = []
                for emp in emps:
                    cursor.execute("""
                        SELECT * FROM attendance WHERE user_id = ? AND date LIKE ? ORDER BY date ASC
                    """, (emp["id"], f"{month}%"))
                    att_records = [dict(r) for r in cursor.fetchall()]
                    summary = payroll.compute_monthly_payroll_summary(emp, att_records, month)
                    summaries.append(summary)

                conn.close()
                self.send_json({"month": month, "summaries": summaries})
                return

            # Employee's own payroll summary
            if path == "/api/employee/my-payroll":
                user = self.get_current_user()
                if not user:
                    self.send_error_json("Unauthenticated", HTTPStatus.UNAUTHORIZED)
                    return
                month = query.get("month", [datetime.utcnow().strftime("%Y-%m")])[0]
                conn = database.get_db_connection()
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT * FROM attendance WHERE user_id = ? AND date LIKE ? ORDER BY date ASC
                """, (user["id"], f"{month}%"))
                att_records = [dict(r) for r in cursor.fetchall()]
                summary = payroll.compute_monthly_payroll_summary(user, att_records, month)
                conn.close()
                self.send_json({"summary": summary})
                return

            self.send_error_json("Endpoint not found", HTTPStatus.NOT_FOUND)

        except Exception as e:
            traceback.print_exc()
            self.send_error_json(str(e), HTTPStatus.INTERNAL_SERVER_ERROR)

    # -------------------------------------------------------------
    # POST Router
    # -------------------------------------------------------------
    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        body = self.read_json_body()
        ip = self.get_client_ip()
        ua = self.get_user_agent()

        try:
            # 1. Login
            if path == "/api/auth/login":
                email = body.get("email", "").strip().lower()
                password = body.get("password", "")
                device_id = body.get("device_id") or self.headers.get("X-Device-Id") or "default_browser_terminal"
                device_name = body.get("device_name") or self.headers.get("X-Device-Name") or "Web Browser"

                if not email or not password:
                    self.send_error_json("Email and password are required")
                    return

                token, user_dict, err_msg, extra = auth.authenticate_user(
                    email=email,
                    password=password,
                    device_id=device_id,
                    device_name=device_name,
                    ip_address=ip,
                    user_agent=ua
                )

                if err_msg == "DEVICE_LOCKED":
                    self.send_error_json(
                        "DEVICE_LOCKED",
                        HTTPStatus.LOCKED,
                        extra=extra
                    )
                    return

                if not token:
                    self.send_error_json(err_msg or "Authentication failed", HTTPStatus.UNAUTHORIZED)
                    return

                self.send_json({
                    "token": token,
                    "user": user_dict,
                    "message": f"Welcome back, {user_dict['name']}!"
                })
                return

            # 2. Unlock device with code
            if path == "/api/auth/verify-unlock-code":
                email = body.get("email", "").strip().lower()
                unlock_code = body.get("unlock_code", "").strip()
                device_id = body.get("device_id") or "new_device_terminal"
                device_name = body.get("device_name") or "New Web Browser Terminal"

                if not email or not unlock_code:
                    self.send_error_json("Email and unlock code are required")
                    return

                token, user_dict, err = auth.verify_and_unlock_device(
                    email=email,
                    unlock_code=unlock_code,
                    device_id=device_id,
                    device_name=device_name,
                    ip_address=ip,
                    user_agent=ua
                )

                if not token:
                    self.send_error_json(err or "Verification failed", HTTPStatus.UNAUTHORIZED)
                    return

                self.send_json({
                    "token": token,
                    "user": user_dict,
                    "message": "Device successfully authorized and bound to your account!"
                })
                return

            # 3. Logout
            if path == "/api/auth/logout":
                token = self.get_bearer_token()
                user = self.get_current_user()
                auth.destroy_session(token)
                if user:
                    conn = database.get_db_connection()
                    zero_trust.record_audit_log(
                        conn=conn,
                        actor_id=user["id"],
                        actor_name=user["name"],
                        actor_role=user["role"],
                        action_type="AUTH_LOGOUT",
                        resource_type="SESSION",
                        resource_id=token[:8] + "...",
                        details={"message": "User logged out successfully"},
                        ip_address=ip,
                        user_agent=ua
                    )
                    conn.close()
                self.send_json({"message": "Logged out successfully"})
                return

            # 4. Attendance Clock In
            if path == "/api/attendance/clock-in":
                user = self.get_current_user()
                if not user:
                    self.send_error_json("Unauthenticated", HTTPStatus.UNAUTHORIZED)
                    return

                device_id = body.get("device_id") or self.headers.get("X-Device-Id") or "unknown"
                device_name = body.get("device_name") or self.headers.get("X-Device-Name") or "Terminal"

                # Enforce device match for employees
                if user["role"] == "employee":
                    if user["bound_device_id"] and user["bound_device_id"] != device_id:
                        self.send_error_json(
                            "DEVICE_MISMATCH: Attendance punch blocked. Clock-ins must occur from your authorized device.",
                            HTTPStatus.FORBIDDEN
                        )
                        return

                # Check if already clocked in today
                # Support simulated clock-in time for demo/testing or real current time
                custom_time_str = body.get("simulated_time")
                if custom_time_str:
                    try:
                        clock_in_dt = datetime.fromisoformat(custom_time_str.replace("Z", ""))
                    except Exception:
                        clock_in_dt = datetime.utcnow()
                else:
                    clock_in_dt = datetime.utcnow()

                date_str = clock_in_dt.strftime("%Y-%m-%d")
                clock_in_iso = clock_in_dt.isoformat() + "Z"

                conn = database.get_db_connection()
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM attendance WHERE user_id = ? AND date = ?", (user["id"], date_str))
                existing = cursor.fetchone()
                if existing:
                    conn.close()
                    self.send_error_json(f"You have already clocked in today at {existing['clock_in']}.")
                    return

                # Calculate daily salary and evaluate late penalty
                monthly_salary = float(user.get("monthly_salary", 3000.0))
                work_days = int(user.get("working_days_per_month", 22))
                daily_rate = payroll.calculate_daily_rate(monthly_salary, work_days)

                sched_start = user.get("work_start_time", "09:00")
                sched_end = user.get("work_end_time", "17:00")
                grace_mins = int(user.get("grace_period_mins", 10))
                ded_mode = user.get("deduction_mode", "FULL_DAILY")
                ded_pct = float(user.get("deduction_percentage", 100.0))

                eval_result = payroll.evaluate_clock_in(
                    clock_in_dt=clock_in_dt,
                    scheduled_start_str=sched_start,
                    grace_period_mins=grace_mins,
                    daily_salary_rate=daily_rate,
                    deduction_mode=ded_mode,
                    deduction_percentage=ded_pct
                )

                cursor.execute("""
                    INSERT INTO attendance (
                        user_id, date, clock_in, scheduled_start, scheduled_end,
                        status, late_minutes, monthly_salary_snapshot, daily_salary_rate,
                        deduction_amount, net_daily_earned, device_id, device_name,
                        ip_address, notes, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    user["id"], date_str, clock_in_iso, sched_start, sched_end,
                    eval_result["status"], eval_result["late_minutes"],
                    monthly_salary, daily_rate,
                    eval_result["deduction_amount"], eval_result["net_daily_earned"],
                    device_id, device_name, ip,
                    eval_result["rule_applied"], clock_in_iso, clock_in_iso
                ))
                conn.commit()

                # Audit logging
                action_type = "CLOCK_IN_LATE_DEDUCTION_APPLIED" if eval_result["is_late"] else "CLOCK_IN_ON_TIME"
                zero_trust.record_audit_log(
                    conn=conn,
                    actor_id=user["id"],
                    actor_name=user["name"],
                    actor_role=user["role"],
                    action_type=action_type,
                    resource_type="ATTENDANCE",
                    resource_id=f"{user['id']}_{date_str}",
                    details={
                        "employee": user["name"],
                        "date": date_str,
                        "clock_in_time": clock_in_iso,
                        "scheduled_start": sched_start,
                        "is_late": eval_result["is_late"],
                        "late_minutes": eval_result["late_minutes"],
                        "daily_rate": daily_rate,
                        "deduction_amount": eval_result["deduction_amount"],
                        "net_daily_earned": eval_result["net_daily_earned"],
                        "policy_rule": eval_result["rule_applied"],
                        "device_id": device_id,
                        "device_name": device_name
                    },
                    ip_address=ip,
                    user_agent=ua
                )
                conn.close()

                self.send_json({
                    "success": True,
                    "date": date_str,
                    "clock_in": clock_in_iso,
                    "status": eval_result["status"],
                    "is_late": eval_result["is_late"],
                    "late_minutes": eval_result["late_minutes"],
                    "daily_rate": daily_rate,
                    "deduction_amount": eval_result["deduction_amount"],
                    "net_daily_earned": eval_result["net_daily_earned"],
                    "message": eval_result["rule_applied"]
                })
                return

            # 5. Attendance Clock Out
            if path == "/api/attendance/clock-out":
                user = self.get_current_user()
                if not user:
                    self.send_error_json("Unauthenticated", HTTPStatus.UNAUTHORIZED)
                    return

                clock_out_iso = datetime.utcnow().isoformat() + "Z"
                date_str = datetime.utcnow().strftime("%Y-%m-%d")

                conn = database.get_db_connection()
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM attendance WHERE user_id = ? AND date = ?", (user["id"], date_str))
                att = cursor.fetchone()
                if not att:
                    conn.close()
                    self.send_error_json("No clock-in record found for today. Please clock in first.")
                    return

                cursor.execute("""
                    UPDATE attendance
                    SET clock_out = ?, updated_at = ?
                    WHERE id = ?
                """, (clock_out_iso, clock_out_iso, att["id"]))
                conn.commit()

                zero_trust.record_audit_log(
                    conn=conn,
                    actor_id=user["id"],
                    actor_name=user["name"],
                    actor_role=user["role"],
                    action_type="CLOCK_OUT",
                    resource_type="ATTENDANCE",
                    resource_id=f"{user['id']}_{date_str}",
                    details={
                        "employee": user["name"],
                        "date": date_str,
                        "clock_out_time": clock_out_iso
                    },
                    ip_address=ip,
                    user_agent=ua
                )
                conn.close()

                self.send_json({
                    "success": True,
                    "clock_out": clock_out_iso,
                    "message": f"Successfully clocked out at {clock_out_iso}."
                })
                return

            # 6. OWNER ONLY: Create Employee
            if path == "/api/owner/employees":
                user = self.get_current_user()
                if not user or user["role"] != "owner":
                    self.send_error_json("Owner authorization required", HTTPStatus.FORBIDDEN)
                    return

                name = body.get("name", "").strip()
                email = body.get("email", "").strip().lower()
                password = body.get("password", "employee123")
                monthly_salary = float(body.get("monthly_salary", 3000.0))
                working_days = int(body.get("working_days_per_month", 22))
                work_start = body.get("work_start_time", "09:00")
                work_end = body.get("work_end_time", "17:00")
                grace_mins = int(body.get("grace_period_mins", 10))
                ded_mode = body.get("deduction_mode", "FULL_DAILY")
                ded_pct = float(body.get("deduction_percentage", 100.0))

                if not name or not email:
                    self.send_error_json("Employee name and email are required.")
                    return

                conn = database.get_db_connection()
                cursor = conn.cursor()
                cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
                if cursor.fetchone():
                    conn.close()
                    self.send_error_json("An employee with this email already exists.")
                    return

                pwd_hash, salt = database.hash_password(password)
                now_str = datetime.utcnow().isoformat() + "Z"

                cursor.execute("""
                    INSERT INTO users (
                        email, password_hash, salt, name, role,
                        monthly_salary, working_days_per_month, work_start_time, work_end_time,
                        grace_period_mins, deduction_percentage, deduction_mode,
                        status, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, 'employee', ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
                """, (
                    email, pwd_hash, salt, name,
                    monthly_salary, working_days, work_start, work_end,
                    grace_mins, ded_pct, ded_mode,
                    now_str, now_str
                ))
                new_id = cursor.lastrowid
                conn.commit()

                daily_rate = payroll.calculate_daily_rate(monthly_salary, working_days)

                zero_trust.record_audit_log(
                    conn=conn,
                    actor_id=user["id"],
                    actor_name=user["name"],
                    actor_role=user["role"],
                    action_type="EMPLOYEE_CREATED",
                    resource_type="USER_ACCOUNT",
                    resource_id=str(new_id),
                    details={
                        "employee_name": name,
                        "email": email,
                        "monthly_salary": monthly_salary,
                        "daily_rate": daily_rate,
                        "work_start_time": work_start,
                        "grace_period_mins": grace_mins,
                        "deduction_mode": ded_mode
                    },
                    ip_address=ip,
                    user_agent=ua
                )
                conn.close()

                self.send_json({
                    "success": True,
                    "employee_id": new_id,
                    "message": f"Employee {name} successfully created with ${monthly_salary:.2f}/mo."
                })
                return

            # 7. OWNER ONLY: Verify Zero Trust Cryptographic Chain
            if path == "/api/owner/verify-audit-chain":
                user = self.get_current_user()
                if not user or user["role"] != "owner":
                    self.send_error_json("Owner authorization required", HTTPStatus.FORBIDDEN)
                    return

                conn = database.get_db_connection()
                verification = zero_trust.verify_audit_log_chain(conn)

                # Record that integrity check was performed
                zero_trust.record_audit_log(
                    conn=conn,
                    actor_id=user["id"],
                    actor_name=user["name"],
                    actor_role=user["role"],
                    action_type="AUDIT_CHAIN_INTEGRITY_VERIFIED",
                    resource_type="CRYPTOGRAPHIC_LEDGER",
                    resource_id="ALL",
                    details={
                        "verified_entries": verification.get("total_entries", 0),
                        "status": "VALID" if verification.get("valid") else "TAMPERED",
                        "last_hash": verification.get("last_verified_hash")
                    },
                    ip_address=ip,
                    user_agent=ua
                )
                conn.close()

                self.send_json(verification)
                return

            # 8. OWNER ONLY: Generate One-Time Unlock Code for an employee
            if path == "/api/owner/generate-unlock-code":
                user = self.get_current_user()
                if not user or user["role"] != "owner":
                    self.send_error_json("Owner authorization required", HTTPStatus.FORBIDDEN)
                    return

                emp_id = int(body.get("employee_id"))
                conn = database.get_db_connection()
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM users WHERE id = ?", (emp_id,))
                emp = cursor.fetchone()
                if not emp:
                    conn.close()
                    self.send_error_json("Employee not found")
                    return

                req_code = f"REQ-{secrets.randbelow(9000) + 1000}"
                unlock_code = f"{secrets.randbelow(900000) + 100000}"
                now_dt = datetime.utcnow()
                exp_dt = now_dt + timedelta(minutes=30)

                cursor.execute("""
                    INSERT INTO device_unlock_requests (
                        request_code, user_id, requested_device_id, requested_device_name,
                        bound_device_id, bound_device_name, unlock_code, status,
                        ip_address, user_agent, created_at, expires_at, resolved_by
                    ) VALUES (?, ?, 'PENDING_REGISTRATION', 'Authorized by Owner in Admin Panel',
                              ?, ?, ?, 'PENDING', ?, ?, ?, ?, 'OWNER')
                """, (
                    req_code, emp["id"],
                    emp["bound_device_id"] or "None", emp["bound_device_name"] or "None",
                    unlock_code, ip, ua, now_dt.isoformat() + "Z", exp_dt.isoformat() + "Z"
                ))
                conn.commit()

                zero_trust.record_audit_log(
                    conn=conn,
                    actor_id=user["id"],
                    actor_name=user["name"],
                    actor_role=user["role"],
                    action_type="OWNER_GENERATED_UNLOCK_CODE",
                    resource_type="DEVICE_UNLOCK",
                    resource_id=req_code,
                    details={
                        "employee_name": emp["name"],
                        "employee_email": emp["email"],
                        "request_code": req_code,
                        "unlock_code": unlock_code,
                        "validity_minutes": 30
                    },
                    ip_address=ip,
                    user_agent=ua
                )
                conn.close()

                self.send_json({
                    "success": True,
                    "request_code": req_code,
                    "unlock_code": unlock_code,
                    "employee_name": emp["name"],
                    "expires_at": exp_dt.isoformat() + "Z",
                    "message": f"Unlock code generated! Provide code {unlock_code} to {emp['name']}."
                })
                return

            # 9. OWNER ONLY: Approve device request directly
            approve_match = re.match(r"^/api/owner/unlock-requests/(\d+)/approve$", path)
            if approve_match:
                user = self.get_current_user()
                if not user or user["role"] != "owner":
                    self.send_error_json("Owner authorization required", HTTPStatus.FORBIDDEN)
                    return

                req_id = int(approve_match.group(1))
                now_str = datetime.utcnow().isoformat() + "Z"
                conn = database.get_db_connection()
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM device_unlock_requests WHERE id = ?", (req_id,))
                req = cursor.fetchone()
                if not req:
                    conn.close()
                    self.send_error_json("Request not found")
                    return

                # Re-bind user to requested device
                cursor.execute("""
                    UPDATE users
                    SET bound_device_id = ?, bound_device_name = ?, device_bound_at = ?, updated_at = ?
                    WHERE id = ?
                """, (req["requested_device_id"], req["requested_device_name"], now_str, now_str, req["user_id"]))

                cursor.execute("""
                    UPDATE device_unlock_requests
                    SET status = 'APPROVED', resolved_at = ?, resolved_by = 'OWNER_DIRECT'
                    WHERE id = ?
                """, (now_str, req_id))
                conn.commit()

                zero_trust.record_audit_log(
                    conn=conn,
                    actor_id=user["id"],
                    actor_name=user["name"],
                    actor_role=user["role"],
                    action_type="OWNER_DIRECT_DEVICE_APPROVED",
                    resource_type="DEVICE_UNLOCK",
                    resource_id=req["request_code"],
                    details={
                        "employee_id": req["user_id"],
                        "approved_device_id": req["requested_device_id"],
                        "approved_device_name": req["requested_device_name"],
                        "action": "Device bound directly by Owner"
                    },
                    ip_address=ip,
                    user_agent=ua
                )
                conn.close()
                self.send_json({"success": True, "message": "Device binding approved directly!"})
                return

            self.send_error_json("POST Endpoint not found", HTTPStatus.NOT_FOUND)

        except Exception as e:
            traceback.print_exc()
            self.send_error_json(str(e), HTTPStatus.INTERNAL_SERVER_ERROR)

    # -------------------------------------------------------------
    # PUT Router
    # -------------------------------------------------------------
    def do_PUT(self):
        parsed = urlparse(self.path)
        path = parsed.path
        body = self.read_json_body()
        ip = self.get_client_ip()
        ua = self.get_user_agent()

        try:
            # 1. OWNER ONLY: Update Monthly Salary
            salary_match = re.match(r"^/api/owner/employees/(\d+)/salary$", path)
            if salary_match:
                user = self.get_current_user()
                if not user or user["role"] != "owner":
                    self.send_error_json("Owner authorization required", HTTPStatus.FORBIDDEN)
                    return

                emp_id = int(salary_match.group(1))
                new_salary = float(body.get("monthly_salary", 0.0))
                new_work_days = int(body.get("working_days_per_month", 22))

                if new_salary <= 0:
                    self.send_error_json("Monthly salary must be greater than 0.")
                    return

                conn = database.get_db_connection()
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM users WHERE id = ?", (emp_id,))
                emp = cursor.fetchone()
                if not emp:
                    conn.close()
                    self.send_error_json("Employee not found")
                    return

                old_salary = emp["monthly_salary"]
                old_days = emp["working_days_per_month"]
                old_daily = payroll.calculate_daily_rate(old_salary, old_days)
                new_daily = payroll.calculate_daily_rate(new_salary, new_work_days)

                now_str = datetime.utcnow().isoformat() + "Z"
                cursor.execute("""
                    UPDATE users
                    SET monthly_salary = ?, working_days_per_month = ?, updated_at = ?
                    WHERE id = ?
                """, (new_salary, new_work_days, now_str, emp_id))
                conn.commit()

                # Zero Trust Audit Log for Salary Change
                zero_trust.record_audit_log(
                    conn=conn,
                    actor_id=user["id"],
                    actor_name=user["name"],
                    actor_role=user["role"],
                    action_type="SALARY_MODIFIED",
                    resource_type="EMPLOYEE_COMPENSATION",
                    resource_id=str(emp_id),
                    details={
                        "employee_name": emp["name"],
                        "employee_email": emp["email"],
                        "previous_monthly_salary": old_salary,
                        "new_monthly_salary": new_salary,
                        "salary_change_delta": round(new_salary - old_salary, 2),
                        "previous_daily_rate": old_daily,
                        "new_daily_rate": new_daily,
                        "working_days": new_work_days,
                        "reason": body.get("reason", "Owner compensation adjustment")
                    },
                    ip_address=ip,
                    user_agent=ua
                )
                conn.close()

                self.send_json({
                    "success": True,
                    "employee_id": emp_id,
                    "monthly_salary": new_salary,
                    "daily_rate": new_daily,
                    "message": f"Successfully updated monthly salary for {emp['name']} to ${new_salary:.2f} (Daily rate: ${new_daily:.2f}/day)."
                })
                return

            # 2. OWNER ONLY: Update Work Hours & Deduction Rules
            rules_match = re.match(r"^/api/owner/employees/(\d+)/rules$", path)
            if rules_match:
                user = self.get_current_user()
                if not user or user["role"] != "owner":
                    self.send_error_json("Owner authorization required", HTTPStatus.FORBIDDEN)
                    return

                emp_id = int(rules_match.group(1))
                work_start = body.get("work_start_time", "09:00")
                work_end = body.get("work_end_time", "17:00")
                grace_mins = int(body.get("grace_period_mins", 10))
                ded_mode = body.get("deduction_mode", "FULL_DAILY")
                ded_pct = float(body.get("deduction_percentage", 100.0))

                conn = database.get_db_connection()
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM users WHERE id = ?", (emp_id,))
                emp = cursor.fetchone()
                if not emp:
                    conn.close()
                    self.send_error_json("Employee not found")
                    return

                now_str = datetime.utcnow().isoformat() + "Z"
                cursor.execute("""
                    UPDATE users
                    SET work_start_time = ?, work_end_time = ?, grace_period_mins = ?,
                        deduction_mode = ?, deduction_percentage = ?, updated_at = ?
                    WHERE id = ?
                """, (work_start, work_end, grace_mins, ded_mode, ded_pct, now_str, emp_id))
                conn.commit()

                zero_trust.record_audit_log(
                    conn=conn,
                    actor_id=user["id"],
                    actor_name=user["name"],
                    actor_role=user["role"],
                    action_type="ATTENDANCE_RULES_UPDATED",
                    resource_type="EMPLOYEE_POLICY",
                    resource_id=str(emp_id),
                    details={
                        "employee_name": emp["name"],
                        "work_start_time": work_start,
                        "work_end_time": work_end,
                        "grace_period_mins": grace_mins,
                        "deduction_mode": ded_mode,
                        "deduction_percentage": ded_pct
                    },
                    ip_address=ip,
                    user_agent=ua
                )
                conn.close()

                self.send_json({
                    "success": True,
                    "message": f"Updated attendance rules for {emp['name']}: Start at {work_start}, {grace_mins}m grace period, deduction: {ded_mode}."
                })
                return

            # 3. OWNER ONLY: Reset Bound Device
            reset_match = re.match(r"^/api/owner/employees/(\d+)/reset-device$", path)
            if reset_match:
                user = self.get_current_user()
                if not user or user["role"] != "owner":
                    self.send_error_json("Owner authorization required", HTTPStatus.FORBIDDEN)
                    return

                emp_id = int(reset_match.group(1))
                conn = database.get_db_connection()
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM users WHERE id = ?", (emp_id,))
                emp = cursor.fetchone()
                if not emp:
                    conn.close()
                    self.send_error_json("Employee not found")
                    return

                now_str = datetime.utcnow().isoformat() + "Z"
                old_dev = emp["bound_device_name"] or emp["bound_device_id"] or "None"

                cursor.execute("""
                    UPDATE users
                    SET bound_device_id = NULL, bound_device_name = NULL, device_bound_at = NULL, updated_at = ?
                    WHERE id = ?
                """, (now_str, emp_id))

                # Expire any pending unlock requests
                cursor.execute("""
                    UPDATE device_unlock_requests
                    SET status = 'EXPIRED' WHERE user_id = ? AND status = 'PENDING'
                """, (emp_id,))
                conn.commit()

                zero_trust.record_audit_log(
                    conn=conn,
                    actor_id=user["id"],
                    actor_name=user["name"],
                    actor_role=user["role"],
                    action_type="OWNER_RESET_DEVICE_BINDING",
                    resource_type="USER_DEVICE",
                    resource_id=str(emp_id),
                    details={
                        "employee_name": emp["name"],
                        "revoked_device": old_dev,
                        "action": "Owner cleared single device binding. Employee can bind a new device on next login."
                    },
                    ip_address=ip,
                    user_agent=ua
                )
                conn.close()

                self.send_json({
                    "success": True,
                    "message": f"Device binding reset for {emp['name']}. Next login will register their new device."
                })
                return

            self.send_error_json("PUT Endpoint not found", HTTPStatus.NOT_FOUND)

        except Exception as e:
            traceback.print_exc()
            self.send_error_json(str(e), HTTPStatus.INTERNAL_SERVER_ERROR)

    # -------------------------------------------------------------
    # Static File Server
    # -------------------------------------------------------------
    def serve_static(self, req_path):
        clean_path = req_path.lstrip("/")
        if not clean_path:
            clean_path = "index.html"

        # Prevent directory traversal
        target_file = os.path.normpath(os.path.join(STATIC_DIR, clean_path))
        if not target_file.startswith(STATIC_DIR):
            self.send_error_json("Access forbidden", HTTPStatus.FORBIDDEN)
            return

        if not os.path.exists(target_file) or os.path.isdir(target_file):
            target_file = os.path.join(STATIC_DIR, "index.html")

        mime_type, _ = mimetypes.guess_type(target_file)
        if not mime_type:
            mime_type = "application/octet-stream"

        try:
            with open(target_file, "rb") as f:
                content = f.read()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", f"{mime_type}; charset=utf-8" if "text" in mime_type or "javascript" in mime_type or "json" in mime_type else mime_type)
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error_json(str(e), HTTPStatus.INTERNAL_SERVER_ERROR)

def run(host=HOST, port=PORT):
    database.init_db()
    server_address = (host, port)
    httpd = ThreadingHTTPServer(server_address, PayrollRequestHandler)
    print(f"\n=======================================================")
    print(f"  Zero-Trust Payroll Attendance Web Server Running!")
    print(f"  Local URL: http://localhost:{port}")
    print(f"  Network:   http://{host}:{port}")
    print(f"  Owner:     owner@company.com  (Pass: admin123)")
    print(f"  Employee:  alice@company.com  (Pass: employee123)")
    print(f"             bob@company.com    (Pass: employee123)")
    print(f"=======================================================\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server gracefully...")
        httpd.server_close()

if __name__ == "__main__":
    run()
