/**
 * Unit Test Suite: Dynamic Relying Party (RP ID) & Origin Normalization
 */

import { normalizeRpId, normalizeOrigin, getWebAuthnConfig } from "../src/lib/webauthn";

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

async function runRpResolverTests() {
  console.log("================================================================================");
  console.log("STARTING DYNAMIC RP ID & ORIGIN NORMALIZATION TESTS");
  console.log("================================================================================");

  // 1. normalizeRpId
  console.log("\n--- TEST 1: normalizeRpId Edge Cases ---");
  assert(normalizeRpId("https://attendance.umkm.id:3000/") === "attendance.umkm.id", "Strips https://, port, and trailing slash");
  assert(normalizeRpId("http://localhost:3000") === "localhost", "Strips http:// and port from localhost");
  assert(normalizeRpId("payroll.company.com:443") === "payroll.company.com", "Strips port from domain");
  assert(normalizeRpId("preview-app-123.vercel.app/") === "preview-app-123.vercel.app", "Strips trailing slash");
  assert(normalizeRpId(undefined) === "localhost", "Defaults undefined to localhost");
  assert(normalizeRpId("") === "localhost", "Defaults empty string to localhost");

  // 2. normalizeOrigin
  console.log("\n--- TEST 2: normalizeOrigin Edge Cases ---");
  assert(normalizeOrigin("https://attendance.umkm.id/") === "https://attendance.umkm.id", "Strips trailing slash from https origin");
  assert(normalizeOrigin("http://localhost:3000///") === "http://localhost:3000", "Strips multiple trailing slashes");
  assert(normalizeOrigin("attendance.umkm.id", true) === "https://attendance.umkm.id", "Prepends https:// to bare domain when defaultSecure is true");
  assert(normalizeOrigin("localhost:3000") === "http://localhost:3000", "Prepends http:// to localhost");

  // 3. getWebAuthnConfig with custom domain in ENV
  console.log("\n--- TEST 3: Custom Domain Environment Configuration ---");
  const oldRp = process.env.RP_ID;
  const oldOrigin = process.env.EXPECTED_ORIGIN;
  const oldVercel = process.env.VERCEL_URL;

  try {
    process.env.RP_ID = "https://attendance.umkm.id:443/";
    process.env.EXPECTED_ORIGIN = "https://attendance.umkm.id/";
    const cfg = getWebAuthnConfig();
    assert(cfg.rpId === "attendance.umkm.id", "RP ID resolved cleanly without https or port", cfg.rpId);
    const origins = Array.isArray(cfg.expectedOrigin) ? cfg.expectedOrigin : [cfg.expectedOrigin];
    assert(origins.includes("https://attendance.umkm.id"), "Expected origin includes normalized https://attendance.umkm.id");
    assert(!origins.includes("https://attendance.umkm.id/"), "Expected origin does not contain trailing slash");
  } finally {
    process.env.RP_ID = oldRp;
    process.env.EXPECTED_ORIGIN = oldOrigin;
    process.env.VERCEL_URL = oldVercel;
  }

  // 4. getWebAuthnConfig derived dynamically from incoming request host header
  console.log("\n--- TEST 4: Dynamic Derivation from Request Host Header ---");
  delete process.env.RP_ID;
  delete process.env.EXPECTED_ORIGIN;
  delete process.env.VERCEL_URL;

  const cfgHeader = getWebAuthnConfig("preview-test-456.vercel.app:443");
  assert(cfgHeader.rpId === "preview-test-456.vercel.app", "RP ID derived from request header", cfgHeader.rpId);
  const headerOrigins = Array.isArray(cfgHeader.expectedOrigin) ? cfgHeader.expectedOrigin : [cfgHeader.expectedOrigin];
  assert(headerOrigins.includes("https://preview-test-456.vercel.app"), "Expected origin contains https derived from header");

  // 5. getWebAuthnConfig for localhost development
  console.log("\n--- TEST 5: Localhost Development Fallback ---");
  const cfgLocal = getWebAuthnConfig("localhost:3000");
  assert(cfgLocal.rpId === "localhost", "Localhost RP ID resolved", cfgLocal.rpId);
  const localOrigins = Array.isArray(cfgLocal.expectedOrigin) ? cfgLocal.expectedOrigin : [cfgLocal.expectedOrigin];
  assert(localOrigins.includes("http://localhost:3000"), "Localhost origin includes http://localhost:3000");

  console.log("\n================================================================================");
  console.log(`RP RESOLVER TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
  console.log("================================================================================");

  if (failedTests > 0) {
    process.exit(1);
  }
}

runRpResolverTests().catch((e) => {
  console.error("Test execution fatal error:", e);
  process.exit(1);
});
