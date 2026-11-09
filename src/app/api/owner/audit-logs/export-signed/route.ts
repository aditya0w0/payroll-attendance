import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeEventHash, signEventHash, getExportedPublicKey } from "@/lib/audit-crypto";
import { recordAuditLog } from "@/lib/audit";

/**
 * Signed Audit Ledger Export Endpoint
 * Streams/downloads a complete cryptographically verifiable JSONL audit trail
 * with cryptographic headers and tamper-evident signatures.
 */
export async function GET(req: NextRequest) {
  const current = await getCurrentUser();
  if (!current || current.user.role !== "OWNER") {
    return NextResponse.json(
      { error: "Owner authorization required" },
      { status: 403 }
    );
  }

  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: { sequenceNumber: "asc" },
    });

    const exportTimestamp = new Date().toISOString();
    const totalRecords = logs.length;
    const latestLog = logs[logs.length - 1];

    // Compute cryptographic manifest for export
    const exportManifestData = {
      action: "AUDIT_LEDGER_FULL_EXPORT",
      totalRecords,
      exportedAt: exportTimestamp,
      latestSequence: latestLog ? latestLog.sequenceNumber : 0,
      latestHash: latestLog ? latestLog.currentHash : "GENESIS",
    };

    const manifestHash = computeEventHash(
      {
        sequenceNumber: exportManifestData.latestSequence,
        timestamp: exportTimestamp,
        action: exportManifestData.action,
        actorRole: "OWNER",
        actorName: current.user.username,
        targetEntity: "AUDIT_LEDGER",
        targetId: `EXPORT_${Date.now()}`,
        newValues: JSON.stringify(exportManifestData),
      },
      exportManifestData.latestHash
    );

    const manifestSignature = signEventHash(manifestHash);
    const publicKey = getExportedPublicKey();

    // Build JSONL payload
    // Line 1: Export metadata manifest
    const manifestLine = JSON.stringify({
      _type: "AUDIT_EXPORT_MANIFEST",
      ...exportManifestData,
      manifestHash,
      manifestSignature,
      publicKey,
    });

    // Subsequent lines: audit records
    const logLines = logs.map((log) => JSON.stringify(log));
    const fullPayload = [manifestLine, ...logLines].join("\n") + "\n";

    // Record audit of this export action
    await recordAuditLog({
      action: "EXPORT_SIGNED_AUDIT_LEDGER",
      targetEntity: "AUDIT_LEDGER",
      targetId: `EXPORT_${totalRecords}_RECORDS`,
      actorId: current.user.id,
      actorName: current.user.username,
      actorRole: "OWNER",
      ipAddress: req.headers.get("x-forwarded-for") || "127.0.0.1",
      userAgent: req.headers.get("user-agent") || undefined,
      newValues: JSON.stringify({
        totalRecords,
        manifestHash,
      }),
      reason: "Owner exported signed audit ledger",
    });

    return new Response(fullPayload, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-ledger-${Date.now()}.jsonl"`,
        "X-Audit-Record-Count": String(totalRecords),
        "X-Audit-Manifest-Hash": manifestHash,
        "X-Audit-Signature": manifestSignature,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to export signed audit ledger",
      },
      { status: 500 }
    );
  }
}
