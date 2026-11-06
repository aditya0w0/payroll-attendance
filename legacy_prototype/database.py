"""
Database Layer & Schema Management for Payroll Attendance System.
Uses SQLite with WAL mode and initial seed data.
"""

import hashlib
import os
import secrets
import sqlite3
from datetime import datetime, timedelta
from typing import Optional, Tuple
from zero_trust import record_audit_log

DB_PATH = os.path.join(os.path.dirname(__file__), "payroll_attendance.db")

def hash_password(password: str, salt: Optional[str] = None) -> Tuple[str, str]:
    """Hashes password using PBKDF2-HMAC-SHA256 with 100,000 iterations."""
    if not salt:
        salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000)
    return key.hex(), salt

def verify_password(password: str, stored_hash: str, salt: str) -> bool:
    """Verifies a plain text password against stored PBKDF2 hash."""
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000)
    return secrets.compare_digest(key.hex(), stored_hash)

def get_db_connection() -> sqlite3.Connection:
    """Returns a configured SQLite connection with foreign keys and WAL mode."""
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    return conn

def init_db():
    """Initializes schema and seeds baseline accounts if database is new."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.executescript("""
    CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        description TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('owner', 'employee')),
        monthly_salary REAL NOT NULL DEFAULT 3000.0,
        working_days_per_month INTEGER NOT NULL DEFAULT 22,
        work_start_time TEXT NOT NULL DEFAULT '09:00',
        work_end_time TEXT NOT NULL DEFAULT '17:00',
        grace_period_mins INTEGER NOT NULL DEFAULT 10,
        deduction_percentage REAL NOT NULL DEFAULT 100.0,
        deduction_mode TEXT NOT NULL DEFAULT 'FULL_DAILY',
        bound_device_id TEXT,
        bound_device_name TEXT,
        device_bound_at TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'LOCKED', 'SUSPENDED')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        clock_in TEXT,
        clock_out TEXT,
        scheduled_start TEXT NOT NULL,
        scheduled_end TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('ON_TIME', 'LATE', 'HALF_DAY', 'ABSENT')),
        late_minutes INTEGER NOT NULL DEFAULT 0,
        monthly_salary_snapshot REAL NOT NULL,
        daily_salary_rate REAL NOT NULL,
        deduction_amount REAL NOT NULL DEFAULT 0.0,
        net_daily_earned REAL NOT NULL,
        device_id TEXT NOT NULL,
        device_name TEXT,
        ip_address TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(user_id, date)
    );

    CREATE TABLE IF NOT EXISTS device_unlock_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_code TEXT UNIQUE NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        requested_device_id TEXT NOT NULL,
        requested_device_name TEXT,
        bound_device_id TEXT,
        bound_device_name TEXT,
        unlock_code TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED', 'USED', 'EXPIRED')),
        ip_address TEXT,
        user_agent TEXT,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        resolved_at TEXT,
        resolved_by TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        actor_id INTEGER,
        actor_name TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        action_type TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id TEXT,
        ip_address TEXT,
        user_agent TEXT,
        details_json TEXT NOT NULL,
        previous_hash TEXT NOT NULL,
        entry_hash TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_unlock_requests_user ON device_unlock_requests(user_id, status);
    """)
    conn.commit()

    # Seed initial data if users table is empty
    cursor.execute("SELECT COUNT(*) FROM users")
    count = cursor.fetchone()[0]
    if count == 0:
        _seed_initial_data(conn)
    conn.close()

def _seed_initial_data(conn: sqlite3.Connection):
    """Populates baseline settings, owner, and employee accounts."""
    now_str = datetime.utcnow().isoformat() + "Z"
    cursor = conn.cursor()

    # System settings
    settings = [
        ("currency_symbol", "$", "Currency display symbol"),
        ("company_name", "CyberGuard Logistics Corp", "Company Name"),
        ("standard_work_days", "22", "Standard working days per month"),
    ]
    cursor.executemany("INSERT OR REPLACE INTO system_settings (key, value, description) VALUES (?, ?, ?)", settings)

    # Initial Users
    # 1. Owner: owner@company.com / admin123
    owner_hash, owner_salt = hash_password("admin123")
    cursor.execute("""
        INSERT INTO users (
            email, password_hash, salt, name, role,
            monthly_salary, working_days_per_month, work_start_time, work_end_time,
            grace_period_mins, deduction_percentage, deduction_mode,
            bound_device_id, bound_device_name, device_bound_at, status,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        "owner@company.com", owner_hash, owner_salt, "Alex Vance (Owner)", "owner",
        10000.0, 22, "09:00", "17:00", 10, 0.0, "NONE",
        None, None, None, "ACTIVE", now_str, now_str
    ))
    owner_id = cursor.lastrowid

    # Record genesis audit log
    record_audit_log(
        conn=conn,
        actor_id=owner_id,
        actor_name="Alex Vance (Owner)",
        actor_role="owner",
        action_type="GENESIS_SYSTEM_INITIALIZATION",
        resource_type="SYSTEM",
        resource_id="0",
        details={
            "description": "System initialized with Zero Trust Cryptographic Ledger.",
            "company": "CyberGuard Logistics Corp",
            "security_mode": "STRICT_SINGLE_DEVICE"
        },
        ip_address="127.0.0.1",
        user_agent="System Bootstrap Engine"
    )

    # 2. Employee Alice: alice@company.com / employee123
    # Already has a bound device (Simulates registered device)
    alice_hash, alice_salt = hash_password("employee123")
    alice_dev_id = "device_alice_macbook_pro_01"
    cursor.execute("""
        INSERT INTO users (
            email, password_hash, salt, name, role,
            monthly_salary, working_days_per_month, work_start_time, work_end_time,
            grace_period_mins, deduction_percentage, deduction_mode,
            bound_device_id, bound_device_name, device_bound_at, status,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        "alice@company.com", alice_hash, alice_salt, "Alice Chen (Senior Dev)", "employee",
        3520.0, 22, "09:00", "17:00", 10, 100.0, "FULL_DAILY",
        alice_dev_id, "Alice's Authorized MacBook Pro", now_str, "ACTIVE", now_str, now_str
    ))
    alice_id = cursor.lastrowid

    record_audit_log(
        conn=conn,
        actor_id=owner_id,
        actor_name="Alex Vance (Owner)",
        actor_role="owner",
        action_type="EMPLOYEE_REGISTERED",
        resource_type="EMPLOYEE",
        resource_id=str(alice_id),
        details={
            "employee_name": "Alice Chen (Senior Dev)",
            "monthly_salary": 3520.0,
            "daily_rate": 160.0,
            "bound_device": "Alice's Authorized MacBook Pro",
            "device_id": alice_dev_id
        },
        ip_address="127.0.0.1",
        user_agent="System Bootstrap Engine"
    )

    # 3. Employee Bob: bob@company.com / employee123
    # No device bound yet (First login will trigger auto-bind)
    bob_hash, bob_salt = hash_password("employee123")
    cursor.execute("""
        INSERT INTO users (
            email, password_hash, salt, name, role,
            monthly_salary, working_days_per_month, work_start_time, work_end_time,
            grace_period_mins, deduction_percentage, deduction_mode,
            bound_device_id, bound_device_name, device_bound_at, status,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        "bob@company.com", bob_hash, bob_salt, "Bob Martinez (Operations)", "employee",
        2860.0, 22, "09:00", "17:00", 10, 100.0, "FULL_DAILY",
        None, None, None, "ACTIVE", now_str, now_str
    ))
    bob_id = cursor.lastrowid

    record_audit_log(
        conn=conn,
        actor_id=owner_id,
        actor_name="Alex Vance (Owner)",
        actor_role="owner",
        action_type="EMPLOYEE_REGISTERED",
        resource_type="EMPLOYEE",
        resource_id=str(bob_id),
        details={
            "employee_name": "Bob Martinez (Operations)",
            "monthly_salary": 2860.0,
            "daily_rate": 130.0,
            "bound_device": "UNBOUND (Awaiting First Login)"
        },
        ip_address="127.0.0.1",
        user_agent="System Bootstrap Engine"
    )

    # 4. Employee Charlie: charlie@company.com / employee123
    charlie_hash, charlie_salt = hash_password("employee123")
    charlie_dev_id = "device_charlie_iphone_15"
    cursor.execute("""
        INSERT INTO users (
            email, password_hash, salt, name, role,
            monthly_salary, working_days_per_month, work_start_time, work_end_time,
            grace_period_mins, deduction_percentage, deduction_mode,
            bound_device_id, bound_device_name, device_bound_at, status,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        "charlie@company.com", charlie_hash, charlie_salt, "Charlie Davis (Support Lead)", "employee",
        3300.0, 22, "09:00", "17:00", 15, 50.0, "HALF_DAILY",
        charlie_dev_id, "Charlie's iPhone 15 Pro", now_str, "ACTIVE", now_str, now_str
    ))
    charlie_id = cursor.lastrowid

    record_audit_log(
        conn=conn,
        actor_id=owner_id,
        actor_name="Alex Vance (Owner)",
        actor_role="owner",
        action_type="EMPLOYEE_REGISTERED",
        resource_type="EMPLOYEE",
        resource_id=str(charlie_id),
        details={
            "employee_name": "Charlie Davis (Support Lead)",
            "monthly_salary": 3300.0,
            "daily_rate": 150.0,
            "bound_device": "Charlie's iPhone 15 Pro",
            "device_id": charlie_dev_id
        },
        ip_address="127.0.0.1",
        user_agent="System Bootstrap Engine"
    )

    # Seed historical attendance records for the current month so payroll summary has real data
    # Today is Nov 6. Let's seed past days: Nov 1, 2, 3, 4, 5
    sample_records = [
        # Alice: Nov 3 On-time, Nov 4 Late (100% daily salary deducted!), Nov 5 On-time
        {
            "user_id": alice_id,
            "date": "2026-11-03",
            "clock_in": "2026-11-03T08:55:00Z",
            "clock_out": "2026-11-03T17:05:00Z",
            "status": "ON_TIME",
            "late_minutes": 0,
            "monthly_salary_snapshot": 3520.0,
            "daily_salary_rate": 160.0,
            "deduction_amount": 0.0,
            "net_daily_earned": 160.0,
            "device_id": alice_dev_id,
            "device_name": "Alice's Authorized MacBook Pro",
            "notes": "Regular shift"
        },
        {
            "user_id": alice_id,
            "date": "2026-11-04",
            "clock_in": "2026-11-04T09:34:00Z", # 24 mins late past 10m grace period
            "clock_out": "2026-11-04T17:15:00Z",
            "status": "LATE",
            "late_minutes": 24,
            "monthly_salary_snapshot": 3520.0,
            "daily_salary_rate": 160.0,
            "deduction_amount": 160.0, # 100% daily deduction
            "net_daily_earned": 0.0,
            "device_id": alice_dev_id,
            "device_name": "Alice's Authorized MacBook Pro",
            "notes": "Late clock-in (09:34 vs scheduled 09:00+10m grace). Full daily deduction applied."
        },
        {
            "user_id": alice_id,
            "date": "2026-11-05",
            "clock_in": "2026-11-05T08:58:00Z",
            "clock_out": "2026-11-05T17:02:00Z",
            "status": "ON_TIME",
            "late_minutes": 0,
            "monthly_salary_snapshot": 3520.0,
            "daily_salary_rate": 160.0,
            "deduction_amount": 0.0,
            "net_daily_earned": 160.0,
            "device_id": alice_dev_id,
            "device_name": "Alice's Authorized MacBook Pro",
            "notes": "Regular shift"
        },
        # Charlie: Nov 4 On-time, Nov 5 Late (50% deduction rule)
        {
            "user_id": charlie_id,
            "date": "2026-11-04",
            "clock_in": "2026-11-04T09:05:00Z",
            "clock_out": "2026-11-04T17:00:00Z",
            "status": "ON_TIME",
            "late_minutes": 0,
            "monthly_salary_snapshot": 3300.0,
            "daily_salary_rate": 150.0,
            "deduction_amount": 0.0,
            "net_daily_earned": 150.0,
            "device_id": charlie_dev_id,
            "device_name": "Charlie's iPhone 15 Pro",
            "notes": "Within 15m grace period"
        },
        {
            "user_id": charlie_id,
            "date": "2026-11-05",
            "clock_in": "2026-11-05T09:28:00Z", # 13 mins late past 15m grace
            "clock_out": "2026-11-05T17:00:00Z",
            "status": "LATE",
            "late_minutes": 13,
            "monthly_salary_snapshot": 3300.0,
            "daily_salary_rate": 150.0,
            "deduction_amount": 75.0, # 50% deduction
            "net_daily_earned": 75.0,
            "device_id": charlie_dev_id,
            "device_name": "Charlie's iPhone 15 Pro",
            "notes": "Late clock-in (09:28). 50% daily salary deduction applied (-$75.00)."
        }
    ]

    for rec in sample_records:
        cursor.execute("""
            INSERT INTO attendance (
                user_id, date, clock_in, clock_out, scheduled_start, scheduled_end,
                status, late_minutes, monthly_salary_snapshot, daily_salary_rate,
                deduction_amount, net_daily_earned, device_id, device_name,
                ip_address, notes, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            rec["user_id"], rec["date"], rec["clock_in"], rec["clock_out"],
            "09:00", "17:00", rec["status"], rec["late_minutes"],
            rec["monthly_salary_snapshot"], rec["daily_salary_rate"],
            rec["deduction_amount"], rec["net_daily_earned"],
            rec["device_id"], rec["device_name"], "192.168.1.10",
            rec["notes"], rec["clock_in"], rec["clock_in"]
        ))

    # Also simulate one pending unlock request so the Owner can see it immediately on first open!
    # Alice attempted to punch from an unauthorized Android phone
    pending_request_code = "REQ-9421"
    pending_unlock_code = "481920"
    exp_time = (datetime.utcnow() + timedelta(minutes=60)).isoformat() + "Z"
    cursor.execute("""
        INSERT INTO device_unlock_requests (
            request_code, user_id, requested_device_id, requested_device_name,
            bound_device_id, bound_device_name, unlock_code, status,
            ip_address, user_agent, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        pending_request_code, alice_id,
        "device_unauthorized_android_phone_99", "Suspicious Android 14 Phone (Chrome Mobile)",
        alice_dev_id, "Alice's Authorized MacBook Pro",
        pending_unlock_code, "PENDING",
        "192.168.1.88", "Mozilla/5.0 (Linux; Android 14; Pixel 8)",
        now_str, exp_time
    ))

    record_audit_log(
        conn=conn,
        actor_id=alice_id,
        actor_name="Alice Chen (Senior Dev)",
        actor_role="employee",
        action_type="SECURITY_LOGIN_DEVICE_BLOCKED",
        resource_type="DEVICE_POLICY",
        resource_id=pending_request_code,
        details={
            "employee": "Alice Chen (Senior Dev)",
            "bound_device": "Alice's Authorized MacBook Pro",
            "attempted_device": "Suspicious Android 14 Phone (Chrome Mobile)",
            "unlock_request_code": pending_request_code,
            "reason": "Single-device security policy violation. Manual Owner unlock required."
        },
        ip_address="192.168.1.88",
        user_agent="Mozilla/5.0 (Linux; Android 14; Pixel 8)"
    )

    conn.commit()
