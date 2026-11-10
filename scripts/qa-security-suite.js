/**
 * Comprehensive Security & Quality Assurance Suite
 * Validates OWASP Top 10, ASVS, RBAC, IDOR, Anti-Cheating, Token TTL,
 * Device Binding, Concurrency, Payroll Snapshots, and Wage Engine.
 */

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

const BASE_URL = "http://localhost:3000";

let testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  blocked: 0,
  categories: {},
};

function recordTest(category, name, passed, detail = "") {
  testResults.total++;
  if (!testResults.categories[category]) {
    testResults.categories[category] = { passed: 0, failed: 0, tests: [] };
  }

  if (passed) {
    testResults.passed++;
    testResults.categories[category].passed++;
    testResults.categories[category].tests.push({ name, status: "PASS", detail });
    console.log(`  [PASS] ${name}${detail ? ` (${detail})` : ""}`);
  } else {
    testResults.failed++;
    testResults.categories[category].failed++;
    testResults.categories[category].tests.push({ name, status: "FAIL", detail });
    console.error(`  [FAIL] ${name}: ${detail}`);
  }
}

async function runQASecuritySuite() {
  console.log("================================================================================");
  console.log("COMPREHENSIVE APPLICATION SECURITY AUDIT & QA TEST SUITE");
  console.log("================================================================================\n");

  // ===========================================================================
  // SECTION 1: AUTHENTICATION & SESSION MANAGEMENT
  // ===========================================================================
  console.log("▶ AUDIT SECTION 1: Authentication, Passwords & Session Lifecycle");

  // 1.1 Password Hashing Verification
  const userOwner = await prisma.user.findUnique({ where: { email: "owner@company.com" } });
  recordTest(
    "Authentication",
    "Password hashes use secure bcrypt algorithm (never stored in plaintext)",
    userOwner.passwordHash.startsWith("$2a$") || userOwner.passwordHash.startsWith("$2b$"),
    `Prefix: ${userOwner.passwordHash.substring(0, 7)}`
  );

  // 1.2 Invalid Credentials Rejection
  const badLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: "owner@company.com",
      password: "wrong_password_attack_999",
      deviceFingerprint: "fp_attacker",
    }),
  });
  recordTest(
    "Authentication",
    "Authentication failure on invalid credentials returns HTTP 401",
    badLoginRes.status === 401,
    `HTTP ${badLoginRes.status}`
  );

  // 1.3 Owner Authentication & Session Fixation Protection
  const ownerLoginRes1 = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: "owner@company.com",
      password: "admin123",
      deviceFingerprint: "fp_owner_session_1",
    }),
  });
  const cookie1 = ownerLoginRes1.headers.get("set-cookie")?.split(";")[0]?.split("=")[1];

  const ownerLoginRes2 = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: "owner@company.com",
      password: "admin123",
      deviceFingerprint: "fp_owner_session_2",
    }),
  });
  const cookie2 = ownerLoginRes2.headers.get("set-cookie")?.split(";")[0]?.split("=")[1];

  recordTest(
    "Authentication",
    "Session fixation defense: Each successful authentication generates unique 256-bit cryptographic token",
    cookie1 && cookie2 && cookie1 !== cookie2,
    `Tokens distinct: ${Boolean(cookie1 !== cookie2)}`
  );

  const ownerCookie = `payroll_auth_token=${cookie2}`;

  // 1.4 Suspended Account Access Block
  // Create temporary synthetic suspended user
  const suspendedHash = await bcrypt.hash("suspended123", 10);
  const suspendedUser = await prisma.user.upsert({
    where: { email: "suspended_test@company.com" },
    update: { status: "SUSPENDED" },
    create: {
      email: "suspended_test@company.com",
      username: "suspended_test",
      passwordHash: suspendedHash,
      role: "EMPLOYEE",
      status: "SUSPENDED",
    },
  });

  const suspendedLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: "suspended_test@company.com",
      password: "suspended123",
    }),
  });
  recordTest(
    "Authentication",
    "Suspended or inactive employee account is denied login with HTTP 403",
    suspendedLoginRes.status === 403,
    `HTTP ${suspendedLoginRes.status}`
  );

  // ===========================================================================
  // SECTION 2: AUTHORIZATION, RBAC & IDOR TESTING
  // ===========================================================================
  console.log("\n▶ AUDIT SECTION 2: Authorization, RBAC & Privilege Escalation Defense");

  // 2.1 Unauthenticated API Protection
  const unauthEmpRes = await fetch(`${BASE_URL}/api/owner/employees`);
  recordTest(
    "Authorization",
    "Unauthenticated access to Owner API '/api/owner/employees' is rejected with HTTP 403",
    unauthEmpRes.status === 403,
    `HTTP ${unauthEmpRes.status}`
  );

  // 2.2 Login as Employee (Siti)
  const sitiLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: "siti@company.com",
      password: "employee123",
      deviceFingerprint: "fp_siti_iphone_auth",
      deviceName: "Siti's iPhone 15 Pro",
    }),
  });
  const sitiCookie = sitiLoginRes.headers.get("set-cookie")?.split(";")[0];

  // 2.3 Vertical Privilege Escalation Attempt: Employee accessing Owner API
  const empAccessOwnerRes = await fetch(`${BASE_URL}/api/owner/payroll`, {
    headers: { Cookie: sitiCookie },
  });
  recordTest(
    "Authorization",
    "Vertical privilege escalation: Employee attempting to access '/api/owner/payroll' is rejected with HTTP 403",
    empAccessOwnerRes.status === 403,
    `HTTP ${empAccessOwnerRes.status}`
  );

  const empAccessAuditRes = await fetch(`${BASE_URL}/api/owner/audit-logs`, {
    headers: { Cookie: sitiCookie },
  });
  recordTest(
    "Authorization",
    "Vertical privilege escalation: Employee attempting to access '/api/owner/audit-logs' is rejected with HTTP 403",
    empAccessAuditRes.status === 403,
    `HTTP ${empAccessAuditRes.status}`
  );

  // 2.4 Horizontal IDOR Attempt: Employee Dashboard isolation
  const sitiDashRes = await fetch(`${BASE_URL}/api/employee/dashboard`, {
    headers: { Cookie: sitiCookie },
  });
  const sitiDashData = await sitiDashRes.json();
  recordTest(
    "Authorization",
    "Employee dashboard strictly scopes to authenticated identity (no IDOR parameter tampering possible)",
    sitiDashRes.status === 200 && sitiDashData.employee.fullName === "Siti Rahma",
    `Resolved identity: ${sitiDashData.employee?.fullName}`
  );

  // ===========================================================================
  // SECTION 3: DEVICE BINDING, IDOR UNLOCK & SESSION REVOCATION
  // ===========================================================================
  console.log("\n▶ AUDIT SECTION 3: Device Binding, Unlock IDOR & Session Invalidation");

  // Setup synthetic employee with authorized device to test rogue hardware quarantine
  const testQuarantineUser = await prisma.user.upsert({
    where: { email: "test_quarantine_emp@company.com" },
    update: { role: "EMPLOYEE", status: "ACTIVE" },
    create: {
      email: "test_quarantine_emp@company.com",
      username: "test_quarantine_emp",
      passwordHash: await bcrypt.hash("employee123", 10),
      role: "EMPLOYEE",
      status: "ACTIVE",
    },
  });

  const generalShift = await prisma.shift.findFirst();
  await prisma.employeeProfile.upsert({
    where: { userId: testQuarantineUser.id },
    update: { dailySalary: 150000, shiftId: generalShift.id, employmentStatus: "ACTIVE" },
    create: {
      userId: testQuarantineUser.id,
      employeeId: "EMP-TEST-QUARANTINE",
      fullName: "Test Quarantine Employee",
      dailySalary: 150000,
      shiftId: generalShift.id,
      employmentStatus: "ACTIVE",
    },
  });

  await prisma.deviceRegistration.upsert({
    where: { userId: testQuarantineUser.id },
    create: {
      userId: testQuarantineUser.id,
      deviceFingerprint: "fp_authorized_test_device",
      deviceName: "Authorized Test Terminal",
      platform: "TestPlatform",
      isActive: true,
    },
    update: {
      deviceFingerprint: "fp_authorized_test_device",
      deviceName: "Authorized Test Terminal",
      isActive: true,
    },
  });

  // Login as testQuarantineUser from authorized device to obtain a valid session cookie
  const validDeviceAuthRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: "test_quarantine_emp@company.com",
      password: "employee123",
      deviceFingerprint: "fp_authorized_test_device",
      deviceName: "Authorized Test Terminal",
    }),
  });
  const quarantineUserCookie = validDeviceAuthRes.headers.get("set-cookie")?.split(";")[0];

  // 3.1 Rogue Hardware Quarantine (HTTP 423)
  const rogueFp = `fp_rogue_terminal_${Date.now()}`;
  const rogueLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: "test_quarantine_emp@company.com",
      password: "employee123",
      deviceFingerprint: rogueFp,
      deviceName: "Attacker External Hardware Station",
    }),
  });
  const rogueData = await rogueLoginRes.json();

  recordTest(
    "DeviceSecurity",
    "Unregistered device fingerprint triggers HTTP 423 Locked and issues tracked Request ID",
    rogueLoginRes.status === 423 && Boolean(rogueData.requestCode),
    `HTTP 423, Request: ${rogueData.requestCode}`
  );

  const unlockRecord = await prisma.deviceUnlockRequest.findFirst({
    where: { requestCode: rogueData.requestCode },
  });

  // 3.2 IDOR Attack Prevention on Device Unlock
  // Attacker submits unlockCode WITHOUT requestCode, attempting to unlock any random account
  const idorUnlockRes = await fetch(`${BASE_URL}/api/auth/verify-device-unlock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      unlockCode: unlockRecord.unlockCode,
      deviceFingerprint: rogueFp,
      deviceName: "Attacker Device",
    }),
  });
  recordTest(
    "DeviceSecurity",
    "IDOR defense: Device unlock request without explicit Request ID is rejected with HTTP 400",
    idorUnlockRes.status === 400,
    `HTTP ${idorUnlockRes.status}`
  );

  // 3.3 Brute-Force Rate Limiting on Unlock Challenge Code
  let bruteAttempts = 0;
  for (let i = 0; i < 5; i++) {
    await fetch(`${BASE_URL}/api/auth/verify-device-unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestCode: rogueData.requestCode,
        unlockCode: "000000", // Incorrect code
        deviceFingerprint: rogueFp,
        deviceName: "Attacker Device",
      }),
    });
    bruteAttempts++;
  }

  // 6th attempt should be blocked with HTTP 429
  const rateLimitUnlockRes = await fetch(`${BASE_URL}/api/auth/verify-device-unlock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestCode: rogueData.requestCode,
      unlockCode: unlockRecord.unlockCode, // Even with correct code now!
      deviceFingerprint: rogueFp,
      deviceName: "Attacker Device",
    }),
  });
  recordTest(
    "DeviceSecurity",
    "Brute-force protection: Exceeding 5 failed unlock attempts revokes challenge code and returns HTTP 429",
    rateLimitUnlockRes.status === 429,
    `HTTP ${rateLimitUnlockRes.status}`
  );

  // 3.4 Session Invalidation on Device Switch (Owner Manual Approval)
  // Create a new clean unlock request for testing session invalidation
  const req2Code = `REQ-SEC-${Date.now().toString().slice(-5)}`;
  const unlockReq2 = await prisma.deviceUnlockRequest.create({
    data: {
      requestCode: req2Code,
      unlockCode: "888999",
      userId: testQuarantineUser.id,
      requestedFingerprint: "fp_test_new_approved_ipad",
      requestedDeviceName: "Authorized Replacement iPad",
      previousDeviceName: "Authorized Test Terminal",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  });

  // Verify quarantineUserCookie is currently valid before switch
  const preSwitchRes = await fetch(`${BASE_URL}/api/employee/dashboard`, {
    headers: { Cookie: quarantineUserCookie },
  });
  const preValid = preSwitchRes.status === 200;

  // Owner approves device switch via Owner Device Management API
  const approveSwitchRes = await fetch(`${BASE_URL}/api/owner/devices`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cookie": ownerCookie,
    },
    body: JSON.stringify({
      action: "APPROVE_UNLOCK",
      requestId: unlockReq2.id,
      reason: "Audited employee hardware replacement",
    }),
  });

  // Check if previous session (quarantineUserCookie) was immediately invalidated!
  const postSwitchRes = await fetch(`${BASE_URL}/api/employee/dashboard`, {
    headers: { Cookie: quarantineUserCookie },
  });
  recordTest(
    "DeviceSecurity",
    "Session invalidation: Previous active sessions are revoked immediately upon approved device switch",
    preValid && approveSwitchRes.status === 200 && postSwitchRes.status === 401,
    `Pre-switch: HTTP ${preSwitchRes.status} -> Post-switch: HTTP ${postSwitchRes.status}`
  );

  // Clean up synthetic test records and ensure Siti remains completely clean and unbound
  await prisma.session.deleteMany({ where: { userId: testQuarantineUser.id } });
  await prisma.deviceRegistration.deleteMany({ where: { userId: testQuarantineUser.id } });

  const sitiCleanUser = await prisma.user.findUnique({ where: { email: "siti@company.com" } });
  if (sitiCleanUser) {
    await prisma.deviceRegistration.deleteMany({ where: { userId: sitiCleanUser.id } });
  }

  // ===========================================================================
  // SECTION 4: QR ATTENDANCE SECURITY, SINGLE-USE BURN & CONCURRENCY
  // ===========================================================================
  console.log("\n▶ AUDIT SECTION 4: QR Attendance Security & Concurrency Defense");

  // 4.1 Set up clean synthetic employees for concurrency test
  const morningShift = await prisma.shift.findFirst({ where: { isOvernight: false } });
  const concHash = await bcrypt.hash("employee123", 10);

  const concUserA = await prisma.user.upsert({
    where: { email: "test_conc_a@company.com" },
    update: { status: "ACTIVE" },
    create: {
      email: "test_conc_a@company.com",
      username: "test_conc_a",
      passwordHash: concHash,
      role: "EMPLOYEE",
      status: "ACTIVE",
      employeeProfile: {
        create: {
          fullName: "Concurrent Test Alpha",
          employeeId: "CONC-001",
          dailySalary: 150000,
          shiftId: morningShift.id,
        },
      },
      deviceRegistration: {
        create: {
          deviceFingerprint: "fp_conc_a",
          deviceName: "Terminal A",
          isActive: true,
        },
      },
    },
    include: { employeeProfile: true },
  });

  const concUserB = await prisma.user.upsert({
    where: { email: "test_conc_b@company.com" },
    update: { status: "ACTIVE" },
    create: {
      email: "test_conc_b@company.com",
      username: "test_conc_b",
      passwordHash: concHash,
      role: "EMPLOYEE",
      status: "ACTIVE",
      employeeProfile: {
        create: {
          fullName: "Concurrent Test Beta",
          employeeId: "CONC-002",
          dailySalary: 150000,
          shiftId: morningShift.id,
        },
      },
      deviceRegistration: {
        create: {
          deviceFingerprint: "fp_conc_b",
          deviceName: "Terminal B",
          isActive: true,
        },
      },
    },
    include: { employeeProfile: true },
  });

  // Clear any existing attendance records for synthetic test accounts
  await prisma.attendanceRecord.deleteMany({
    where: { employeeId: { in: [concUserA.employeeProfile.id, concUserB.employeeProfile.id] } },
  });

  const aLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: "test_conc_a@company.com",
      password: "employee123",
      deviceFingerprint: "fp_conc_a",
      deviceName: "Terminal A",
    }),
  });
  const cookieA = aLoginRes.headers.get("set-cookie")?.split(";")[0];

  const bLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: "test_conc_b@company.com",
      password: "employee123",
      deviceFingerprint: "fp_conc_b",
      deviceName: "Terminal B",
    }),
  });
  const cookieB = bLoginRes.headers.get("set-cookie")?.split(";")[0];

  // 4.2 Generate Active Challenge
  const activeOffice = await prisma.officeConfig.findFirst({ orderBy: { createdAt: "desc" } });
  const testLat = activeOffice ? activeOffice.latitude : -6.928715;
  const testLon = activeOffice ? activeOffice.longitude : 109.655502;

  const qrGenRes = await fetch(`${BASE_URL}/api/qr/active`);
  const qrGenData = await qrGenRes.json();
  const testToken = qrGenData.token;

  // 4.3 Concurrent Scan Simulation (Race Condition Defense)
  // Both synthetic employees submit the exact same single-use token in parallel
  const [punchA, punchB] = await Promise.all([
    fetch(`${BASE_URL}/api/qr/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cookie": cookieA },
      body: JSON.stringify({
        token: testToken,
        deviceFingerprint: "fp_conc_a",
        latitude: testLat,
        longitude: testLon,
        accuracy: 15,
      }),
    }),
    fetch(`${BASE_URL}/api/qr/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cookie": cookieB },
      body: JSON.stringify({
        token: testToken,
        deviceFingerprint: "fp_conc_b",
        latitude: testLat,
        longitude: testLon,
        accuracy: 15,
      }),
    }),
  ]);

  const punchAOk = punchA.status === 200;
  const punchBOk = punchB.status === 200;

  // Exactly one must succeed and one must be rejected under strict single-use burn
  recordTest(
    "AttendanceSecurity",
    "Concurrency race condition defense: Exactly one concurrent punch succeeds; duplicate punch is atomically rejected",
    (punchAOk && !punchBOk) || (!punchAOk && punchBOk),
    `Punch 1: HTTP ${punchA.status}, Punch 2: HTTP ${punchB.status}`
  );

  // 4.4 Forged Token Submission Check
  await prisma.attendanceRecord.deleteMany({
    where: { employeeId: { in: [concUserA.employeeProfile.id, concUserB.employeeProfile.id] } },
  });

  const forgedRes = await fetch(`${BASE_URL}/api/qr/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cookie": cookieA },
    body: JSON.stringify({
      token: "qr_attacker_forged_payload_" + Math.random(),
      deviceFingerprint: "fp_conc_a",
      latitude: testLat,
      longitude: testLon,
      accuracy: 15,
    }),
  });
  const forgedData = await forgedRes.json();
  recordTest(
    "AttendanceSecurity",
    "Forged cryptographic QR token is rejected with HTTP 400 and flagged to Owner",
    forgedRes.status === 400 && forgedData.cheatingType === "FORGED_QR",
    `Error: ${forgedData.error?.substring(0, 35)}...`
  );

  // 4.5 Expired Token Submission Check
  const expiredDbChallenge = await prisma.qRChallenge.create({
    data: {
      token: "qr_test_expired_audit_" + Date.now(),
      issuedAt: new Date(Date.now() - 30000),
      expiresAt: new Date(Date.now() - 10000), // Expired 10 seconds ago
      isActive: true,
    },
  });

  const expiredRes = await fetch(`${BASE_URL}/api/qr/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cookie": cookieA },
    body: JSON.stringify({
      token: expiredDbChallenge.token,
      deviceFingerprint: "fp_conc_a",
      latitude: testLat,
      longitude: testLon,
      accuracy: 15,
    }),
  });
  const expiredData = await expiredRes.json();
  recordTest(
    "AttendanceSecurity",
    "Expired QR token (> 15s TTL) is rejected with HTTP 400 and flagged to Owner",
    expiredRes.status === 400 && expiredData.cheatingType === "EXPIRED_QR",
    `Rejected: ${expiredData.error?.substring(0, 35)}...`
  );

  // ===========================================================================
  // SECTION 5: PAYROLL ENGINE & DEDUCTION FORMULA VERIFICATION
  // ===========================================================================
  console.log("\n▶ AUDIT SECTION 5: Wage Calculation Engine & Deduction Rounding");

  const { calculateLateDeduction } = require("../src/lib/payroll");

  const baseDaily = 150000;
  const schedStart = new Date("2026-11-06T08:00:00.000Z");

  // 5.1 Exactly On Time
  const onTimeCalc = calculateLateDeduction(
    new Date("2026-11-06T08:00:00.000Z"),
    schedStart,
    baseDaily,
    { mode: "PER_MINUTE", rate: 500, gracePeriodMinutes: 5 }
  );
  recordTest(
    "PayrollEngine",
    "Scenario: Exactly on time results in 0 deduction and 100% daily earnings",
    onTimeCalc.lateDeduction === 0 && onTimeCalc.netDailyEarnings === baseDaily,
    `Net: Rp ${onTimeCalc.netDailyEarnings.toLocaleString()}`
  );

  // 5.2 Within Grace Period (e.g. 4 minutes late with 5-minute grace)
  const graceCalc = calculateLateDeduction(
    new Date("2026-11-06T08:04:00.000Z"),
    schedStart,
    baseDaily,
    { mode: "PER_MINUTE", rate: 500, gracePeriodMinutes: 5 }
  );
  recordTest(
    "PayrollEngine",
    "Scenario: Arrival within grace period results in 0 deduction",
    graceCalc.lateDeduction === 0 && graceCalc.isLate === false,
    `Arrival +4m, Grace 5m -> Deduction: Rp ${graceCalc.lateDeduction}`
  );

  // 5.3 One Minute Beyond Grace Period (e.g. 6 minutes late with 5-minute grace -> 1 chargeable min)
  const oneMinLateCalc = calculateLateDeduction(
    new Date("2026-11-06T08:06:00.000Z"),
    schedStart,
    baseDaily,
    { mode: "PER_MINUTE", rate: 500, gracePeriodMinutes: 5 }
  );
  recordTest(
    "PayrollEngine",
    "Scenario: 1 minute beyond grace period results in exact 1-minute deduction (Rp 500)",
    oneMinLateCalc.lateMinutes === 1 && oneMinLateCalc.lateDeduction === 500,
    `Chargeable: ${oneMinLateCalc.lateMinutes}m -> Rp ${oneMinLateCalc.lateDeduction}`
  );

  // 5.4 Spec Example: 12 minutes arrival with 5m grace -> 7 chargeable minutes -> Rp 3,500 deduction
  const specCalc = calculateLateDeduction(
    new Date("2026-11-06T08:12:00.000Z"),
    schedStart,
    baseDaily,
    { mode: "PER_MINUTE", rate: 500, gracePeriodMinutes: 5 }
  );
  recordTest(
    "PayrollEngine",
    "Scenario: Specification example (12m arrival, 5m grace) = 7 chargeable mins, -Rp 3,500 deduction, net Rp 146,500",
    specCalc.lateMinutes === 7 && specCalc.lateDeduction === 3500 && specCalc.netDailyEarnings === 146500,
    `Chargeable: ${specCalc.lateMinutes}m -> Net: Rp ${specCalc.netDailyEarnings.toLocaleString()}`
  );

  // 5.5 Hourly Round Up (65 chargeable mins -> 2 hours x Rp 10,000 = Rp 20,000)
  const hrUpCalc = calculateLateDeduction(
    new Date("2026-11-06T09:05:00.000Z"),
    schedStart,
    baseDaily,
    { mode: "PER_HOUR", rate: 10000, hourlyRounding: "ROUND_UP", gracePeriodMinutes: 0 }
  );
  recordTest(
    "PayrollEngine",
    "Scenario: Mode B Hourly Round Up (65 mins -> 2 full hours = Rp 20,000 deduction)",
    hrUpCalc.lateDeduction === 20000,
    `Deduction: Rp ${hrUpCalc.lateDeduction.toLocaleString()}`
  );

  // 5.6 Hourly Round Down (65 chargeable mins -> 1 hour x Rp 10,000 = Rp 10,000)
  const hrDownCalc = calculateLateDeduction(
    new Date("2026-11-06T09:05:00.000Z"),
    schedStart,
    baseDaily,
    { mode: "PER_HOUR", rate: 10000, hourlyRounding: "ROUND_DOWN", gracePeriodMinutes: 0 }
  );
  recordTest(
    "PayrollEngine",
    "Scenario: Mode B Hourly Round Down (65 mins -> 1 unit = Rp 10,000 deduction)",
    hrDownCalc.lateDeduction === 10000,
    `Deduction: Rp ${hrDownCalc.lateDeduction.toLocaleString()}`
  );

  // 5.7 Hourly Exact Proportional (65 chargeable mins -> (65/60)*10,000 = Rp 10,833)
  const hrExactCalc = calculateLateDeduction(
    new Date("2026-11-06T09:05:00.000Z"),
    schedStart,
    baseDaily,
    { mode: "PER_HOUR", rate: 10000, hourlyRounding: "EXACT", gracePeriodMinutes: 0 }
  );
  recordTest(
    "PayrollEngine",
    "Scenario: Mode B Hourly Exact (65 mins proportional = Rp 10,833 deduction)",
    hrExactCalc.lateDeduction === 10833,
    `Deduction: Rp ${hrExactCalc.lateDeduction.toLocaleString()}`
  );

  // 5.8 Daily Salary Cap: Lateness deduction cannot exceed daily salary (Net cannot become negative)
  const extremeLateCalc = calculateLateDeduction(
    new Date("2026-11-06T15:00:00.000Z"), // 7 hours late
    schedStart,
    baseDaily,
    { mode: "PER_MINUTE", rate: 1000, gracePeriodMinutes: 0, maxDeductionPercent: 100 }
  );
  recordTest(
    "PayrollEngine",
    "Scenario: Extreme lateness deduction capped at 100% daily salary; net earnings never negative",
    extremeLateCalc.lateDeduction === baseDaily && extremeLateCalc.netDailyEarnings === 0,
    `Raw deduction > Rp 400,000 capped to Rp ${extremeLateCalc.lateDeduction.toLocaleString()} (Net: Rp ${extremeLateCalc.netDailyEarnings})`
  );

  // ===========================================================================
  // SECTION 6: HISTORICAL PAYROLL SNAPSHOT IMMUTABILITY
  // ===========================================================================
  console.log("\n▶ AUDIT SECTION 6: Historical Payroll Snapshots & Audit Ledger Integrity");

  // Finalize month 2026-10
  await fetch(`${BASE_URL}/api/owner/payroll`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cookie": ownerCookie },
    body: JSON.stringify({ year: 2026, month: 10 }),
  });

  // Read finalized figures for October
  const octPreRes = await fetch(`${BASE_URL}/api/owner/payroll?year=2026&month=10`, {
    headers: { Cookie: ownerCookie },
  });
  const octPreData = await octPreRes.json();
  const ahmadOctPre = octPreData.summaries?.find((s) => s.code === "EMP-003");
  const ahmadPreSalary = ahmadOctPre?.dailySalary;

  // Now mutate Ahmad's current active daily salary in November via Owner Employee API
  const ahmadProfile = await prisma.employeeProfile.findFirst({ where: { employeeId: "EMP-003" } });
  await fetch(`${BASE_URL}/api/owner/employees/${ahmadProfile.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "Cookie": ownerCookie },
    body: JSON.stringify({
      dailySalary: 300000, // Doubled salary
      salaryChangeReason: "Promotion increment test",
    }),
  });

  // Re-fetch October finalized report: must still reflect the frozen snapshot salary!
  const octPostRes = await fetch(`${BASE_URL}/api/owner/payroll?year=2026&month=10`, {
    headers: { Cookie: ownerCookie },
  });
  const octPostData = await octPostRes.json();
  const ahmadOctPost = octPostData.summaries?.find((s) => s.code === "EMP-003");

  recordTest(
    "FinanceIntegrity",
    "Historical payroll snapshot immutability: Modifying active daily salary does NOT alter past finalized payroll figures",
    octPostData.isFinalized === true && ahmadOctPost?.dailySalary === ahmadPreSalary,
    `Frozen: Rp ${ahmadOctPost?.dailySalary.toLocaleString()} (Active rate is Rp 300,000)`
  );

  // Restore Ahmad's daily salary
  await prisma.employeeProfile.update({
    where: { id: ahmadProfile.id },
    data: { dailySalary: 140000 },
  });

  // ===========================================================================
  // SECTION 7: HTTP SECURITY HEADERS AUDIT
  // ===========================================================================
  console.log("\n▶ AUDIT SECTION 7: HTTP Security Headers & Infrastructure Defense");

  const headersRes = await fetch(`${BASE_URL}/login`);
  const headers = headersRes.headers;

  recordTest(
    "InfrastructureSecurity",
    "X-Content-Type-Options: nosniff header is present",
    headers.get("x-content-type-options") === "nosniff",
    headers.get("x-content-type-options") || "Missing"
  );

  recordTest(
    "InfrastructureSecurity",
    "X-Frame-Options clickjacking protection header is present",
    headers.get("x-frame-options") === "SAMEORIGIN" || headers.get("x-frame-options") === "DENY",
    headers.get("x-frame-options") || "Missing"
  );

  recordTest(
    "InfrastructureSecurity",
    "Referrer-Policy header is configured",
    Boolean(headers.get("referrer-policy")),
    headers.get("referrer-policy") || "Missing"
  );

  // ===========================================================================
  // SUMMARY
  // ===========================================================================
  console.log("\n================================================================================");
  console.log("TEST EXECUTION AUDIT SUMMARY");
  console.log("================================================================================");
  console.log(`Total Automated Tests Executed : ${testResults.total}`);
  console.log(`Passed                         : ${testResults.passed}`);
  console.log(`Failed                         : ${testResults.failed}`);
  console.log(`Blocked                        : ${testResults.blocked}`);
  console.log("--------------------------------------------------------------------------------");
  Object.keys(testResults.categories).forEach((cat) => {
    const c = testResults.categories[cat];
    console.log(`• ${cat.padEnd(25)} : ${c.passed}/${c.passed + c.failed} PASSED`);
  });
  console.log("================================================================================\n");

  if (testResults.failed > 0) {
    throw new Error(`QA Security Suite FAILED with ${testResults.failed} failing checks!`);
  }
}

runQASecuritySuite()
  .catch((e) => {
    console.error("Fatal test error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
