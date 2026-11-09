/**
 * Audit Ledger Hash-Chain Integrity Verification Service
 * Validates unbroken sequence continuity, recomputes SHA-256 links,
 * and validates Ed25519 digital signatures.
 */

import { prisma } from "./db";
import { computeEventHash, verifyEventSignature, getExportedPublicKey } from "./audit-crypto";

export interface IntegrityVerificationResult {
  valid: boolean;
  totalRecordsChecked: number;
  genesisSequence: number;
  latestSequence: number;
  brokenSequence?: number;
  brokenEntityId?: string;
  error?: string;
  checkedAt: string;
}

export async function verifyAuditChainIntegrity(): Promise<IntegrityVerificationResult> {
  const nowStr = new Date().toISOString();

  const records = await prisma.auditLog.findMany({
    orderBy: { sequenceNumber: "asc" },
  });

  if (records.length === 0) {
    return {
      valid: true,
      totalRecordsChecked: 0,
      genesisSequence: 0,
      latestSequence: 0,
      checkedAt: nowStr,
    };
  }

  let expectedSeq = records[0].sequenceNumber;
  let expectedPrevHash = records[0].previousHash;

  for (let i = 0; i < records.length; i++) {
    const record = records[i];

    // Check 1: Sequence number continuity
    if (record.sequenceNumber !== expectedSeq) {
      return {
        valid: false,
        totalRecordsChecked: i,
        genesisSequence: records[0].sequenceNumber,
        latestSequence: records[records.length - 1].sequenceNumber,
        brokenSequence: record.sequenceNumber,
        brokenEntityId: record.id,
        error: `Sequence gap detected: expected sequence #${expectedSeq}, but found #${record.sequenceNumber}.`,
        checkedAt: nowStr,
      };
    }

    // Check 2: Hash-chain link with previous record
    if (i > 0 && record.previousHash !== expectedPrevHash) {
      return {
        valid: false,
        totalRecordsChecked: i,
        genesisSequence: records[0].sequenceNumber,
        latestSequence: records[records.length - 1].sequenceNumber,
        brokenSequence: record.sequenceNumber,
        brokenEntityId: record.id,
        error: `Hash-chain broken at sequence #${record.sequenceNumber}: previousHash '${record.previousHash}' does not match prior record's currentHash '${expectedPrevHash}'.`,
        checkedAt: nowStr,
      };
    }

    // Check 3: Recompute SHA-256 hash for v2 records
    if (record.schemaVersion >= 2) {
      const recomputedHash = computeEventHash(
        {
          action: record.action,
          actorId: record.actorId,
          actorName: record.actorName,
          actorRole: record.actorRole,
          ipAddress: record.ipAddress,
          newValues: record.newValues,
          previousValues: record.previousValues,
          reason: record.reason,
          sequenceNumber: record.sequenceNumber,
          targetEntity: record.targetEntity,
          targetId: record.targetId,
          timestamp: record.timestamp,
          userAgent: record.userAgent,
        },
        record.previousHash
      );

      if (recomputedHash !== record.currentHash) {
        return {
          valid: false,
          totalRecordsChecked: i,
          genesisSequence: records[0].sequenceNumber,
          latestSequence: records[records.length - 1].sequenceNumber,
          brokenSequence: record.sequenceNumber,
          brokenEntityId: record.id,
          error: `Payload tampering detected at sequence #${record.sequenceNumber}: stored hash '${record.currentHash}' does not match recomputed SHA-256 hash '${recomputedHash}'.`,
          checkedAt: nowStr,
        };
      }

      // Check 4: Ed25519 digital signature verification
      const isSignatureValid = verifyEventSignature(record.currentHash, record.signature);
      if (!isSignatureValid) {
        return {
          valid: false,
          totalRecordsChecked: i,
          genesisSequence: records[0].sequenceNumber,
          latestSequence: records[records.length - 1].sequenceNumber,
          brokenSequence: record.sequenceNumber,
          brokenEntityId: record.id,
          error: `Cryptographic signature forgery detected at sequence #${record.sequenceNumber}: signature does not verify against public key.`,
          checkedAt: nowStr,
        };
      }
    }

    expectedPrevHash = record.currentHash;
    expectedSeq++;
  }

  return {
    valid: true,
    totalRecordsChecked: records.length,
    genesisSequence: records[0].sequenceNumber,
    latestSequence: records[records.length - 1].sequenceNumber,
    checkedAt: nowStr,
  };
}

export { getExportedPublicKey };
