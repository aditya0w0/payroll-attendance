import { prisma } from "./db";

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

/**
 * Appends an immutable record to the Zero-Trust Audit Log.
 */
export async function recordAuditLog(params: AuditLogParams) {
  try {
    const prevJson =
      params.previousValues && typeof params.previousValues === "object"
        ? JSON.stringify(params.previousValues)
        : params.previousValues;

    const newJson =
      params.newValues && typeof params.newValues === "object"
        ? JSON.stringify(params.newValues)
        : params.newValues;

    return await prisma.auditLog.create({
      data: {
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
      },
    });
  } catch (error) {
    console.error("Failed to write to immutable audit log:", error);
    // In Zero-Trust, failures to audit should be highlighted
    return null;
  }
}
