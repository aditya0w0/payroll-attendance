"""
Authentication, Session Management & Single-Device Enforcement Engine.
"""

import json
import secrets
import sqlite3
from datetime import datetime, timedelta
from typing import Any, Dict, Optional, Tuple
from database import get_db_connection, verify_password
from zero_trust import record_audit_log

# In-memory active session registry: token -> session dict
ACTIVE_SESSIONS: Dict[str, Dict[str, Any]] = {}
SESSION_TTL_HOURS = 24

def create_session(user_row: sqlite3.Row, device_id: str) -> str:
    """Generates and registers a new secure session token."""
    token = secrets.token_hex(32)
    now = datetime.utcnow()
    expires_at = now + timedelta(hours=SESSION_TTL_HOURS)

    ACTIVE_SESSIONS[token] = {
        "user_id": user_row["id"],
        "email": user_row["email"],
        "name": user_row["name"],
        "role": user_row["role"],
        "device_id": device_id,
        "created_at": now.isoformat() + "Z",
        "expires_at": expires_at.isoformat() + "Z"
    }
    return token

def get_session(token: Optional[str]) -> Optional[Dict[str, Any]]:
    """Retrieves active session if valid and unexpired."""
    if not token or token not in ACTIVE_SESSIONS:
        return None
    session = ACTIVE_SESSIONS[token]
    exp = datetime.fromisoformat(session["expires_at"].replace("Z", ""))
    if datetime.utcnow() > exp:
        del ACTIVE_SESSIONS[token]
        return None
    return session

def destroy_session(token: Optional[str]) -> bool:
    """Removes a session token upon logout."""
    if token and token in ACTIVE_SESSIONS:
        del ACTIVE_SESSIONS[token]
        return True
    return False

def authenticate_user(
    email: str,
    password: str,
    device_id: str,
    device_name: str,
    ip_address: str = "127.0.0.1",
    user_agent: str = "Unknown"
) -> Tuple[Optional[str], Optional[Dict[str, Any]], Optional[str], Optional[Dict[str, Any]]]:
    """
    Validates user credentials and enforces Single-Device Policy for employees.
    Returns: (token, user_data, error_message, extra_payload)
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM users WHERE email = ?", (email.strip().lower(),))
    user = cursor.fetchone()

    if not user:
        record_audit_log(
            conn=conn,
            actor_id=None,
            actor_name=email,
            actor_role="anonymous",
            action_type="AUTH_LOGIN_FAILED_UNKNOWN_USER",
            resource_type="USER_ACCOUNT",
            resource_id=email,
            details={"email": email, "attempted_device": device_name, "reason": "User not found"},
            ip_address=ip_address,
            user_agent=user_agent
        )
        conn.close()
        return None, None, "Invalid email or password", None

    # Check password
    if not verify_password(password, user["password_hash"], user["salt"]):
        record_audit_log(
            conn=conn,
            actor_id=user["id"],
            actor_name=user["name"],
            actor_role=user["role"],
            action_type="AUTH_LOGIN_FAILED_WRONG_PASSWORD",
            resource_type="USER_ACCOUNT",
            resource_id=str(user["id"]),
            details={"email": email, "attempted_device": device_name, "reason": "Incorrect password"},
            ip_address=ip_address,
            user_agent=user_agent
        )
        conn.close()
        return None, None, "Invalid email or password", None

    if user["status"] != "ACTIVE":
        conn.close()
        return None, None, f"Account is {user['status']}. Please contact administrator.", None

    user_dict = dict(user)
    # Strip sensitive fields
    del user_dict["password_hash"]
    del user_dict["salt"]

    # SINGLE-DEVICE ENFORCEMENT FOR EMPLOYEES
    if user["role"] == "employee":
        bound_dev_id = user["bound_device_id"]

        # Case 1: First login on an unbound account -> Auto-bind device
        if not bound_dev_id:
            now_iso = datetime.utcnow().isoformat() + "Z"
            cursor.execute("""
                UPDATE users
                SET bound_device_id = ?, bound_device_name = ?, device_bound_at = ?, updated_at = ?
                WHERE id = ?
            """, (device_id, device_name, now_iso, now_iso, user["id"]))
            conn.commit()

            user_dict["bound_device_id"] = device_id
            user_dict["bound_device_name"] = device_name
            user_dict["device_bound_at"] = now_iso

            record_audit_log(
                conn=conn,
                actor_id=user["id"],
                actor_name=user["name"],
                actor_role=user["role"],
                action_type="DEVICE_INITIAL_BINDING",
                resource_type="USER_DEVICE",
                resource_id=device_id,
                details={
                    "device_id": device_id,
                    "device_name": device_name,
                    "message": "Device successfully registered as the sole authorized terminal."
                },
                ip_address=ip_address,
                user_agent=user_agent
            )

        # Case 2: Attempted login on an unauthorized device (Device mismatch!)
        elif bound_dev_id != device_id:
            # Check or create pending unlock request
            cursor.execute("""
                SELECT * FROM device_unlock_requests
                WHERE user_id = ? AND requested_device_id = ? AND status = 'PENDING'
                ORDER BY id DESC LIMIT 1
            """, (user["id"], device_id))
            existing_req = cursor.fetchone()

            if existing_req:
                req_code = existing_req["request_code"]
                unlock_code = existing_req["unlock_code"]
            else:
                # Create a new unlock challenge
                req_code = f"REQ-{secrets.randbelow(9000) + 1000}"
                unlock_code = f"{secrets.randbelow(900000) + 100000}" # 6-digit OTP
                now_dt = datetime.utcnow()
                exp_dt = now_dt + timedelta(minutes=30)

                cursor.execute("""
                    INSERT INTO device_unlock_requests (
                        request_code, user_id, requested_device_id, requested_device_name,
                        bound_device_id, bound_device_name, unlock_code, status,
                        ip_address, user_agent, created_at, expires_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    req_code, user["id"], device_id, device_name,
                    user["bound_device_id"], user["bound_device_name"] or "Authorized Device",
                    unlock_code, "PENDING",
                    ip_address, user_agent, now_dt.isoformat() + "Z", exp_dt.isoformat() + "Z"
                ))
                conn.commit()

                record_audit_log(
                    conn=conn,
                    actor_id=user["id"],
                    actor_name=user["name"],
                    actor_role=user["role"],
                    action_type="SECURITY_LOGIN_DEVICE_BLOCKED",
                    resource_type="DEVICE_POLICY",
                    resource_id=req_code,
                    details={
                        "employee": user["name"],
                        "bound_device_id": user["bound_device_id"],
                        "bound_device_name": user["bound_device_name"],
                        "attempted_device_id": device_id,
                        "attempted_device_name": device_name,
                        "request_code": req_code,
                        "reason": "Single-device security policy violation. Manual Owner unlock required."
                    },
                    ip_address=ip_address,
                    user_agent=user_agent
                )

            conn.close()
            # Return DEVICE_LOCKED error with challenge code
            return None, None, "DEVICE_LOCKED", {
                "request_code": req_code,
                "bound_device_name": user["bound_device_name"] or "Original Device",
                "attempted_device_name": device_name,
                "message": "Access Denied: This account is locked to a single authorized device. Please request an Unlock Code from your Owner to authorize this device."
            }

    # All security checks passed -> Issue session
    token = create_session(user, device_id)

    record_audit_log(
        conn=conn,
        actor_id=user["id"],
        actor_name=user["name"],
        actor_role=user["role"],
        action_type="AUTH_LOGIN_SUCCESS",
        resource_type="SESSION",
        resource_id=token[:8] + "...",
        details={
            "device_id": device_id,
            "device_name": device_name,
            "role": user["role"]
        },
        ip_address=ip_address,
        user_agent=user_agent
    )
    conn.close()
    return token, user_dict, None, None

def verify_and_unlock_device(
    email: str,
    unlock_code: str,
    device_id: str,
    device_name: str,
    ip_address: str = "127.0.0.1",
    user_agent: str = "Unknown"
) -> Tuple[Optional[str], Optional[Dict[str, Any]], Optional[str]]:
    """
    Validates owner-issued unlock code to bind a new device to an employee account.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM users WHERE email = ?", (email.strip().lower(),))
    user = cursor.fetchone()
    if not user:
        conn.close()
        return None, None, "User not found"

    clean_code = unlock_code.strip()
    now_iso = datetime.utcnow().isoformat() + "Z"

    cursor.execute("""
        SELECT * FROM device_unlock_requests
        WHERE user_id = ? AND unlock_code = ? AND status = 'PENDING'
        ORDER BY id DESC LIMIT 1
    """, (user["id"], clean_code))
    req = cursor.fetchone()

    if not req:
        record_audit_log(
            conn=conn,
            actor_id=user["id"],
            actor_name=user["name"],
            actor_role=user["role"],
            action_type="SECURITY_UNLOCK_FAILED_INVALID_CODE",
            resource_type="DEVICE_UNLOCK",
            resource_id=clean_code,
            details={"attempted_code": clean_code, "device_id": device_id, "device_name": device_name},
            ip_address=ip_address,
            user_agent=user_agent
        )
        conn.close()
        return None, None, "Invalid unlock code or code already used."

    # Check expiry
    exp_dt = datetime.fromisoformat(req["expires_at"].replace("Z", ""))
    if datetime.utcnow() > exp_dt:
        cursor.execute("UPDATE device_unlock_requests SET status = 'EXPIRED' WHERE id = ?", (req["id"],))
        conn.commit()
        conn.close()
        return None, None, "Unlock code has expired. Please request a new one from your Owner."

    # Code is valid! Re-bind device to user
    cursor.execute("""
        UPDATE users
        SET bound_device_id = ?, bound_device_name = ?, device_bound_at = ?, updated_at = ?
        WHERE id = ?
    """, (device_id, device_name, now_iso, now_iso, user["id"]))

    cursor.execute("""
        UPDATE device_unlock_requests
        SET status = 'USED', resolved_at = ?, resolved_by = 'OWNER_VERIFIED_CODE'
        WHERE id = ?
    """, (now_iso, req["id"]))
    conn.commit()

    record_audit_log(
        conn=conn,
        actor_id=user["id"],
        actor_name=user["name"],
        actor_role=user["role"],
        action_type="DEVICE_UNLOCKED_AND_REBOUND",
        resource_type="USER_DEVICE",
        resource_id=device_id,
        details={
            "employee": user["name"],
            "previous_device": req["bound_device_name"],
            "new_authorized_device": device_name,
            "new_device_id": device_id,
            "request_code": req["request_code"],
            "method": "Owner One-Time Unlock Code Verified"
        },
        ip_address=ip_address,
        user_agent=user_agent
    )

    # Fetch updated user and log them in
    cursor.execute("SELECT * FROM users WHERE id = ?", (user["id"],))
    updated_user = cursor.fetchone()
    user_dict = dict(updated_user)
    del user_dict["password_hash"]
    del user_dict["salt"]

    token = create_session(updated_user, device_id)
    conn.close()
    return token, user_dict, None
