/**
 * Cryptographic Audit Hash-Chain & Ed25519 Signature Engine
 * Enforces ordered SHA-256 hash chaining and digital signatures on audit records.
 * Includes resilient PEM sanitization for Vercel and serverless environments.
 */

import crypto from "node:crypto";

let cachedPrivateKey: crypto.KeyObject | null = null;
let cachedPublicKey: crypto.KeyObject | null = null;

/**
 * Resets cached KeyObjects (used in automated testing).
 */
export function resetSigningKeysCacheForTesting() {
  cachedPrivateKey = null;
  cachedPublicKey = null;
}

/**
 * Sanitizes and normalizes PEM-formatted keys pasted from environment variables (e.g. Vercel).
 * Handles:
 * - Literal escaped newlines ("\\n") -> converted to actual newlines ("\n")
 * - Surrounding single or double quotes
 * - Raw Base64-encoded PEM strings (fallback)
 * - Leading/trailing whitespace
 * Throws explicit descriptive error without leaking raw key content.
 */
export function normalizePem(rawKey: string | undefined | null, keyType: "PRIVATE" | "PUBLIC"): string {
  if (!rawKey || typeof rawKey !== "string" || !rawKey.trim()) {
    throw new Error(
      `[Audit Crypto] Missing ${keyType} signing key in environment configuration. Please configure AUDIT_SIGNING_${keyType}_KEY.`
    );
  }

  let cleaned = rawKey.trim();

  // Strip wrapping quotes (common artifact from Vercel UI or .env copying)
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  // Handle literal escaped newlines (e.g. "\\n" -> "\n", "\\r" -> "")
  cleaned = cleaned.replace(/\\r/g, "").replace(/\\n/g, "\n");

  // Check if the string is raw Base64-encoded PEM without explicit headers
  if (!cleaned.includes("-----BEGIN")) {
    try {
      const decoded = Buffer.from(cleaned, "base64").toString("utf-8");
      if (decoded.includes("-----BEGIN")) {
        cleaned = decoded.replace(/\\r/g, "").replace(/\\n/g, "\n").trim();
      }
    } catch {
      // Fall through to validation check
    }
  }

  const expectedHeader = keyType === "PRIVATE" ? "-----BEGIN PRIVATE KEY-----" : "-----BEGIN PUBLIC KEY-----";
  const expectedFooter = keyType === "PRIVATE" ? "-----END PRIVATE KEY-----" : "-----END PUBLIC KEY-----";

  // Check for presence of valid PEM boundary tags
  if (!cleaned.includes("-----BEGIN") || !cleaned.includes("-----END")) {
    throw new Error(
      `[Audit Crypto] Malformed ${keyType} signing key: missing standard PEM header/footer boundaries. Expected '${expectedHeader}' and '${expectedFooter}'.`
    );
  }

  return cleaned;
}

/**
 * Loads or initializes the Ed25519 signing keypair from environment variables.
 */
export function getSigningKeys(): { privateKey: crypto.KeyObject; publicKey: crypto.KeyObject } {
  if (cachedPrivateKey && cachedPublicKey) {
    return { privateKey: cachedPrivateKey, publicKey: cachedPublicKey };
  }

  const rawPriv = process.env.AUDIT_SIGNING_PRIVATE_KEY;
  const rawPub = process.env.AUDIT_SIGNING_PUBLIC_KEY;

  if (rawPriv || rawPub) {
    if (!rawPriv || !rawPub) {
      throw new Error(
        "[Audit Crypto] Incomplete keypair configuration: both AUDIT_SIGNING_PRIVATE_KEY and AUDIT_SIGNING_PUBLIC_KEY must be provided."
      );
    }

    try {
      const privPem = normalizePem(rawPriv, "PRIVATE");
      const pubPem = normalizePem(rawPub, "PUBLIC");

      cachedPrivateKey = crypto.createPrivateKey(privPem);
      cachedPublicKey = crypto.createPublicKey(pubPem);
      return { privateKey: cachedPrivateKey, publicKey: cachedPublicKey };
    } catch (e: any) {
      if (e.message && e.message.startsWith("[Audit Crypto]")) {
        throw e;
      }
      throw new Error(
        `[Audit Crypto] Failed to initialize Ed25519 keypair: OpenSSL parsing error (${e.code || "ERR_PEM_PARSING"}). Ensure the key is valid PKCS#8 Ed25519.`
      );
    }
  }

  // Ephemeral keypair fallback for local test/dev environments
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[Audit Crypto] Production deployment requires AUDIT_SIGNING_PRIVATE_KEY and AUDIT_SIGNING_PUBLIC_KEY environment variables to be configured."
    );
  }

  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  cachedPrivateKey = privateKey;
  cachedPublicKey = publicKey;
  return { privateKey, publicKey };
}

/**
 * Exports the public key in SPKI PEM format for client or third-party verification.
 */
export function getExportedPublicKey(): string {
  const { publicKey } = getSigningKeys();
  return publicKey.export({ type: "spki", format: "pem" }).toString();
}

/**
 * Deterministically stringifies an object by sorting keys alphabetically (Canonical JSON).
 * Handles Date objects, undefined properties, and BigInt without throwing runtime errors.
 */
export function canonicalJson(obj: any): string {
  if (obj === null || obj === undefined) {
    return "null";
  }
  if (typeof obj === "bigint") {
    return JSON.stringify(obj.toString());
  }
  if (obj instanceof Date) {
    return JSON.stringify(obj.toISOString());
  }
  if (typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map((item) => canonicalJson(item)).join(",") + "]";
  }

  const sortedKeys = Object.keys(obj)
    .filter((key) => obj[key] !== undefined)
    .sort();

  const pairs = sortedKeys.map((key) => {
    const val = obj[key];
    return JSON.stringify(key) + ":" + canonicalJson(val);
  });
  return "{" + pairs.join(",") + "}";
}

export interface AuditEventFields {
  id?: string;
  sequenceNumber: number;
  timestamp: string | Date;
  actorId?: string | null;
  actorRole: string;
  actorName: string;
  action: string;
  targetEntity: string;
  targetId?: string | null;
  previousValues?: string | null;
  newValues?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  reason?: string | null;
}

/**
 * Computes the authoritative SHA-256 hash of an audit event linked to previousHash.
 */
export function computeEventHash(event: AuditEventFields, previousHash: string): string {
  const tsStr = event.timestamp instanceof Date ? event.timestamp.toISOString() : event.timestamp;

  const canonicalPayload = canonicalJson({
    action: event.action,
    actorId: event.actorId || null,
    actorName: event.actorName,
    actorRole: event.actorRole,
    ipAddress: event.ipAddress || null,
    newValues: event.newValues || null,
    previousHash,
    previousValues: event.previousValues || null,
    reason: event.reason || null,
    sequenceNumber: event.sequenceNumber,
    targetEntity: event.targetEntity,
    targetId: event.targetId || null,
    timestamp: tsStr,
    userAgent: event.userAgent || null,
  });

  return crypto.createHash("sha256").update(canonicalPayload).digest("hex");
}

/**
 * Signs an event hash using the Ed25519 private key.
 */
export function signEventHash(hash: string): string {
  const { privateKey } = getSigningKeys();
  const signatureBuffer = crypto.sign(null, Buffer.from(hash, "utf-8"), privateKey);
  return signatureBuffer.toString("base64");
}

/**
 * Verifies an Ed25519 signature against an event hash and public key.
 */
export function verifyEventSignature(
  hash: string,
  signatureBase64: string,
  publicKeyPem?: string
): boolean {
  try {
    const pubKey = publicKeyPem
      ? crypto.createPublicKey(normalizePem(publicKeyPem, "PUBLIC"))
      : getSigningKeys().publicKey;

    const signatureBuffer = Buffer.from(signatureBase64, "base64");
    return crypto.verify(null, Buffer.from(hash, "utf-8"), pubKey, signatureBuffer);
  } catch (e) {
    return false;
  }
}
