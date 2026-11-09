/**
 * Serverless Transactional Outbox & External Sink Abstraction
 * Supports Cloudflare R2, AWS S3 (with Object Lock WORM), and Local Fallback.
 */

import { prisma } from "./db";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { computeEventHash, signEventHash } from "./audit-crypto";
import fs from "node:fs";
import path from "node:path";

export interface OutboxBatchManifest {
  batchKey: string;
  startSequence: number;
  endSequence: number;
  recordCount: number;
  generatedAt: string;
  manifestSha256: string;
  manifestSignature: string;
}

export interface ArchiveResult {
  success: boolean;
  provider: "S3_R2_WORM" | "LOCAL_FALLBACK" | "NONE";
  location?: string;
  error?: string;
}

export interface IAuditArchiveProvider {
  archiveBatch(
    batchKey: string,
    jsonlContent: string,
    manifest: OutboxBatchManifest
  ): Promise<ArchiveResult>;
}

/**
 * Cloudflare R2 / AWS S3 Provider with WORM Object Lock support
 */
export class S3CompatibleWormProvider implements IAuditArchiveProvider {
  private client: S3Client | null = null;
  private bucket: string;

  constructor() {
    this.bucket = process.env.S3_ARCHIVE_BUCKET || "payroll-audit-archive";
    const endpoint = process.env.S3_ARCHIVE_ENDPOINT;
    const region = process.env.S3_ARCHIVE_REGION || "auto";
    const accessKeyId = process.env.S3_ARCHIVE_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_ARCHIVE_SECRET_ACCESS_KEY;

    if (accessKeyId && secretAccessKey) {
      this.client = new S3Client({
        region,
        endpoint: endpoint || undefined,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
    }
  }

  isConfigured(): boolean {
    return Boolean(this.client && this.bucket);
  }

  async archiveBatch(
    batchKey: string,
    jsonlContent: string,
    manifest: OutboxBatchManifest
  ): Promise<ArchiveResult> {
    if (!this.client) {
      return {
        success: false,
        provider: "NONE",
        error: "S3 / Cloudflare R2 storage credentials not configured",
      };
    }

    try {
      const putParams: any = {
        Bucket: this.bucket,
        Key: `audit-batches/${batchKey}`,
        Body: jsonlContent,
        ContentType: "application/x-ndjson",
        Metadata: {
          "manifest-sha256": manifest.manifestSha256,
          "manifest-signature": manifest.manifestSignature,
          "record-count": String(manifest.recordCount),
          "start-sequence": String(manifest.startSequence),
          "end-sequence": String(manifest.endSequence),
        },
      };

      // Optional Object Lock WORM retention
      if (process.env.S3_ARCHIVE_OBJECT_LOCK === "true") {
        putParams.ObjectLockMode = "COMPLIANCE";
        // Retain for 3 years
        const retainUntil = new Date(Date.now() + 3 * 365 * 24 * 60 * 60 * 1000);
        putParams.ObjectLockRetainUntilDate = retainUntil;
      }

      await this.client.send(new PutObjectCommand(putParams));

      return {
        success: true,
        provider: "S3_R2_WORM",
        location: `s3://${this.bucket}/audit-batches/${batchKey}`,
      };
    } catch (e: any) {
      return {
        success: false,
        provider: "S3_R2_WORM",
        error: e.message || "Failed to push batch to S3/R2 sink",
      };
    }
  }
}

/**
 * Local Fallback Provider for development & zero-cost setups
 */
export class LocalFallbackProvider implements IAuditArchiveProvider {
  private archiveDir: string;

  constructor() {
    this.archiveDir = path.join(process.cwd(), ".outbox_archive");
  }

  async archiveBatch(
    batchKey: string,
    jsonlContent: string,
    manifest: OutboxBatchManifest
  ): Promise<ArchiveResult> {
    try {
      if (!fs.existsSync(this.archiveDir)) {
        fs.mkdirSync(this.archiveDir, { recursive: true });
      }

      const filePath = path.join(this.archiveDir, batchKey);
      fs.writeFileSync(filePath, jsonlContent, "utf-8");

      const manifestPath = path.join(this.archiveDir, `${batchKey}.manifest.json`);
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

      return {
        success: true,
        provider: "LOCAL_FALLBACK",
        location: filePath,
      };
    } catch (e: any) {
      return {
        success: false,
        provider: "LOCAL_FALLBACK",
        error: e.message,
      };
    }
  }
}

/**
 * Resolves the active archive provider based on configuration.
 */
export function getArchiveProvider(): { provider: IAuditArchiveProvider; type: "S3_R2_WORM" | "LOCAL_FALLBACK" | "NOT_CONFIGURED" } {
  const s3 = new S3CompatibleWormProvider();
  if (s3.isConfigured()) {
    return { provider: s3, type: "S3_R2_WORM" };
  }
  return { provider: new LocalFallbackProvider(), type: "LOCAL_FALLBACK" };
}

/**
 * Flushes pending outbox records to external archive.
 * Strictly caps batch processing to 50 records to guarantee execution finishes
 * well within Vercel serverless function timeouts (10s-15s).
 */
export async function flushAuditOutbox(limit: number = 50): Promise<{
  processedCount: number;
  batchKey: string | null;
  status: "DELIVERED" | "NO_PENDING" | "FAILED";
  error?: string;
}> {
  // Strict batch limit cap for serverless execution budget
  const effectiveLimit = Math.max(1, Math.min(limit, 50));

  // 1. Fetch pending items ordered by sequenceNumber
  const pendingItems = await prisma.auditOutbox.findMany({
    where: {
      status: "PENDING",
      nextAttemptAt: { lte: new Date() },
    },
    include: {
      auditLog: true,
    },
    orderBy: { sequenceNumber: "asc" },
    take: effectiveLimit,
  });

  if (pendingItems.length === 0) {
    return { processedCount: 0, batchKey: null, status: "NO_PENDING" };
  }

  const startSeq = pendingItems[0].sequenceNumber;
  const endSeq = pendingItems[pendingItems.length - 1].sequenceNumber;
  const startSeqStr = String(startSeq).padStart(6, "0");
  const endSeqStr = String(endSeq).padStart(6, "0");
  const batchKey = `audit-batch-${startSeqStr}-${endSeqStr}.jsonl`;

  // 2. Build JSONL lines
  const jsonlLines = pendingItems.map((item) => JSON.stringify(item.auditLog));
  const jsonlContent = jsonlLines.join("\n") + "\n";

  // 3. Compute batch manifest hash and signature
  const manifestHash = computeEventHash(
    {
      sequenceNumber: endSeq,
      timestamp: new Date().toISOString(),
      action: "AUDIT_BATCH_MANIFEST",
      actorRole: "SYSTEM",
      actorName: "Outbox Dispatcher",
      targetEntity: "AUDIT_BATCH",
      targetId: batchKey,
      newValues: JSON.stringify({ startSeq, endSeq, recordCount: pendingItems.length }),
    },
    pendingItems[0].auditLog.previousHash
  );

  const manifestSignature = signEventHash(manifestHash);

  const manifest: OutboxBatchManifest = {
    batchKey,
    startSequence: startSeq,
    endSequence: endSeq,
    recordCount: pendingItems.length,
    generatedAt: new Date().toISOString(),
    manifestSha256: manifestHash,
    manifestSignature,
  };

  // 4. Dispatch to provider
  const { provider } = getArchiveProvider();
  const archiveResult = await provider.archiveBatch(batchKey, jsonlContent, manifest);

  const now = new Date();

  if (archiveResult.success) {
    // Mark items as DELIVERED
    await prisma.auditOutbox.updateMany({
      where: {
        id: { in: pendingItems.map((p) => p.id) },
        status: { not: "DELIVERED" },
      },
      data: {
        status: "DELIVERED",
        deliveredAt: now,
        batchKey,
        lastError: null,
      },
    });

    return {
      processedCount: pendingItems.length,
      batchKey,
      status: "DELIVERED",
    };
  } else {
    // Retry with exponential backoff
    for (const p of pendingItems) {
      const nextDelaySec = Math.min(3600, Math.pow(2, p.retryCount + 1) * 30);
      await prisma.auditOutbox.update({
        where: { id: p.id },
        data: {
          retryCount: p.retryCount + 1,
          nextAttemptAt: new Date(now.getTime() + nextDelaySec * 1000),
          lastError: archiveResult.error || "Delivery failure",
          status: p.retryCount >= 5 ? "FAILED" : "PENDING",
        },
      });
    }

    return {
      processedCount: 0,
      batchKey,
      status: "FAILED",
      error: archiveResult.error,
    };
  }
}

/**
 * Event-Driven Non-Blocking Outbox Flush Trigger
 * Safely schedules an asynchronous background flush without blocking HTTP responses.
 * Uses Next.js after() / unstable_after() if supported by the serverless runtime,
 * or falls back to detached asynchronous setImmediate.
 */
export function triggerBackgroundFlush(): void {
  try {
    const nextServer = require("next/server");
    const scheduleFn = nextServer.after || nextServer.unstable_after;
    if (typeof scheduleFn === "function") {
      scheduleFn(async () => {
        try {
          await flushAuditOutbox(50);
        } catch (err) {
          console.warn("[Audit Outbox] Background scheduled flush error:", err);
        }
      });
      return;
    }
  } catch {
    // Non-Next or unsupported runtime fallback
  }

  setImmediate(() => {
    flushAuditOutbox(50).catch((err) => {
      console.warn("[Audit Outbox] Background detached flush error:", err);
    });
  });
}

/**
 * Backwards-compatible alias for triggerBackgroundFlush.
 */
export const dispatchOutboxFlush = triggerBackgroundFlush;
