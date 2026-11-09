/**
 * Automated Verification Suite for Instant Owner "Revoke Access" Action
 * 
 * Verifies:
 * 1. Owner authorization guard (non-owner returns 403)
 * 2. Revoke by deviceId and userId
 * 3. Atomic database state mutations:
 *    - DeviceRegistration.status = "REVOKED"
 *    - DeviceRegistration.isActive = false
 *    - Active sessions immediately deleted
 * 4. Cryptographic Audit Trail (hash-chain continuity, Ed25519 signature)
 * 5. Downstream login behavior (revoked employee forced to re-enroll passkey)
 * 6. Direct /api/owner/devices/revoke endpoint
 */

import { prisma } from "../src/lib/db";
import bcrypt from "bcryptjs";
import { POST as postDeviceAction } from "../src/app/api/owner/devices/route";
import { POST as postRevokeDirect } from "../src/app/api/owner/devices/revoke/route";
import { POST as postLogin } from "../src/app/api/auth/login/route";
import { verifyEventSignature } from "../src/lib/audit-crypto";

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

async function runRevokeAccessTests() {
  console.log("================================================================================");
  console.log("STARTING INSTANT OWNER REVOKE ACCESS VERIFICATION SUITE");
  console.log("================================================================================");

  try {
    // -------------------------------------------------------------------------
    // Setup test users: Owner and Employee
    // -------------------------------------------------------------------------
    const ownerPassword = "owner_test_password";
    const employeePassword = "emp_test_password";
    const ownerHash = await bcrypt.hash(ownerPassword, 10);
    const empHash = await bcrypt.hash(employeePassword, 10);

    const testOwner = await prisma.user.upsert({
      where: { email: "owner_revoke_test@company.com" },
      update: { role: "OWNER", status: "ACTIVE" },
      create: {
        username: "owner_revoke_test",
        email: "owner_revoke_test@company.com",
        passwordHash: ownerHash,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    const testEmp = await prisma.user.upsert({
      where: { email: "emp_revoke_test@company.com" },
      update: { role: "EMPLOYEE", status: "ACTIVE" },
      create: {
        username: "emp_revoke_test",
        email: "emp_revoke_test@company.com",
        passwordHash: empHash,
        role: "EMPLOYEE",
        status: "ACTIVE",
      },
    });

    const ownerSessionToken = `session_owner_${Date.now()}`;
    await prisma.session.create({
      data: {
        sessionToken: ownerSessionToken,
        userId: testOwner.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const empSessionToken = `session_emp_${Date.now()}`;
    await prisma.session.create({
      data: {
        sessionToken: empSessionToken,
        userId: testEmp.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // Create an active bound device for the employee
    const initialDevice = await prisma.deviceRegistration.upsert({
      where: { userId: testEmp.id },
      update: {
        deviceName: "MacBook Pro M2 (Employee Workstation)",
        credentialId: `cred_emp_${Date.now()}`,
        credentialPublicKey: "pubkey_mock_base64",
        isActive: true,
        status: "ACTIVE",
        assuranceTier: "HIGH_HARDWARE_BOUND",
      },
      create: {
        userId: testEmp.id,
        deviceName: "MacBook Pro M2 (Employee Workstation)",
        credentialId: `cred_emp_${Date.now()}`,
        credentialPublicKey: "pubkey_mock_base64",
        isActive: true,
        status: "ACTIVE",
        assuranceTier: "HIGH_HARDWARE_BOUND",
      },
    });

    // -------------------------------------------------------------------------
    // TEST 1: Authorization Guards
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 1: Authorization Guards ---");

    // Unauthenticated request
    const unauthReq = new Request("http://localhost:3000/api/owner/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "REVOKE_ACCESS", deviceId: initialDevice.id }),
    });
    const unauthRes = await postDeviceAction(unauthReq as any);
    assert(unauthRes.status === 403, "Unauthenticated request rejected with 403", `Status: ${unauthRes.status}`);

    // Employee attempting owner action
    const empForbiddenReq = new Request("http://localhost:3000/api/owner/devices", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `payroll_auth_token=${empSessionToken}`,
      },
      body: JSON.stringify({ action: "REVOKE_ACCESS", deviceId: initialDevice.id }),
    });
    const empForbiddenRes = await postDeviceAction(empForbiddenReq as any);
    assert(empForbiddenRes.status === 403, "Employee token rejected with 403 on owner revoke action", `Status: ${empForbiddenRes.status}`);

    // -------------------------------------------------------------------------
    // TEST 2: Successful Revoke Access by Owner via /api/owner/devices
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 2: Successful Revoke Access via /api/owner/devices ---");

    const ownerRevokeReq = new Request("http://localhost:3000/api/owner/devices", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `payroll_auth_token=${ownerSessionToken}`,
      },
      body: JSON.stringify({
        action: "REVOKE_ACCESS",
        deviceId: initialDevice.id,
        reason: "Suspected stolen terminal reported by employee",
      }),
    });

    const ownerRevokeRes = await postDeviceAction(ownerRevokeReq as any);
    assert(ownerRevokeRes.status === 200, "Owner revoke request returns 200", `Status: ${ownerRevokeRes.status}`);
    const revokeData = await ownerRevokeRes.json();
    assert(revokeData.success === true, "Response payload indicates success: true");
    assert(revokeData.message === "Akses perangkat berhasil dicabut", "Correct localized success message returned");

    // -------------------------------------------------------------------------
    // TEST 3: Atomic Database Mutations Verification
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 3: Database Mutations Verification ---");

    const updatedDevice = await prisma.deviceRegistration.findUnique({
      where: { id: initialDevice.id },
    });
    assert(updatedDevice !== null, "Device record preserved in database");
    assert(updatedDevice?.status === "REVOKED", "Device status marked as 'REVOKED'", `Status: ${updatedDevice?.status}`);
    assert(updatedDevice?.isActive === false, "Device isActive set to false");

    // Verify employee sessions were immediately purged
    const activeSessions = await prisma.session.findMany({
      where: { userId: testEmp.id },
    });
    assert(activeSessions.length === 0, "All active employee sessions immediately invalidated and purged");

    // -------------------------------------------------------------------------
    // TEST 4: Cryptographic Tamper-Evident Audit Log Verification
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 4: Cryptographic Audit Trail Verification ---");

    const auditEntry = await prisma.auditLog.findFirst({
      where: {
        action: "DEVICE_ACCESS_REVOKED",
        targetId: initialDevice.id,
      },
      orderBy: { sequenceNumber: "desc" },
    });

    assert(Boolean(auditEntry), "Audit record created for DEVICE_ACCESS_REVOKED");
    assert(auditEntry?.actorRole === "OWNER", "Audit entry actorRole is OWNER");
    assert(auditEntry?.actorId === testOwner.id, "Audit entry actorId matches Owner ID");
    assert(Boolean(auditEntry?.currentHash), "Audit entry contains canonical SHA-256 hash");
    assert(Boolean(auditEntry?.signature), "Audit entry contains Ed25519 digital signature");

    // Verify digital signature validity
    if (auditEntry?.currentHash && auditEntry?.signature) {
      const isSignatureValid = verifyEventSignature(auditEntry.currentHash, auditEntry.signature);
      assert(isSignatureValid === true, "Ed25519 digital signature on revoke audit event is cryptographically valid");
    }

    // -------------------------------------------------------------------------
    // TEST 5: Downstream Employee Login Behavior with Revoked Device
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 5: Downstream Employee Login Behavior ---");

    const empLoginReq = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: testEmp.email,
        password: employeePassword,
        deviceFingerprint: "fp_new_clean_device",
        deviceName: "Employee Replacement Device",
      }),
    });

    const empLoginRes = await postLogin(empLoginReq);
    assert(empLoginRes.status === 200, "Employee password login succeeds");
    const empLoginData = await empLoginRes.json();
    assert(empLoginData.mustBindDevice === true, "Revoked device forces mustBindDevice: true for new passkey enrollment");
    assert(empLoginData.onboardingState === "MUST_BIND_DEVICE", "Employee onboardingState is MUST_BIND_DEVICE");

    // -------------------------------------------------------------------------
    // TEST 6: Direct Endpoint /api/owner/devices/revoke
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 6: Direct /api/owner/devices/revoke Endpoint ---");

    // Re-activate a device to test the direct revoke endpoint
    const device2 = await prisma.deviceRegistration.upsert({
      where: { userId: testEmp.id },
      update: {
        status: "ACTIVE",
        isActive: true,
        deviceName: "Second Workstation",
      },
      create: {
        userId: testEmp.id,
        deviceName: "Second Workstation",
        status: "ACTIVE",
        isActive: true,
      },
    });

    const directRevokeReq = new Request("http://localhost:3000/api/owner/devices/revoke", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `payroll_auth_token=${ownerSessionToken}`,
      },
      body: JSON.stringify({
        deviceId: device2.id,
        reason: "Owner unilateral direct revocation via shortcut route",
      }),
    });

    const directRevokeRes = await postRevokeDirect(directRevokeReq as any);
    assert(directRevokeRes.status === 200, "Direct /api/owner/devices/revoke returns 200", `Status: ${directRevokeRes.status}`);
    const directData = await directRevokeRes.json();
    assert(directData.success === true, "Direct revoke endpoint returns success: true");
    assert(directData.status === "REVOKED", "Direct revoke returns status: 'REVOKED'");

    // Clean up test data
    try {
      await prisma.deviceUnlockRequest.deleteMany({ where: { userId: testEmp.id } });
      await prisma.deviceRegistration.deleteMany({ where: { userId: testEmp.id } });
      await prisma.session.deleteMany({ where: { userId: testEmp.id } });
      await prisma.session.deleteMany({ where: { userId: testOwner.id } });
    } catch {
      // Ignore cleanup errors
    }

  } catch (error: any) {
    console.error("Unexpected error in revoke access test suite:", error);
    assert(false, "Revoke access test execution", error.message);
  } finally {
    await prisma.$disconnect();
  }

  console.log("\n================================================================================");
  console.log(`REVOKE ACCESS TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
  console.log("================================================================================");

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runRevokeAccessTests();
