/**
 * Unit Test Suite: Resilient Ed25519 PEM Key Sanitization
 * Tests:
 * 1. Standard multiline PEM keys
 * 2. Single-line escaped "\\n" PEM keys (typical Vercel env variable pasting)
 * 3. Quoted PEM strings (double quotes and single quotes)
 * 4. Raw Base64-encoded PEM strings
 * 5. Signing and signature verification across all normalized variants
 * 6. Malformed and missing key error validation (asserting no secret leakage)
 */

import crypto from "node:crypto";
import {
  normalizePem,
  getSigningKeys,
  signEventHash,
  verifyEventSignature,
  resetSigningKeysCacheForTesting,
} from "../src/lib/audit-crypto";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`[PASS] ${testName}${detail ? ` (${detail})` : ""}`);
  } else {
    failedTests++;
    console.error(`[FAIL] ${testName}${detail ? ` - Detail: ${detail}` : ""}`);
  }
}

async function runPemTests() {
  console.log("================================================================================");
  console.log("STARTING RESILIENT ED25519 PEM KEY SANITIZATION TESTS");
  console.log("================================================================================");

  // Generate reference Ed25519 keypair
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const cleanPrivPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const cleanPubPem = publicKey.export({ type: "spki", format: "pem" }).toString();

  // 1. Properly formatted multiline PEM
  console.log("\n--- TEST 1: Properly Formatted Multiline PEM ---");
  const norm1Priv = normalizePem(cleanPrivPem, "PRIVATE");
  const norm1Pub = normalizePem(cleanPubPem, "PUBLIC");
  assert(norm1Priv.includes("\n") && norm1Priv.startsWith("-----BEGIN PRIVATE KEY-----"), "Standard multiline private key parsed intact");
  assert(norm1Pub.includes("\n") && norm1Pub.startsWith("-----BEGIN PUBLIC KEY-----"), "Standard multiline public key parsed intact");

  // 2. Single-line escaped \\n PEM (Vercel paste format)
  console.log("\n--- TEST 2: Single-Line Escaped \\n PEM (Vercel UI format) ---");
  const escapedPriv = cleanPrivPem.replace(/\n/g, "\\n");
  const escapedPub = cleanPubPem.replace(/\n/g, "\\n");
  const norm2Priv = normalizePem(escapedPriv, "PRIVATE");
  const norm2Pub = normalizePem(escapedPub, "PUBLIC");
  assert(norm2Priv.includes("\n") && !norm2Priv.includes("\\n"), "Escaped \\n replaced with actual newlines in private key");
  assert(norm2Pub.includes("\n") && !norm2Pub.includes("\\n"), "Escaped \\n replaced with actual newlines in public key");

  // Verify crypto.createPrivateKey / createPublicKey accept the normalized key
  const parsedPriv2 = crypto.createPrivateKey(norm2Priv);
  const parsedPub2 = crypto.createPublicKey(norm2Pub);
  assert(Boolean(parsedPriv2 && parsedPub2), "Node crypto successfully parsed normalized escaped \\n keys");

  // 3. Quoted PEM with wrapping quotes (e.g. "\"-----BEGIN...\"")
  console.log("\n--- TEST 3: Quoted PEM String Handling ---");
  const doubleQuoted = `"${escapedPriv}"`;
  const singleQuoted = `'${escapedPub}'`;
  const norm3Priv = normalizePem(doubleQuoted, "PRIVATE");
  const norm3Pub = normalizePem(singleQuoted, "PUBLIC");
  assert(!norm3Priv.startsWith('"') && !norm3Priv.endsWith('"'), "Double quotes stripped cleanly");
  assert(!norm3Pub.startsWith("'") && !norm3Pub.endsWith("'"), "Single quotes stripped cleanly");

  // 4. Base64-encoded PEM string fallback
  console.log("\n--- TEST 4: Raw Base64-Encoded PEM Fallback ---");
  const b64Priv = Buffer.from(cleanPrivPem, "utf-8").toString("base64");
  const b64Pub = Buffer.from(cleanPubPem, "utf-8").toString("base64");
  const norm4Priv = normalizePem(b64Priv, "PRIVATE");
  const norm4Pub = normalizePem(b64Pub, "PUBLIC");
  assert(norm4Priv.startsWith("-----BEGIN PRIVATE KEY-----"), "Base64 encoded private key decoded to valid PEM");
  assert(norm4Pub.startsWith("-----BEGIN PUBLIC KEY-----"), "Base64 encoded public key decoded to valid PEM");

  // 5. End-to-End Signing & Verification with Escaped Keys in Environment
  console.log("\n--- TEST 5: End-to-End Signing & Verification with Escaped Env Keys ---");
  const originalPrivEnv = process.env.AUDIT_SIGNING_PRIVATE_KEY;
  const originalPubEnv = process.env.AUDIT_SIGNING_PUBLIC_KEY;

  try {
    process.env.AUDIT_SIGNING_PRIVATE_KEY = escapedPriv;
    process.env.AUDIT_SIGNING_PUBLIC_KEY = escapedPub;
    resetSigningKeysCacheForTesting();

    const sampleHash = crypto.createHash("sha256").update("test_audit_payload_12345").digest("hex");
    const sig = signEventHash(sampleHash);
    assert(Boolean(sig && sig.length > 20), "Signature generated successfully using escaped private key in env");

    const valid = verifyEventSignature(sampleHash, sig, escapedPub);
    assert(valid === true, "Signature verified successfully using escaped public key");

    const invalid = verifyEventSignature(sampleHash + "tampered", sig, escapedPub);
    assert(invalid === false, "Altered hash rejected by signature verification");
  } finally {
    process.env.AUDIT_SIGNING_PRIVATE_KEY = originalPrivEnv;
    process.env.AUDIT_SIGNING_PUBLIC_KEY = originalPubEnv;
    resetSigningKeysCacheForTesting();
  }

  // 6. Descriptive Error Validation (Ensuring no secrets leaked)
  console.log("\n--- TEST 6: Malformed & Missing Key Error Handling ---");
  let missingErrorCaught = false;
  try {
    normalizePem("", "PRIVATE");
  } catch (err: any) {
    missingErrorCaught = true;
    assert(err.message.includes("[Audit Crypto] Missing PRIVATE signing key"), "Descriptive error thrown for missing key");
  }
  assert(missingErrorCaught, "Missing key check executed");

  let malformedErrorCaught = false;
  const badKeyString = "CORRUPTED_SECRET_DATA_WITHOUT_PEM_TAGS";
  try {
    normalizePem(badKeyString, "PUBLIC");
  } catch (err: any) {
    malformedErrorCaught = true;
    assert(err.message.includes("[Audit Crypto] Malformed PUBLIC signing key"), "Descriptive error thrown for malformed key");
    assert(!err.message.includes(badKeyString), "Error message does not leak raw key content");
  }
  assert(malformedErrorCaught, "Malformed key check executed");

  console.log("\n================================================================================");
  console.log(`PEM SANITIZATION TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
  console.log("================================================================================");

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPemTests().catch((e) => {
  console.error("Test execution fatal error:", e);
  process.exit(1);
});
