import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { flushAuditOutbox } from "@/lib/audit-outbox";
import { recordAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Owner Manual Outbox Flush Endpoint
 * Allows authenticated Owners to manually trigger an immediate dispatch
 * of buffered audit records to the configured external archive.
 */
export async function POST(req: NextRequest) {
  const current = await getCurrentUser(req);
  if (!current || current.user.role !== "OWNER") {
    return NextResponse.json(
      { error: "Owner authorization required" },
      { status: 403 }
    );
  }

  try {
    const result = await flushAuditOutbox(50);

    await recordAuditLog({
      action: "MANUAL_AUDIT_OUTBOX_FLUSH",
      targetEntity: "AUDIT_OUTBOX",
      targetId: result.batchKey || "NONE",
      actorId: current.user.id,
      actorName: current.user.username,
      actorRole: "OWNER",
      ipAddress: req.headers.get("x-forwarded-for") || "127.0.0.1",
      userAgent: req.headers.get("user-agent") || undefined,
      newValues: JSON.stringify({
        processedCount: result.processedCount,
        batchKey: result.batchKey,
        status: result.status,
      }),
      reason: "Owner requested manual outbox flush",
    });

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Manual flush failed",
      },
      { status: 500 }
    );
  }
}
