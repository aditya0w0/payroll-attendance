import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { findManyMock } = vi.hoisted(() => ({
  findManyMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    auditLog: {
      findMany: findManyMock,
    },
  },
}));

import {
  computeEventHash,
  getSigningKeys,
  normalizePem,
  resetSigningKeysCacheForTesting,
  signEventHash,
  verifyEventSignature,
} from "@/lib/audit-crypto";
import { verifyAuditChainIntegrity } from "@/lib/audit-verifier";

describe("Ed25519 audit crypto and hash-chain verifier", () => {
  const originalEnv = { ...process.env };
  const keypair = crypto.generateKeyPairSync("ed25519");
  const privPem = keypair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const pubPem = keypair.publicKey.export({ type: "spki", format: "pem" }).toString();

  beforeEach(() => {
    process.env.AUDIT_SIGNING_PRIVATE_KEY = privPem;
    process.env.AUDIT_SIGNING_PUBLIC_KEY = pubPem;
    resetSigningKeysCacheForTesting();
    findManyMock.mockReset();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetSigningKeysCacheForTesting();
  });

  describe("normalizePem & key loading", () => {
    it("normalizes escaped \\n, wrapping quotes, and base64-encoded PEM into valid keys", () => {
      const escapedPriv = `"${privPem.replace(/\n/g, "\\n")}"`;
      const base64Pub = Buffer.from(pubPem, "utf-8").toString("base64");

      const normalizedPriv = normalizePem(escapedPriv, "PRIVATE");
      const normalizedPub = normalizePem(base64Pub, "PUBLIC");

      expect(normalizedPriv).toContain("\n");
      expect(normalizedPriv).not.toContain("\\n");
      expect(() => crypto.createPrivateKey(normalizedPriv)).not.toThrow();
      expect(() => crypto.createPublicKey(normalizedPub)).not.toThrow();
    });

    it("throws descriptive error without leaking raw malformed secret material", () => {
      const secretFragment = "SUPER_SECRET_RAW_KEY_DO_NOT_LEAK_99999";
      expect(() => normalizePem(secretFragment, "PRIVATE")).toThrow(/Malformed PRIVATE signing key/);
      try {
        normalizePem(secretFragment, "PRIVATE");
      } catch (err: any) {
        expect(err.message).not.toContain(secretFragment);
      }
    });

    it("fails closed in production when signing keys are missing", () => {
      delete process.env.AUDIT_SIGNING_PRIVATE_KEY;
      delete process.env.AUDIT_SIGNING_PUBLIC_KEY;
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      resetSigningKeysCacheForTesting();

      expect(() => getSigningKeys()).toThrow(/Production deployment requires AUDIT_SIGNING_PRIVATE_KEY/);
    });

    it("rejects tampered hash or mismatched public key signature", () => {
      const hash = computeEventHash(
        {
          sequenceNumber: 1,
          timestamp: "2026-11-23T01:00:00.000Z",
          action: "AUTH_LOGIN_SUCCESS",
          actorRole: "OWNER",
          actorName: "owner",
          targetEntity: "SESSION",
        },
        "GENESIS"
      );
      const signature = signEventHash(hash);
      const otherKeypair = crypto.generateKeyPairSync("ed25519");
      const otherPubPem = otherKeypair.publicKey.export({ type: "spki", format: "pem" }).toString();

      expect(verifyEventSignature(hash, signature, pubPem)).toBe(true);
      expect(verifyEventSignature(`${hash}x`, signature, pubPem)).toBe(false);
      expect(verifyEventSignature(hash, signature, otherPubPem)).toBe(false);
    });
  });

  describe("verifyAuditChainIntegrity tamper detection", () => {
    function buildSignedRecord(seq: number, previousHash: string, overrides: Record<string, unknown> = {}) {
      const base = {
        id: `log_${seq}`,
        sequenceNumber: seq,
        schemaVersion: 2,
        timestamp: new Date(`2026-11-23T01:0${seq}:00.000Z`),
        actorId: "user_1",
        actorRole: "OWNER",
        actorName: "owner",
        action: "EMPLOYEE_SALARY_CHANGED",
        targetEntity: "EMPLOYEE",
        targetId: "emp_1",
        previousValues: JSON.stringify({ dailySalary: 150000 }),
        newValues: JSON.stringify({ dailySalary: 175000 }),
        ipAddress: "10.0.0.1",
        userAgent: "Vitest",
        reason: "Annual raise",
        previousHash,
      };
      const currentHash = computeEventHash(base, previousHash);
      const signature = signEventHash(currentHash);
      return { ...base, currentHash, signature, ...overrides };
    }

    it("passes verification for an unbroken signed hash chain", async () => {
      const rec1 = buildSignedRecord(1, "GENESIS");
      const rec2 = buildSignedRecord(2, rec1.currentHash);
      findManyMock.mockResolvedValue([rec1, rec2]);

      const result = await verifyAuditChainIntegrity();
      expect(result.valid).toBe(true);
      expect(result.totalRecordsChecked).toBe(2);
      expect(result.genesisSequence).toBe(1);
      expect(result.latestSequence).toBe(2);
    });

    it("detects deleted record / sequence number gap", async () => {
      const rec1 = buildSignedRecord(1, "GENESIS");
      const rec3 = buildSignedRecord(3, rec1.currentHash);
      findManyMock.mockResolvedValue([rec1, rec3]);

      const result = await verifyAuditChainIntegrity();
      expect(result.valid).toBe(false);
      expect(result.brokenSequence).toBe(3);
      expect(result.error).toContain("Sequence gap detected");
    });

    it("detects broken hash-chain link between consecutive records", async () => {
      const rec1 = buildSignedRecord(1, "GENESIS");
      const rec2 = buildSignedRecord(2, "0".repeat(64));
      findManyMock.mockResolvedValue([rec1, rec2]);

      const result = await verifyAuditChainIntegrity();
      expect(result.valid).toBe(false);
      expect(result.brokenSequence).toBe(2);
      expect(result.error).toContain("Hash-chain broken");
    });

    it("detects direct DB payload tampering even if chain links appear intact", async () => {
      const rec1 = buildSignedRecord(1, "GENESIS");
      const tampered = { ...rec1, newValues: JSON.stringify({ dailySalary: 9999999 }) };
      findManyMock.mockResolvedValue([tampered]);

      const result = await verifyAuditChainIntegrity();
      expect(result.valid).toBe(false);
      expect(result.brokenSequence).toBe(1);
      expect(result.error).toContain("Payload tampering detected");
    });

    it("detects forged signature when hash is recomputed by an attacker without private key", async () => {
      const rec1 = buildSignedRecord(1, "GENESIS", { signature: "Zm9yZ2VkX3NpZ25hdHVyZQ==" });
      findManyMock.mockResolvedValue([rec1]);

      const result = await verifyAuditChainIntegrity();
      expect(result.valid).toBe(false);
      expect(result.brokenSequence).toBe(1);
      expect(result.error).toContain("Cryptographic signature forgery detected");
    });
  });
});
