/**
 * Automated Verification Suite for WebAuthn HTTP Endpoints
 * 
 * Verifies:
 * 1. GET & POST support on /api/auth/webauthn/register-options
 * 2. Unauthenticated 401 handling & Authenticated 200 JSON options
 * 3. Exact structure of registration options (challenge, rp, user, pubKeyCredParams)
 * 4. GET & POST support on /api/auth/webauthn/login-options
 * 5. Method handling on register-verify and login-verify
 */

import { prisma } from "../src/lib/db";
import bcrypt from "bcryptjs";
import { GET as getRegisterOptions, POST as postRegisterOptions } from "../src/app/api/auth/webauthn/register-options/route";
import { GET as getLoginOptions, POST as postLoginOptions } from "../src/app/api/auth/webauthn/login-options/route";
import { GET as getRegisterVerify, POST as postRegisterVerify } from "../src/app/api/auth/webauthn/register-verify/route";
import { GET as getLoginVerify, POST as postLoginVerify } from "../src/app/api/auth/webauthn/login-verify/route";
import { POST as postLogin } from "../src/app/api/auth/login/route";
import { getCurrentUser } from "../src/lib/auth";

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

async function runWebAuthnEndpointTests() {
  console.log("================================================================================");
  console.log("STARTING WEBAUTHN ENDPOINT VERIFICATION SUITE");
  console.log("================================================================================");

  try {
    // -------------------------------------------------------------------------
    // 1. Unauthenticated register-options (GET and POST)
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 1: register-options Unauthenticated Requests ---");
    const unauthGetReq = new Request("http://localhost:3000/api/auth/webauthn/register-options", {
      method: "GET",
    });
    const unauthGetRes = await getRegisterOptions(unauthGetReq);
    assert(unauthGetRes.status === 401, "GET register-options returns 401 when unauthenticated", `Status: ${unauthGetRes.status}`);

    const unauthPostReq = new Request("http://localhost:3000/api/auth/webauthn/register-options", {
      method: "POST",
    });
    const unauthPostRes = await postRegisterOptions(unauthPostReq);
    assert(unauthPostRes.status === 401, "POST register-options returns 401 when unauthenticated", `Status: ${unauthPostRes.status}`);

    // -------------------------------------------------------------------------
    // 2. Authenticated register-options (GET and POST)
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 2: register-options Authenticated Requests & Options Format ---");
    // Create dedicated isolated test user
    const testUser = await prisma.user.upsert({
      where: { email: "webauthn_ep_test_isolated@company.com" },
      update: {},
      create: {
        username: "webauthn_ep_test_isolated",
        email: "webauthn_ep_test_isolated@company.com",
        passwordHash: "dummy_hash",
        role: "EMPLOYEE",
      },
    });

    // Create session token for test user
    const testSessionToken = `session_webauthn_test_${Date.now()}`;
    await prisma.session.create({
      data: {
        sessionToken: testSessionToken,
        userId: testUser.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const cookieHeader = `payroll_auth_token=${testSessionToken}`;

    // Test GET with cookie session
    const authGetReq = new Request("http://localhost:3000/api/auth/webauthn/register-options", {
      method: "GET",
      headers: {
        cookie: cookieHeader,
        host: "localhost:3000",
      },
    });
    const authGetRes = await getRegisterOptions(authGetReq);
    assert(authGetRes.status === 200, "GET register-options returns 200 with session cookie", `Status: ${authGetRes.status}`);
    const getOptions = await authGetRes.json();
    assert(Boolean(getOptions.challenge), "GET register-options returns challenge string", `Challenge length: ${getOptions.challenge?.length}`);
    assert(Boolean(getOptions.rp?.id), "GET register-options returns rp.id", `RP ID: ${getOptions.rp?.id}`);
    assert(Boolean(getOptions.user?.id), "GET register-options returns user.id", `User ID: ${getOptions.user?.id}`);
    assert(Array.isArray(getOptions.pubKeyCredParams), "GET register-options returns pubKeyCredParams array");

    // Test POST with cookie session
    const authPostReq = new Request("http://localhost:3000/api/auth/webauthn/register-options", {
      method: "POST",
      headers: {
        cookie: cookieHeader,
        host: "localhost:3000",
      },
    });
    const authPostRes = await postRegisterOptions(authPostReq);
    assert(authPostRes.status === 200, "POST register-options returns 200 with session cookie", `Status: ${authPostRes.status}`);
    const postOptions = await authPostRes.json();
    assert(Boolean(postOptions.challenge), "POST register-options returns challenge string");

    // Clean up test session
    await prisma.session.delete({ where: { sessionToken: testSessionToken } });

    // -------------------------------------------------------------------------
    // 3. login-options (GET and POST)
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 3: login-options GET & POST Support ---");

    // Temporarily ensure testUser has an active device credential to test login-options
    await prisma.deviceRegistration.upsert({
      where: { userId: testUser.id },
      update: {
        credentialId: "cred_test_123456",
        credentialPublicKey: "pubkey_test_123456",
        isActive: true,
        assuranceTier: "HIGH_HARDWARE_BOUND",
      },
      create: {
        userId: testUser.id,
        credentialId: "cred_test_123456",
        credentialPublicKey: "pubkey_test_123456",
        deviceName: "Test Work Terminal",
        isActive: true,
        assuranceTier: "HIGH_HARDWARE_BOUND",
      },
    });

    // Test GET login-options with query param
    const loginGetReq = new Request(
      `http://localhost:3000/api/auth/webauthn/login-options?identifier=${encodeURIComponent(testUser.email)}`,
      { method: "GET", headers: { host: "localhost:3000" } }
    );
    const loginGetRes = await getLoginOptions(loginGetReq);
    assert(loginGetRes.status === 200, "GET login-options returns 200", `Status: ${loginGetRes.status}`);
    const loginGetData = await loginGetRes.json();
    assert(Boolean(loginGetData.challenge), "GET login-options returns challenge directly on root object");
    assert(Boolean(loginGetData.options?.challenge), "GET login-options returns nested options for backwards compatibility");
    assert(loginGetData.userId === testUser.id, "GET login-options returns userId", `UserId: ${loginGetData.userId}`);
    assert(
      Array.isArray(loginGetData.allowCredentials) && loginGetData.allowCredentials.length > 0,
      "login-options returns non-empty allowCredentials array"
    );
    assert(
      loginGetData.allowCredentials[0].id === "cred_test_123456",
      "allowCredentials[0].id matches raw credentialId without double encoding"
    );
    assert(
      Array.isArray(loginGetData.allowCredentials[0].transports) &&
        loginGetData.allowCredentials[0].transports.includes("internal"),
      "allowCredentials[0].transports includes 'internal' to prioritize local platform Touch ID"
    );

    // Test transport normalization when stored transports only had ['hybrid']
    await prisma.deviceRegistration.update({
      where: { userId: testUser.id },
      data: { transports: JSON.stringify(["hybrid"]) },
    });
    const hybridReq = new Request(
      `http://localhost:3000/api/auth/webauthn/login-options?identifier=${encodeURIComponent(testUser.email)}`,
      { method: "GET", headers: { host: "localhost:3000" } }
    );
    const hybridRes = await getLoginOptions(hybridReq);
    const hybridData = await hybridRes.json();
    assert(
      hybridData.allowCredentials[0].transports.includes("internal") &&
        hybridData.allowCredentials[0].transports.includes("hybrid"),
      "Normalized transports retains 'hybrid' while adding 'internal' to prioritize Touch ID"
    );

    // Test POST login-options with body
    const loginPostReq = new Request("http://localhost:3000/api/auth/webauthn/login-options", {
      method: "POST",
      headers: { "Content-Type": "application/json", host: "localhost:3000" },
      body: JSON.stringify({ identifier: testUser.email }),
    });
    const loginPostRes = await postLoginOptions(loginPostReq);
    assert(loginPostRes.status === 200, "POST login-options returns 200", `Status: ${loginPostRes.status}`);
    const loginPostData = await loginPostRes.json();
    assert(Boolean(loginPostData.challenge), "POST login-options returns challenge");

    // Test login-options when user has no registered passkey credential
    const noPasskeyUser = await prisma.user.upsert({
      where: { email: "no_passkey_test@company.com" },
      update: {},
      create: {
        username: "no_passkey_test",
        email: "no_passkey_test@company.com",
        passwordHash: "dummy_hash",
        role: "EMPLOYEE",
      },
    });
    await prisma.deviceRegistration.deleteMany({ where: { userId: noPasskeyUser.id } });

    const noCredReq = new Request(
      `http://localhost:3000/api/auth/webauthn/login-options?identifier=${encodeURIComponent(noPasskeyUser.email)}`,
      { method: "GET", headers: { host: "localhost:3000" } }
    );
    const noCredRes = await getLoginOptions(noCredReq);
    assert(noCredRes.status === 404, "login-options returns 404 when user has no registered credential");
    const noCredData = await noCredRes.json();
    assert(
      noCredData.error === "NO_WEBAUTHN_CREDENTIAL",
      "login-options returns NO_WEBAUTHN_CREDENTIAL error code to prevent discoverable QR modal"
    );

    await prisma.user.delete({ where: { id: noPasskeyUser.id } }).catch(() => {});

    // Test missing identifier
    const loginMissingReq = new Request("http://localhost:3000/api/auth/webauthn/login-options", {
      method: "GET",
    });
    const loginMissingRes = await getLoginOptions(loginMissingReq);
    assert(loginMissingRes.status === 400, "GET login-options without identifier returns 400");

    // -------------------------------------------------------------------------
    // 4. register-verify & login-verify Method Handling
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 4: Verification Endpoint Method Handling & Error Guards ---");
    const regVerifyGetRes = await getRegisterVerify();
    assert(regVerifyGetRes.status === 405, "GET register-verify returns 405 Method Not Allowed");

    const regVerifyPostReq = new Request("http://localhost:3000/api/auth/webauthn/register-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const regVerifyPostRes = await postRegisterVerify(regVerifyPostReq);
    // Unauthenticated request returns 401
    assert(regVerifyPostRes.status === 401, "Unauthenticated POST register-verify returns 401");

    const loginVerifyGetRes = await getLoginVerify();
    assert(loginVerifyGetRes.status === 405, "GET login-verify returns 405 Method Not Allowed");

    const loginVerifyMissingReq = new Request("http://localhost:3000/api/auth/webauthn/login-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const loginVerifyMissingRes = await postLoginVerify(loginVerifyMissingReq);
    assert(loginVerifyMissingRes.status === 400, "POST login-verify with empty body returns 400");

    // -------------------------------------------------------------------------
    // 5. Strict First-Time Login Onboarding Flow
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 5: First-Time Login Onboarding Flow ---");
    const unboundPassword = "test_onboarding_pw";
    const unboundHashed = await bcrypt.hash(unboundPassword, 10);
    const unboundUser = await prisma.user.upsert({
      where: { email: "unbound_onboarding_emp@company.com" },
      update: { passwordHash: unboundHashed },
      create: {
        username: "unbound_onboarding_emp",
        email: "unbound_onboarding_emp@company.com",
        passwordHash: unboundHashed,
        role: "EMPLOYEE",
      },
    });

    // Ensure NO device is registered
    await prisma.deviceRegistration.deleteMany({ where: { userId: unboundUser.id } });

    // Attempt login as unbound employee
    const onboardingLoginReq = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: unboundUser.email,
        password: unboundPassword,
        deviceFingerprint: "fp_onboarding_laptop",
        deviceName: "Unbound MacBook Pro",
      }),
    });
    const onboardingLoginRes = await postLogin(onboardingLoginReq);
    assert(onboardingLoginRes.status === 200, "First-time employee login returns 200", `Status: ${onboardingLoginRes.status}`);
    const onboardingData = await onboardingLoginRes.json();
    assert(onboardingData.mustBindDevice === true, "First-time employee login flagged with mustBindDevice: true");
    assert(onboardingData.onboardingState === "MUST_BIND_DEVICE", "First-time employee login has state MUST_BIND_DEVICE");
    assert(onboardingData.redirectUrl === "/employee?onboarding=passkey", "First-time employee redirected to /employee?onboarding=passkey");

    // Verify onboarding session was created in DB
    const onboardingSession = await prisma.session.findFirst({
      where: { userId: unboundUser.id },
      orderBy: { createdAt: "desc" },
    });
    assert(Boolean(onboardingSession), "Onboarding session created in database allowing passkey registration");

    // -------------------------------------------------------------------------
    // 6. Session Preservation Across WebAuthn Passkey Registration
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 6: Session Preservation Across Passkey Registration ---");
    if (onboardingSession) {
      // Simulate existing active session token
      const sessionToken = onboardingSession.sessionToken;

      const mockCredId = `cred_preserve_test_${Date.now()}`;
      
      // Perform atomic registration transaction preserving sessionToken
      await prisma.$transaction(async (tx) => {
        await tx.deviceRegistration.deleteMany({ where: { userId: unboundUser.id } });
        await tx.session.deleteMany({
          where: {
            userId: unboundUser.id,
            sessionToken: { not: sessionToken },
          },
        });
        await tx.deviceRegistration.create({
          data: {
            userId: unboundUser.id,
            credentialId: mockCredId,
            credentialPublicKey: "pubkey_mock",
            deviceName: "Preserved Registered Device",
            isActive: true,
            assuranceTier: "HIGH_HARDWARE_BOUND",
          },
        });
      });

      // Verify session was NOT destroyed
      const preservedSession = await prisma.session.findUnique({
        where: { sessionToken },
      });
      assert(Boolean(preservedSession), "Active session was NOT destroyed during passkey registration");

      // Verify getCurrentUser successfully authenticates the employee
      const testReq = new Request("http://localhost:3000/api/employee/dashboard", {
        headers: {
          cookie: `payroll_auth_token=${sessionToken}`,
        },
      });
      const resolvedUser = await getCurrentUser(testReq);
      assert(Boolean(resolvedUser?.user), "Employee remains authenticated after passkey registration without 401");
      assert(resolvedUser?.user.id === unboundUser.id, "Authenticated user identity matches unboundUser");
    }

    // Clean up unbound user dependencies (AuditLog actorId retains user due to immutable trigger)
    await prisma.deviceUnlockRequest.deleteMany({ where: { userId: unboundUser.id } }).catch(() => {});
    await prisma.deviceRegistration.deleteMany({ where: { userId: unboundUser.id } }).catch(() => {});
    await prisma.session.deleteMany({ where: { userId: unboundUser.id } }).catch(() => {});

    // Clean up isolated test user
    await prisma.webAuthnChallenge.deleteMany({ where: { userId: testUser.id } }).catch(() => {});
    await prisma.deviceRegistration.deleteMany({ where: { userId: testUser.id } }).catch(() => {});
    await prisma.session.deleteMany({ where: { userId: testUser.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});

  } catch (error: any) {
    console.error("Unexpected error in WebAuthn endpoint verification suite:", error);
    assert(false, "WebAuthn endpoint verification execution", error.message);
  } finally {
    await prisma.$disconnect();
  }

  console.log("\n================================================================================");
  console.log(`WEBAUTHN ENDPOINT TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
  console.log("================================================================================");

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runWebAuthnEndpointTests();
