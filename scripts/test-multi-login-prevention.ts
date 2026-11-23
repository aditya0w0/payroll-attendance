/**
 * Automated Verification Suite: Multi-Login Prevention & Mandatory Admin Reset
 *
 * Verifies:
 * 1. Single-device lock for employee accounts.
 * 2. Multi-login attempt from unauthorized device is strictly blocked with HTTP 423.
 * 3. Session mismatch invalidation: Old device sessions cannot continue.
 * 4. Mandatory Admin Reset workflow: Device can only be replaced after Owner executes RESET_DEVICE.
 * 5. Automatic binding of the new replacement terminal upon subsequent login.
 */

import { prisma } from "../src/lib/db";
import { getCurrentUser } from "../src/lib/auth";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string | null) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`[PASS] ${testName}${detail ? ` (${detail})` : ""}`);
  } else {
    failedTests++;
    console.error(`[FAIL] ${testName}${detail ? ` - Detail: ${detail}` : ""}`);
    throw new Error(`Test assertion failed: ${testName}`);
  }
}

async function runMultiLoginSuite() {
  console.log("================================================================================");
  console.log("STARTING MULTI-LOGIN PREVENTION & MANDATORY ADMIN RESET VERIFICATION SUITE");
  console.log("================================================================================\n");

  // Retrieve legitimate seed employee Siti Rahma
  const siti = await prisma.user.findFirst({
    where: { email: "siti@company.com" },
    include: { employeeProfile: true, deviceRegistration: true },
  });

  assert(Boolean(siti), "Employee Siti Rahma exists in database");
  assert(Boolean(siti?.deviceRegistration), "Siti has an authorized device registered");
  const legitFingerprint = siti!.deviceRegistration!.deviceFingerprint;
  assert(Boolean(legitFingerprint), "Authorized device fingerprint is recorded", legitFingerprint);

  // ---------------------------------------------------------------------------
  // TEST 1: Login from Authorized Registered Device
  // ---------------------------------------------------------------------------
  console.log("\n--- TEST 1: Login from Authorized Device ---");
  const legitLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: "siti@company.com",
      password: "employee123",
      deviceFingerprint: legitFingerprint,
      deviceName: "Siti's Authorized Pixel 7",
    }),
  });

  assert(legitLoginRes.status === 200, "Authorized device login succeeds with HTTP 200", `Status: ${legitLoginRes.status}`);
  const legitLoginJson = await legitLoginRes.json();
  assert(legitLoginJson.success === true, "Login response indicates success: true");

  // ---------------------------------------------------------------------------
  // TEST 2: Multi-Login Attempt from Second (Unauthorized) Device
  // ---------------------------------------------------------------------------
  console.log("\n--- TEST 2: Multi-Login Attempt from Unauthorized Device ---");
  const rogueFingerprint = "fp_unauthorized_second_device_99";
  const rogueLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: "siti@company.com",
      password: "employee123",
      deviceFingerprint: rogueFingerprint,
      deviceName: "Unapproved Office PC",
    }),
  });

  assert(rogueLoginRes.status === 423, "Multi-login attempt strictly blocked with HTTP 423 Locked", `Status: ${rogueLoginRes.status}`);
  const rogueJson = await rogueLoginRes.json();
  assert(rogueJson.error === "DEVICE_NOT_AUTHORIZED", "Error code is DEVICE_NOT_AUTHORIZED", rogueJson.error);
  assert(Boolean(rogueJson.requestCode), "Unlock request code generated for Owner review", rogueJson.requestCode);

  // Verify pending unlock request recorded in database
  const pendingReq = await prisma.deviceUnlockRequest.findFirst({
    where: {
      userId: siti!.id,
      requestedFingerprint: rogueFingerprint,
      status: "PENDING",
    },
  });
  assert(Boolean(pendingReq), "Unlock request persisted in database with PENDING status");

  // ---------------------------------------------------------------------------
  // TEST 3: Active Session Device Mismatch Rejection
  // ---------------------------------------------------------------------------
  console.log("\n--- TEST 3: Stale Session Device Mismatch Protection ---");
  // Simulate an old session with an unauthorized fingerprint
  const staleSession = await prisma.session.create({
    data: {
      sessionToken: "test_stale_mismatched_token_abc",
      userId: siti!.id,
      deviceFingerprint: "fp_old_obsolete_device",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  const mockReq = new Request("http://localhost:3000/api/employee/dashboard", {
    headers: { cookie: `payroll_auth_token=${staleSession.sessionToken}` },
  });

  const resolvedUser = await getCurrentUser(mockReq);
  assert(resolvedUser === null, "Session with mismatched device fingerprint is rejected (null)");

  const sessionStillExists = await prisma.session.findUnique({
    where: { sessionToken: staleSession.sessionToken },
  });
  assert(sessionStillExists === null, "Mismatched session was immediately deleted from database");

  // ---------------------------------------------------------------------------
  // TEST 4: Owner Admin Reset Workflow
  // ---------------------------------------------------------------------------
  console.log("\n--- TEST 4: Mandatory Admin Reset Workflow ---");
  // Owner logs in
  const ownerLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: "owner@company.com",
      password: "admin123",
      deviceFingerprint: "fp_owner_terminal",
      deviceName: "Owner Workstation",
    }),
  });
  assert(ownerLoginRes.status === 200, "Owner login succeeds with HTTP 200");
  const ownerCookie = ownerLoginRes.headers.get("set-cookie")?.split(";")[0] || "";

  // Owner executes RESET_DEVICE on Siti Rahma
  const resetRes = await fetch(`${BASE_URL}/api/owner/devices`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: ownerCookie,
    },
    body: JSON.stringify({
      action: "RESET_DEVICE",
      userId: siti!.id,
      reason: "Employee replaced phone with new hardware",
    }),
  });

  assert(resetRes.status === 200, "Owner RESET_DEVICE executes with HTTP 200", `Status: ${resetRes.status}`);
  const resetJson = await resetRes.json();
  assert(resetJson.success === true, "Reset response indicates success: true");

  // Verify device is marked inactive/revoked in database
  const updatedDev = await prisma.deviceRegistration.findUnique({
    where: { userId: siti!.id },
  });
  assert(updatedDev?.isActive === false, "Device registration isActive is false after reset");
  assert(updatedDev?.status === "REVOKED", "Device registration status is REVOKED");

  // Verify all pending requests are marked EXPIRED
  const expiredReq = await prisma.deviceUnlockRequest.findFirst({
    where: { id: pendingReq!.id },
  });
  assert(expiredReq?.status === "EXPIRED", "Pending unlock requests expired upon admin reset");

  // ---------------------------------------------------------------------------
  // TEST 5: Automatic Binding on New Replacement Terminal
  // ---------------------------------------------------------------------------
  console.log("\n--- TEST 5: Automatic Binding of New Replacement Terminal ---");
  const newPhoneFingerprint = "fp_siti_new_replacement_iphone_15";
  const newPhoneLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: "siti@company.com",
      password: "employee123",
      deviceFingerprint: newPhoneFingerprint,
      deviceName: "Siti's New iPhone 15",
    }),
  });

  assert(newPhoneLoginRes.status === 200, "New replacement device login succeeds with HTTP 200", `Status: ${newPhoneLoginRes.status}`);
  const newPhoneJson = await newPhoneLoginRes.json();
  assert(newPhoneJson.success === true, "New device login success: true");

  // Verify the new device is now bound and active in database
  const reboundDev = await prisma.deviceRegistration.findUnique({
    where: { userId: siti!.id },
  });
  assert(reboundDev?.isActive === true, "Rebound device isActive is true");
  assert(reboundDev?.deviceFingerprint === newPhoneFingerprint, "Rebound device fingerprint matches new phone", reboundDev?.deviceFingerprint);

  // ---------------------------------------------------------------------------
  // TEST 6: Old Device Now Blocked
  // ---------------------------------------------------------------------------
  console.log("\n--- TEST 6: Old Device is Now Blocked from Login ---");
  const oldDeviceLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: "siti@company.com",
      password: "employee123",
      deviceFingerprint: legitFingerprint, // The old Pixel 7
      deviceName: "Old Siti Pixel 7",
    }),
  });

  assert(oldDeviceLoginRes.status === 423, "Previous device is now strictly blocked with HTTP 423 Locked", `Status: ${oldDeviceLoginRes.status}`);

  // Restore Siti to original seed state
  await prisma.deviceRegistration.update({
    where: { userId: siti!.id },
    data: {
      deviceFingerprint: legitFingerprint,
      deviceName: "Siti's Authorized Pixel 7",
      platform: "Android Phone",
      isActive: true,
      status: "ACTIVE",
    },
  });
  await prisma.deviceUnlockRequest.deleteMany({
    where: { userId: siti!.id },
  });
  await prisma.session.deleteMany({
    where: { userId: siti!.id },
  });

  console.log("\n================================================================================");
  console.log(`MULTI-LOGIN TESTS: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
  console.log("================================================================================");
}

runMultiLoginSuite()
  .catch((e) => {
    console.error("Multi-login test error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
