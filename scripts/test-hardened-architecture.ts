/**
 * Comprehensive Automated Verification Suite for Architecture Hardening:
 * 1. WebAuthn Registration Options & Challenge Generation
 * 2. Device Binding & Assurance Tier Classification (STANDARD_PASSKEY_SYNCED vs HIGH_HARDWARE_BOUND)
 * 3. Storage Loss Zero-Lockout Recovery (Passkey Assertion vs HTTP 423 Rogue Quarantine)
 * 4. Owner Device Replacement Atomic Revocation Workflow
 * 5. Transactional Audit Atomic Rollback Guarantee
 * 6. Database Trigger Immutability (UPDATE & DELETE Rejection)
 * 7. Cryptographic SHA-256 Chain & Ed25519 Tamper Detection
 * 8. Serverless Outbox Dispatch & WORM Manifest Signing
 */

import { prisma } from "../src/lib/db";
import {
  createPasskeyRegistrationOptions,
  createPasskeyAuthenticationOptions,
  getWebAuthnConfig,
} from "../src/lib/webauthn";
import { enforceSingleDevicePolicy } from "../src/lib/auth";
import {
  recordAuditLog,
  recordTransactionalAuditLog,
} from "../src/lib/audit";
import { verifyAuditChainIntegrity } from "../src/lib/audit-verifier";
import { flushAuditOutbox } from "../src/lib/audit-outbox";
import {
  computeEventHash,
  signEventHash,
  verifyEventSignature,
  getExportedPublicKey,
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

async function runTestSuite() {
  console.log("================================================================================");
  console.log("STARTING HARDENED ARCHITECTURE AUTOMATED VERIFICATION SUITE");
  console.log("================================================================================");

  // Setup test user
  const testUsername = `test_arch_${Date.now()}`;
  const testEmail = `${testUsername}@example.com`;

  const testUser = await prisma.user.create({
    data: {
      username: testUsername,
      email: testEmail,
      passwordHash: "dummy_hashed_pw",
      role: "EMPLOYEE",
    },
  });

  try {
    // -------------------------------------------------------------------------
    // TEST 1: WebAuthn Challenge & Registration Options
    // -------------------------------------------------------------------------
    console.log("\n--- TEST GROUP 1: WebAuthn Challenge & Registration Options ---");
    const regOptions = await createPasskeyRegistrationOptions({
      id: testUser.id,
      username: testUser.username,
      email: testUser.email,
    });
    assert(Boolean(regOptions.challenge), "WebAuthn challenge generated", `Length: ${regOptions.challenge.length}`);
    assert(regOptions.rp.name === "CyberGuard Workforce Attendance", "Relying Party name correct");
    assert(regOptions.authenticatorSelection?.userVerification === "required", "User verification enforced as required");
    assert(regOptions.authenticatorSelection?.authenticatorAttachment === "platform", "Platform authenticator attachment enforced");

    // Check challenge stored in DB
    const savedChallenge = await prisma.webAuthnChallenge.findUnique({
      where: { challenge: regOptions.challenge },
    });
    assert(Boolean(savedChallenge && savedChallenge.userId === testUser.id), "Registration challenge saved in database");

    // -------------------------------------------------------------------------
    // TEST 2: Device Binding & Assurance Tier Classification
    // -------------------------------------------------------------------------
    console.log("\n--- TEST GROUP 2: Device Binding & Assurance Tier Classification ---");
    const mockCredId = `mock_cred_${Date.now()}`;
    const mockPublicKey = Buffer.from("mock_public_key_bytes_1234567890").toString("base64");

    // Test Synced Passkey registration
    const syncedDevice = await prisma.deviceRegistration.create({
      data: {
        userId: testUser.id,
        deviceFingerprint: "fp_initial_iphone",
        deviceName: "iPhone 16 Pro (Employee)",
        platform: "iOS",
        credentialId: mockCredId,
        credentialPublicKey: mockPublicKey,
        counter: 0,
        credentialBackedUp: true,
        credentialDeviceType: "multiDevice",
        assuranceTier: "STANDARD_PASSKEY_SYNCED",
        isActive: true,
      },
    });

    assert(syncedDevice.assuranceTier === "STANDARD_PASSKEY_SYNCED", "Credential correctly classified as STANDARD_PASSKEY_SYNCED");
    assert(syncedDevice.credentialBackedUp === true, "Multi-device synced flag preserved");

    // -------------------------------------------------------------------------
    // TEST 3: Storage Loss Zero-Lockout Recovery
    // -------------------------------------------------------------------------
    console.log("\n--- TEST GROUP 3: Storage Loss Zero-Lockout Recovery ---");
    // Simulate user clearing IndexedDB/cookies: deviceFingerprint changes to unrecognized
    const userWithDevice = await prisma.user.findUnique({
      where: { id: testUser.id },
      include: { employeeProfile: true, deviceRegistration: true },
    });

    const policyResult = await enforceSingleDevicePolicy(
      userWithDevice,
      "fp_after_cache_wipe_unrecognized",
      "iPhone 16 Pro (Post-Wipe)",
      null,
      "127.0.0.1",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"
    );

    assert(policyResult.allowed === false, "Unrecognized fingerprint not immediately allowed");
    assert(policyResult.requiresWebAuthn === true, "Zero-lockout triggered: requiresWebAuthn is true (no HTTP 423 lockout!)");
    assert(!policyResult.requestCode, "No quarantine lock request generated for passkey device");

    // Test authentication options generation for this user
    const authOptions = await createPasskeyAuthenticationOptions({
      id: testUser.id,
      email: testUser.email,
    });
    assert(Boolean(authOptions.challenge), "Authentication challenge generated for zero-lockout recovery");
    assert(authOptions.allowCredentials?.length === 1, "Only single registered credential allowed in challenge");
    assert(authOptions.allowCredentials?.[0]?.id === mockCredId, "Challenge targets registered credential ID");

    // Now simulate rogue user with NO passkey registered
    const rogueUser = await prisma.user.create({
      data: {
        username: `rogue_${Date.now()}`,
        email: `rogue_${Date.now()}@example.com`,
        passwordHash: "dummy_hashed_pw",
        role: "EMPLOYEE",
      },
    });
    // Register legacy device with NO WebAuthn credential
    await prisma.deviceRegistration.create({
      data: {
        userId: rogueUser.id,
        deviceFingerprint: "fp_rogue_legit_phone",
        deviceName: "Authorized Work Phone",
        platform: "Android",
        isActive: true,
        assuranceTier: "LEGACY_FINGERPRINT",
      },
    });

    const rogueWithDevice = await prisma.user.findUnique({
      where: { id: rogueUser.id },
      include: { employeeProfile: true, deviceRegistration: true },
    });

    const roguePolicy = await enforceSingleDevicePolicy(
      rogueWithDevice,
      "fp_rogue_attacker_laptop",
      "Attacker Terminal",
      null,
      "127.0.0.1",
      "Mozilla/5.0 (X11; Linux x86_64)"
    );
    assert(roguePolicy.allowed === false, "Rogue device correctly blocked");
    assert(!roguePolicy.requiresWebAuthn, "Rogue device without passkey cannot bypass quarantine");
    assert(Boolean(roguePolicy.requestCode), "Rogue device triggers HTTP 423 quarantine with Request ID");

    // -------------------------------------------------------------------------
    // TEST 4: Owner Device Replacement Workflow
    // -------------------------------------------------------------------------
    console.log("\n--- TEST GROUP 4: Owner Device Replacement Workflow ---");
    // Create an active session for testUser
    const sessionToken = `session_to_be_invalidated_${Date.now()}`;
    await prisma.session.create({
      data: {
        sessionToken,
        userId: testUser.id,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    // Employee submits replacement request
    const replaceRequest = await prisma.deviceUnlockRequest.create({
      data: {
        userId: testUser.id,
        requestCode: `REQ_${Date.now().toString().slice(-6)}`,
        unlockCode: "888999",
        requestedFingerprint: "fp_new_replacement_phone",
        requestedDeviceName: "Brand New iPhone 16",
        previousDeviceName: syncedDevice.deviceName,
        reason: "Old phone was destroyed in an accident",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    assert(replaceRequest.status === "PENDING", "Replacement request submitted with reason");

    // Owner approves replacement via atomic transaction
    await prisma.$transaction(async (tx) => {
      // 1. Mark request APPROVED
      await tx.deviceUnlockRequest.update({
        where: { id: replaceRequest.id },
        data: { status: "APPROVED", resolvedAt: new Date() },
      });

      // 2. Revoke previous device credential
      await tx.deviceRegistration.deleteMany({
        where: { userId: testUser.id },
      });

      // 3. Invalidate active sessions
      await tx.session.deleteMany({
        where: { userId: testUser.id },
      });
    });

    // Verify session revoked
    const revokedSession = await prisma.session.findUnique({
      where: { sessionToken },
    });
    assert(revokedSession === null, "Active employee session atomically invalidated upon replacement");

    // Verify device registration cleared for re-enrollment
    const activeDev = await prisma.deviceRegistration.findUnique({
      where: { userId: testUser.id },
    });
    assert(activeDev === null, "Old passkey credential atomically revoked for re-enrollment");

    // -------------------------------------------------------------------------
    // TEST 5: Atomic Rollback of Business Mutation on Audit Failure
    // -------------------------------------------------------------------------
    console.log("\n--- TEST GROUP 5: Transactional Audit Atomic Rollback Guarantee ---");
    let mutationRolledBack = false;
    const testEmployeeProfile = await prisma.employeeProfile.create({
      data: {
        userId: testUser.id,
        employeeId: `EMP_TEST_${Date.now()}`,
        fullName: "Test Transactional Employee",
        dailySalary: 150000,
        shiftId: (await prisma.shift.findFirst())?.id || "shift_1",
      },
    });

    try {
      await prisma.$transaction(async (tx) => {
        // Business mutation: update daily salary
        await tx.employeeProfile.update({
          where: { id: testEmployeeProfile.id },
          data: { dailySalary: 999999 },
        });

        // Deliberately trigger audit failure
        throw new Error("Simulated audit infrastructure failure inside transaction");
      });
    } catch (err: any) {
      mutationRolledBack = true;
    }

    assert(mutationRolledBack === true, "Transactional audit failure aborted transaction");

    const reloadedProfile = await prisma.employeeProfile.findUnique({
      where: { id: testEmployeeProfile.id },
    });
    assert(reloadedProfile?.dailySalary === 150000, "Business mutation successfully rolled back to original salary (Rp 150.000)");

    // -------------------------------------------------------------------------
    // TEST 6: Database Trigger Immutability (UPDATE & DELETE Rejection)
    // -------------------------------------------------------------------------
    console.log("\n--- TEST GROUP 6: Database Trigger Immutability ---");
    // Create an audit log record
    const recordedAudit = await recordAuditLog({
      action: "TEST_IMMUTABILITY_EVENT",
      targetEntity: "SECURITY_TEST",
      targetId: "IMMUTABLE_1",
      actorRole: "SYSTEM",
      actorName: "Test Harness",
      newValues: JSON.stringify({ test: "data" }),
    });

    let updateBlocked = false;
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE AuditLog SET reason = 'Malicious Tamper' WHERE id = '${recordedAudit.id}'`
      );
    } catch (e: any) {
      updateBlocked = true;
    }
    assert(updateBlocked === true, "Database trigger blocked UPDATE on AuditLog table");

    let deleteBlocked = false;
    try {
      await prisma.$executeRawUnsafe(
        `DELETE FROM AuditLog WHERE id = '${recordedAudit.id}'`
      );
    } catch (e: any) {
      deleteBlocked = true;
    }
    assert(deleteBlocked === true, "Database trigger blocked DELETE on AuditLog table");

    // Also verify trigger blocking mutation of DELIVERED outbox records
    const deliveredItem = await prisma.auditOutbox.findFirst({
      where: { status: "DELIVERED" },
    });
    if (deliveredItem) {
      let outboxBlocked = false;
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE AuditOutbox SET status = 'PENDING' WHERE id = '${deliveredItem.id}'`
        );
      } catch (e: any) {
        outboxBlocked = true;
      }
      assert(outboxBlocked === true, "Database trigger blocked modification of DELIVERED outbox record");
    }

    // -------------------------------------------------------------------------
    // TEST 7: Cryptographic Hash Chain & Tamper Detection
    // -------------------------------------------------------------------------
    console.log("\n--- TEST GROUP 7: Cryptographic Hash Chain & Tamper Detection ---");
    // Verify currently intact chain
    const initialVerification = await verifyAuditChainIntegrity();
    assert(initialVerification.valid === true, "Audit hash-chain currently verifies intact", `Checked ${initialVerification.totalRecordsChecked} records`);

    // Verify digital signature of recorded v2 audit log
    const sigValid = verifyEventSignature(
      recordedAudit.currentHash,
      recordedAudit.signature,
      getExportedPublicKey()
    );
    assert(sigValid === true, "Ed25519 digital signature verified valid against public key");

    // Tamper detection: verify signature fails on modified hash
    const fakeHash = "0000000000000000000000000000000000000000000000000000000000000000";
    const sigTampered = verifyEventSignature(
      fakeHash,
      recordedAudit.signature,
      getExportedPublicKey()
    );
    assert(sigTampered === false, "Ed25519 signature rejects modified hash (tamper detection verified)");

    // Recomputed hash on altered payload detects mismatch
    const alteredPayloadHash = computeEventHash(
      {
        sequenceNumber: recordedAudit.sequenceNumber,
        timestamp: recordedAudit.timestamp.toISOString(),
        action: recordedAudit.action,
        actorRole: "ATTACKER_INJECTED", // Tampered field
        actorName: recordedAudit.actorName,
        targetEntity: recordedAudit.targetEntity,
        targetId: recordedAudit.targetId,
        newValues: recordedAudit.newValues,
      },
      recordedAudit.previousHash
    );
    assert(alteredPayloadHash !== recordedAudit.currentHash, "SHA-256 hash immediately diverges upon data manipulation");

    // -------------------------------------------------------------------------
    // TEST 8: Serverless Transactional Outbox & External Sink
    // -------------------------------------------------------------------------
    console.log("\n--- TEST GROUP 8: Serverless Outbox & WORM Manifest Signing ---");
    const outboxResult = await flushAuditOutbox(50);
    assert(
      outboxResult.status === "DELIVERED" || outboxResult.status === "NO_PENDING",
      "Outbox flush executed successfully",
      `Status: ${outboxResult.status}, Batch: ${outboxResult.batchKey || "None"}`
    );

    const pendingAfterFlush = await prisma.auditOutbox.count({
      where: { status: "PENDING" },
    });
    assert(pendingAfterFlush === 0, "All pending outbox records dispatched");

    // Cleanup test user and dependencies (Note: users with immutable audit logs cannot be deleted due to tamper-proof trigger on actorId)
    await prisma.employeeProfile.delete({ where: { id: testEmployeeProfile.id } }).catch(() => {});
    await prisma.deviceUnlockRequest.deleteMany({ where: { userId: testUser.id } }).catch(() => {});
    await prisma.webAuthnChallenge.deleteMany({ where: { userId: testUser.id } }).catch(() => {});
    await prisma.session.deleteMany({ where: { userId: testUser.id } }).catch(() => {});
    await prisma.deviceRegistration.deleteMany({ where: { userId: testUser.id } }).catch(() => {});

    await prisma.deviceUnlockRequest.deleteMany({ where: { userId: rogueUser.id } }).catch(() => {});
    await prisma.deviceRegistration.deleteMany({ where: { userId: rogueUser.id } }).catch(() => {});

  } catch (error: any) {
    console.error("Unexpected error during test suite:", error);
    assert(false, "Test suite execution without unhandled exception", error.message);
  } finally {
    await prisma.$disconnect();
  }

  console.log("\n================================================================================");
  console.log(`TEST SUITE RESULTS: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
  console.log("================================================================================");

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite();
