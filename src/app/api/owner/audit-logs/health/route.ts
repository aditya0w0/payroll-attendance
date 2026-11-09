import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { verifyAuditChainIntegrity } from "@/lib/audit-verifier";
import { getArchiveProvider } from "@/lib/audit-outbox";
import { getExportedPublicKey } from "@/lib/audit-crypto";

export const dynamic = "force-dynamic";

/**
 * Audit Ledger & Outbox Health Status Endpoint
 * Returns real-time cryptographic verification of the hash-chain,
 * outbox delivery queue statistics, and external storage sink status.
 */
export async function GET(req: NextRequest) {
  const current = await getCurrentUser(req);
  if (!current || current.user.role !== "OWNER") {
    return NextResponse.json(
      { error: "Owner authorization required" },
      { status: 403 }
    );
  }

  try {
    const [chainIntegrity, pendingCount, deliveredCount, failedCount] = await Promise.all([
      verifyAuditChainIntegrity(),
      prisma.auditOutbox.count({ where: { status: "PENDING" } }),
      prisma.auditOutbox.count({ where: { status: "DELIVERED" } }),
      prisma.auditOutbox.count({ where: { status: "FAILED" } }),
    ]);

    const { provider, type } = getArchiveProvider();
    const isWormConfigured = type === "S3_R2_WORM";

    return NextResponse.json({
      success: true,
      chainIntegrity,
      outbox: {
        pendingCount,
        deliveredCount,
        failedCount,
        totalQueue: pendingCount + deliveredCount + failedCount,
      },
      sink: {
        providerType: type,
        isWormConfigured,
        bucket: process.env.S3_ARCHIVE_BUCKET || (isWormConfigured ? "configured" : "none"),
        objectLockEnabled: process.env.S3_ARCHIVE_OBJECT_LOCK === "true",
      },
      security: {
        signingAlgorithm: "Ed25519",
        hashAlgorithm: "SHA-256",
        publicKey: getExportedPublicKey(),
      },
      checkedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to check audit health status",
      },
      { status: 500 }
    );
  }
}
