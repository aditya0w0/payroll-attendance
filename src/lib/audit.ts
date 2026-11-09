/**
 * Transactional Tamper-Evident Audit Logging Engine
 * Cryptographically links all security-sensitive operations via SHA-256 Hash Chain
 * and Ed25519 digital signatures.
 */

import { prisma } from "./db";
import { computeEventHash, signEventHash } from "./audit-crypto";
import { dispatchOutboxFlush } from "./audit-outbox";

export interface AuditLogParams {
  actorId?: string | null;
  actorRole: "OWNER" | "EMPLOYEE" | "SYSTEM" | string;
  actorName: string;
  action: string;
  targetEntity: string;
  targetId?: string | null;
  previousValues?: Record<string, any> | string | null;
  newValues?: Record<string, any> | string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  reason?: string | null;
}

const SECRET_KEY_REGEX = /password|secret|privatekey|token|unlockcode|credentialpublickey/i;

/**
 * Recursively redacts sensitive credentials and secrets from audit payloads.
 * Safe against circular references, arrays, and dates.
 */
function redactSecrets(obj: any, seen: WeakSet<object> = new WeakSet()): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;

  if (seen.has(obj)) {
    return "[CIRCULAR]";
  }
  seen.add(obj);

  if (obj instanceof Date) {
    return obj.toISOString();
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSecrets(item, seen));
  }

  const clean: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (SECRET_KEY_REGEX.test(key)) {
      clean[key] = "[REDACTED]";
    } else if (typeof val === "object" && val !== null) {
      clean[key] = redactSecrets(val, seen);
    } else {
      clean[key] = val;
    }
  }
  return clean;
}

function safeStringify(val: any): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      return JSON.stringify(redactSecrets(parsed));
    } catch {
      return val;
    }
  }
  return JSON.stringify(redactSecrets(val));
}

/**
 * Appends a cryptographically linked, signed audit record inside a database transaction.
 * If called inside an existing transaction, passes the transaction client `tx`.
 */
export async function recordTransactionalAuditLog(tx: any, params: AuditLogParams) {
  const prevJson = safeStringify(params.previousValues);
  const newJson = safeStringify(params.newValues);
  const now = new Date();

  // 0. Serialize audit log sequence allocation across concurrent transactions on PostgreSQL
  try {
    if (typeof tx.$executeRawUnsafe === "function") {
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(74839201);");
    }
  } catch {
    // Non-PostgreSQL database or advisory lock unsupported
  }

  // 1. Fetch latest audit log to establish hash-chain continuity
  const lastLog = await tx.auditLog.findFirst({
    orderBy: { sequenceNumber: "desc" },
    select: { sequenceNumber: true, currentHash: true },
  });

  const sequenceNumber = (lastLog?.sequenceNumber ?? 0) + 1;
  const previousHash =
    lastLog?.currentHash ??
    "GENESIS_ANCHOR_0000000000000000000000000000000000000000000000000000000000000000";

  // 2. Compute canonical SHA-256 hash of event
  const eventPayload = {
    sequenceNumber,
    timestamp: now,
    actorId: params.actorId || null,
    actorRole: params.actorRole,
    actorName: params.actorName,
    action: params.action,
    targetEntity: params.targetEntity,
    targetId: params.targetId || null,
    previousValues: prevJson,
    newValues: newJson,
    ipAddress: params.ipAddress || "127.0.0.1",
    userAgent: params.userAgent || "Unknown Device",
    reason: params.reason || null,
  };

  const currentHash = computeEventHash(eventPayload, previousHash);

  // 3. Generate Ed25519 digital signature
  const signature = signEventHash(currentHash);

  // 4. Insert AuditLog inside transaction
  const auditLog = await tx.auditLog.create({
    data: {
      sequenceNumber,
      schemaVersion: 2,
      timestamp: now,
      actorId: params.actorId || null,
      actorRole: params.actorRole,
      actorName: params.actorName,
      action: params.action,
      targetEntity: params.targetEntity,
      targetId: params.targetId || null,
      previousValues: prevJson,
      newValues: newJson,
      previousHash,
      currentHash,
      signature,
      ipAddress: params.ipAddress || "127.0.0.1",
      userAgent: params.userAgent || "Unknown Device",
      reason: params.reason || null,
    },
  });

  // 5. Insert durable outbox record inside the exact same transaction
  await tx.auditOutbox.create({
    data: {
      auditLogId: auditLog.id,
      sequenceNumber,
      status: "PENDING",
      retryCount: 0,
      nextAttemptAt: now,
    },
  });

  return auditLog;
}

/**
 * Standalone wrapper for recordTransactionalAuditLog.
 * Executes in a dedicated transaction and triggers best-effort outbox flush.
 */
export async function recordAuditLog(params: AuditLogParams) {
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      const result = await prisma.$transaction(async (tx) => {
        return await recordTransactionalAuditLog(tx, params);
      });

      // Best-effort non-blocking dispatch to external sink
      dispatchOutboxFlush();

      return result;
    } catch (error: any) {
      if (error?.code === "P2002" && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 50 * attempts));
        continue;
      }
      console.error("Failed to append to cryptographic audit ledger:", error);
      // In Zero-Trust, audit failures bubble up to prevent un-audited state mutations
      throw error;
    }
  }
}
