"""
Zero-Trust Cryptographic Audit Logging Engine
Provides tamper-evident SHA-256 hash chaining (Merkle log) for every system state change.
"""

import hashlib
import json
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

GENESIS_HASH = "0" * 64

def compute_entry_hash(previous_hash: str, timestamp: str, actor_id: Optional[int], 
                       actor_name: str, actor_role: str, action_type: str, 
                       resource_type: str, resource_id: Optional[str], 
                       ip_address: str, details_json: str) -> str:
    """Computes a deterministic SHA-256 hash for a log entry chaining to previous_hash."""
    canonical_payload = (
        f"{previous_hash}|{timestamp}|{actor_id}|{actor_name}|{actor_role}|"
        f"{action_type}|{resource_type}|{resource_id}|{ip_address}|{details_json}"
    )
    return hashlib.sha256(canonical_payload.encode("utf-8")).hexdigest()

def record_audit_log(
    conn: sqlite3.Connection,
    actor_id: Optional[int],
    actor_name: str,
    actor_role: str,
    action_type: str,
    resource_type: str,
    resource_id: Optional[str],
    details: Dict[str, Any],
    ip_address: str = "127.0.0.1",
    user_agent: str = "Unknown"
) -> Tuple[int, str]:
    """
    Appends an immutable, cryptographically chained audit log entry.
    Returns (log_id, entry_hash).
    """
    timestamp = datetime.utcnow().isoformat() + "Z"
    details_json = json.dumps(details, sort_keys=True)

    cursor = conn.cursor()
    # Fetch latest entry hash
    cursor.execute("SELECT id, entry_hash FROM audit_logs ORDER BY id DESC LIMIT 1")
    last_row = cursor.fetchone()
    previous_hash = last_row[1] if last_row and last_row[1] else GENESIS_HASH

    entry_hash = compute_entry_hash(
        previous_hash=previous_hash,
        timestamp=timestamp,
        actor_id=actor_id,
        actor_name=actor_name,
        actor_role=actor_role,
        action_type=action_type,
        resource_type=resource_type,
        resource_id=str(resource_id) if resource_id is not None else None,
        ip_address=ip_address,
        details_json=details_json
    )

    cursor.execute("""
        INSERT INTO audit_logs (
            timestamp, actor_id, actor_name, actor_role,
            action_type, resource_type, resource_id,
            ip_address, user_agent, details_json,
            previous_hash, entry_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        timestamp, actor_id, actor_name, actor_role,
        action_type, resource_type, str(resource_id) if resource_id is not None else None,
        ip_address, user_agent, details_json,
        previous_hash, entry_hash
    ))
    log_id = cursor.lastrowid
    conn.commit()
    return log_id, entry_hash

def verify_audit_log_chain(conn: sqlite3.Connection) -> Dict[str, Any]:
    """
    Scans the complete audit log table and mathematically validates the hash chain.
    Detects any tampering, deletion, or modification of historical records.
    """
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, timestamp, actor_id, actor_name, actor_role,
               action_type, resource_type, resource_id,
               ip_address, details_json, previous_hash, entry_hash
        FROM audit_logs
        ORDER BY id ASC
    """)
    rows = cursor.fetchall()

    if not rows:
        return {
            "valid": True,
            "total_entries": 0,
            "message": "Audit log is empty (Genesis state).",
            "last_verified_hash": GENESIS_HASH
        }

    expected_prev = GENESIS_HASH
    for idx, row in enumerate(rows):
        (r_id, r_time, r_actor_id, r_actor_name, r_actor_role,
         r_action, r_res_type, r_res_id, r_ip, r_details,
         r_prev_hash, r_entry_hash) = row

        # 1. Verify previous hash link
        if r_prev_hash != expected_prev:
            return {
                "valid": False,
                "broken_at_id": r_id,
                "broken_at_index": idx + 1,
                "total_entries": len(rows),
                "error": f"Chain link broken at Entry #{r_id}. Expected previous hash {expected_prev[:12]}... but found {r_prev_hash[:12]}...",
                "last_verified_hash": expected_prev
            }

        # 2. Recompute entry hash
        computed_hash = compute_entry_hash(
            previous_hash=r_prev_hash,
            timestamp=r_time,
            actor_id=r_actor_id,
            actor_name=r_actor_name,
            actor_role=r_actor_role,
            action_type=r_action,
            resource_type=r_res_type,
            resource_id=r_res_id,
            ip_address=r_ip,
            details_json=r_details
        )

        if computed_hash != r_entry_hash:
            return {
                "valid": False,
                "broken_at_id": r_id,
                "broken_at_index": idx + 1,
                "total_entries": len(rows),
                "error": f"Cryptographic integrity failed at Entry #{r_id}! Row content has been modified or corrupted.",
                "computed_hash": computed_hash,
                "recorded_hash": r_entry_hash
            }

        expected_prev = r_entry_hash

    return {
        "valid": True,
        "total_entries": len(rows),
        "message": f"Successfully verified {len(rows)} chained audit log entries. Zero tampering detected.",
        "last_verified_hash": expected_prev
    }
