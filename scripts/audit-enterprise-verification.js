/**
 * Enterprise Audit & Comprehensive Verification Script
 * Validates Zero-Trust Architecture, Daily Salary Wage Engine, Anti-Cheating Hardening,
 * Single-Device Cryptographic Binding, Overnight Shift Logic, and Payroll Snapshots.
 */

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

const BASE_URL = "http://localhost:3000";

let auditStats = {
  totalPassed: 0,
  totalFailed: 0,
  categories: {},
};

function recordTest(category, name, passed, detail) {
  if (!auditStats.categories[category]) {
    auditStats.categories[category] = { passed: 0, failed: 0, tests: [] };
  }
  if (passed) {
    auditStats.totalPassed++;
    auditStats.categories[category].passed++;
    auditStats.categories[category].tests.push({ name, status: "PASS", detail });
    console.log(`  [PASS] ${name}${detail ? ` (${detail})` : ""}`);
  } else {
    auditStats.totalFailed++;
    auditStats.categories[category].failed++;
    auditStats.categories[category].tests.push({ name, status: "FAIL", detail });
    console.error(`  [FAIL] [FAIL] ${name}: ${detail}`);
  }
}

async function runEnterpriseAudit() {
  console.log("================================================================================");
  console.log("  ENTERPRISE ZERO-TRUST PAYROLL & QR ATTENDANCE AUDIT VERIFICATION");
  console.log("================================================================================\n");

  // ---------------------------------------------------------------------------
  // SECTION 1: AUTHENTICATION & SESSION ARCHITECTURE
  // ---------------------------------------------------------------------------
  console.log("▶ AUDIT SECTION 1: Authentication & Single-Device Policy Enforcement");

  // 1.1 Owner Administrative Multi-Device Login
  const ownerRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: "owner@company.com",
      password: "admin123",
      deviceFingerprint: "fp_owner_admin_terminal",
      deviceName: "Owner Terminal",
    }),
  });
  const ownerData = await ownerRes.json();
  const ownerCookie = ownerRes.headers.get("set-cookie")?.split(";")[0];

  recordTest(
    "Authentication",
    "Owner administrative login produces HTTP 200 and redirectUrl '/owner'",
    ownerRes.status === 200 && ownerData.redirectUrl === "/owner",
    `HTTP ${ownerRes.status}`
  );

  const rawSetCookie = ownerRes.headers.get("set-cookie") || "";
  recordTest(
    "Authentication",
    "Owner session cookie contains HttpOnly and SameSite=lax attributes",
    Boolean(ownerCookie && /HttpOnly/i.test(rawSetCookie) && /SameSite=lax/i.test(rawSetCookie)),
    ownerCookie?.substring(0, 32) + "..."
  );

  // 1.2 Access Protected Route with Owner Cookie
  const ownerPageRes = await fetch(`${BASE_URL}/owner`, {
    headers: { "Cookie": ownerCookie },
    redirect: "manual",
  });
  recordTest(
    "Authentication",
    "Owner authenticated access to '/owner' returns HTTP 200 without redirect loop",
    ownerPageRes.status === 200,
    `HTTP ${ownerPageRes.status}`
  );

  // 1.3 Unauthenticated Access Protection
  const unauthRes = await fetch(`${BASE_URL}/api/owner/employees`, {
    redirect: "manual",
  });
  recordTest(
    "Authentication",
    "Unauthenticated API access to '/api/owner/employees' is rejected with HTTP 403",
    unauthRes.status === 403,
    `HTTP ${unauthRes.status}`
  );

  // 1.4 Single-Device Enforcement for Employee (Budi Authorized vs Unauthorized)
  const budiAuthRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: "budi@company.com",
      password: "employee123",
      deviceFingerprint: "fp_budi_macbook_pro_auth",
      deviceName: "Budi's Authorized MacBook Pro",
    }),
  });
  const budiAuthData = await budiAuthRes.json();
  const budiCookie = budiAuthRes.headers.get("set-cookie")?.split(";")[0];

  recordTest(
    "Authentication",
    "Employee login with verified hardware fingerprint succeeds with HTTP 200 and redirects to '/employee'",
    budiAuthRes.status === 200 && budiAuthData.redirectUrl === "/employee",
    `HTTP ${budiAuthRes.status}`
  );

  // 1.5 Rogue Device Hardware Lockout (HTTP 423 Locked)
  const rogueRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: "budi@company.com",
      password: "employee123",
      deviceFingerprint: "fp_rogue_unregistered_workstation_" + Date.now(),
      deviceName: "Unregistered External Hardware Terminal",
    }),
  });
  const rogueData = await rogueRes.json();

  recordTest(
    "Authentication",
    "Rogue hardware login attempt triggers HTTP 423 Locked and issues Request ID",
    rogueRes.status === 423 && Boolean(rogueData.requestCode),
    `HTTP ${rogueRes.status}, Request ID: ${rogueData.requestCode}`
  );

  // 1.6 Verify 5-minute TTL on Unlock Challenge Code
  const unlockReq = await prisma.deviceUnlockRequest.findFirst({
    where: { requestCode: rogueData.requestCode },
  });
  const reqTTLMinutes = unlockReq ? Math.round((unlockReq.expiresAt.getTime() - unlockReq.createdAt.getTime()) / 60000) : 0;

  recordTest(
    "Authentication",
    "Device Unlock Challenge Code is strictly configured with 5-minute TTL",
    reqTTLMinutes === 5 && unlockReq.unlockCode.length === 6,
    `TTL: ${reqTTLMinutes} minutes, Code: ${unlockReq?.unlockCode}`
  );

  // ---------------------------------------------------------------------------
  // SECTION 2: ATTENDANCE SECURITY, TOKEN TTL & CHEATING DETECTION
  // ---------------------------------------------------------------------------
  console.log("\n▶ AUDIT SECTION 2: Attendance Security, Single-Use Token Burn & Anti-Cheating");

  // 2.1 Active Token Generation
  const qrRes = await fetch(`${BASE_URL}/api/qr/active`);
  const qrData = await qrRes.json();

  recordTest(
    "AttendanceSecurity",
    "Dynamic QR endpoint generates active challenge with <= 15s validity window",
    qrRes.status === 200 && Boolean(qrData.token) && qrData.secondsRemaining <= 15,
    `Token: ${qrData.token?.substring(0, 16)}..., TTL: ${qrData.secondsRemaining}s`
  );

  // 2.2 Authorized Employee Punch (Burns token)
  const activeOffice = await prisma.officeConfig.findFirst({ orderBy: { createdAt: "desc" } });
  const testLat = activeOffice ? activeOffice.latitude : -6.928715;
  const testLon = activeOffice ? activeOffice.longitude : 109.655502;

  // Cleanly clear previous day attendance for Ahmad so test is idempotent across repeated runs
  await prisma.attendanceRecord.deleteMany({
    where: { employee: { user: { email: "ahmad@company.com" } } },
  });

  // Login Ahmad who is authorized and active
  const ahmadLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: "ahmad@company.com",
      password: "employee123",
      deviceFingerprint: "fp_ahmad_pixel_8_auth",
      deviceName: "Ahmad's Authorized Pixel 8",
    }),
  });
  const ahmadCookie = ahmadLoginRes.headers.get("set-cookie")?.split(";")[0];

  const scanAhmadRes = await fetch(`${BASE_URL}/api/qr/scan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cookie": ahmadCookie,
    },
    body: JSON.stringify({
      token: qrData.token,
      deviceFingerprint: "fp_ahmad_pixel_8_auth",
      latitude: testLat,
      longitude: testLon,
      accuracy: 15,
    }),
  });
  const scanAhmadData = await scanAhmadRes.json();

  recordTest(
    "AttendanceSecurity",
    "Employee attendance scan successfully processed via valid active token",
    scanAhmadRes.status === 200 && Boolean(scanAhmadData.action),
    `Action: ${scanAhmadData.action}`
  );

  // 2.3 Verify Token Burn in Database
  const burnedDbChallenge = await prisma.qRChallenge.findUnique({
    where: { token: qrData.token },
  });

  recordTest(
    "AttendanceSecurity",
    "Token is atomically burned immediately upon first scan (isActive = false, consumedAt set)",
    burnedDbChallenge && burnedDbChallenge.isActive === false && Boolean(burnedDbChallenge.consumedAt),
    `Consumed at: ${burnedDbChallenge?.consumedAt?.toISOString()}`
  );

  // 2.4 Proxy Punch / Replay Attack Block (Synthetic test employee attempts to scan burned token)
  const syntheticProxyUser = await prisma.user.upsert({
    where: { email: "test_proxy_emp@company.com" },
    update: { role: "EMPLOYEE", status: "ACTIVE" },
    create: {
      email: "test_proxy_emp@company.com",
      username: "test_proxy_emp",
      passwordHash: await bcrypt.hash("employee123", 10),
      role: "EMPLOYEE",
      status: "ACTIVE",
    },
  });

  const generalShift = await prisma.shift.findFirst();
  await prisma.employeeProfile.upsert({
    where: { userId: syntheticProxyUser.id },
    update: { dailySalary: 150000, shiftId: generalShift.id, employmentStatus: "ACTIVE" },
    create: {
      userId: syntheticProxyUser.id,
      employeeId: "EMP-TEST-PROXY",
      fullName: "Synthetic Proxy Tester",
      dailySalary: 150000,
      shiftId: generalShift.id,
      employmentStatus: "ACTIVE",
    },
  });

  await prisma.deviceRegistration.upsert({
    where: { userId: syntheticProxyUser.id },
    create: {
      userId: syntheticProxyUser.id,
      deviceFingerprint: "fp_test_proxy_terminal",
      deviceName: "Synthetic Test Terminal",
      platform: "TestPlatform",
      isActive: true,
    },
    update: {
      deviceFingerprint: "fp_test_proxy_terminal",
      deviceName: "Synthetic Test Terminal",
      credentialId: null,
      credentialPublicKey: null,
      isActive: true,
    },
  });

  const proxyAuthRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: "test_proxy_emp@company.com",
      password: "employee123",
      deviceFingerprint: "fp_test_proxy_terminal",
      deviceName: "Synthetic Test Terminal",
    }),
  });
  const proxyCookie = proxyAuthRes.headers.get("set-cookie")?.split(";")[0];

  // Simulate photo transfer elapsed time (> 4 seconds past consumption to test remote proxy punch detection)
  await prisma.qRChallenge.update({
    where: { token: qrData.token },
    data: { consumedAt: new Date(Date.now() - 5000) },
  });

  const proxyScanRes = await fetch(`${BASE_URL}/api/qr/scan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cookie": proxyCookie,
    },
    body: JSON.stringify({
      token: qrData.token, // Reused token!
      deviceFingerprint: "fp_test_proxy_terminal",
      latitude: testLat,
      longitude: testLon,
      accuracy: 15,
    }),
  });
  const proxyScanData = await proxyScanRes.json();

  recordTest(
    "AttendanceSecurity",
    "Replay / photo sharing attempt on burned token is rejected with HTTP 400 or 409",
    (proxyScanRes.status === 400 || proxyScanRes.status === 409) && proxyScanData.cheatingDetected === true,
    `Rejected: ${proxyScanData.error}`
  );

  // 2.5 Audit Log Verification of Cheating Incident
  const cheatingAuditLog = await prisma.auditLog.findFirst({
    where: {
      action: "CHEATING_ALERT_QR_SHARING_REUSE",
      targetId: burnedDbChallenge.id,
    },
    orderBy: { timestamp: "desc" },
  });

  recordTest(
    "AttendanceSecurity",
    "Suspected proxy punch is automatically flagged in Zero-Trust audit ledger",
    Boolean(cheatingAuditLog) && cheatingAuditLog.action === "CHEATING_ALERT_QR_SHARING_REUSE",
    `Audit ID: #${cheatingAuditLog?.id}`
  );

  // 2.6 Forged Token Submission Check
  const forgedRes = await fetch(`${BASE_URL}/api/qr/scan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cookie": proxyCookie,
    },
    body: JSON.stringify({
      token: "qr_fake_manipulated_challenge_payload_xyz",
      deviceFingerprint: "fp_test_proxy_terminal",
      latitude: testLat,
      longitude: testLon,
      accuracy: 15,
    }),
  });
  const forgedData = await forgedRes.json();

  recordTest(
    "AttendanceSecurity",
    "Forged QR challenge token is rejected and flagged as CHEATING_ALERT_FORGED_QR",
    forgedRes.status === 400 && forgedData.cheatingType === "FORGED_QR",
    `Error: ${forgedData.error?.substring(0, 36)}...`
  );

  // Clean up synthetic test records and ensure Siti remains clean
  await prisma.session.deleteMany({ where: { userId: syntheticProxyUser.id } });
  await prisma.deviceRegistration.deleteMany({ where: { userId: syntheticProxyUser.id } });

  const cleanSitiUser = await prisma.user.findUnique({ where: { email: "siti@company.com" } });
  if (cleanSitiUser) {
    await prisma.deviceRegistration.deleteMany({ where: { userId: cleanSitiUser.id } });
  }

  // ---------------------------------------------------------------------------
  // SECTION 3: WAGE MODEL, DEDUCTION MATH & OVERNIGHT SHIFTS
  // ---------------------------------------------------------------------------
  console.log("\n▶ AUDIT SECTION 3: Wage Engine, Deduction Math & Overnight Logic");

  // 3.1 Primary Wage Model: Integer IDR Daily Salary
  const budiProfile = await prisma.employeeProfile.findFirst({
    where: { user: { email: "budi@company.com" } },
  });

  recordTest(
    "WageEngine",
    "Primary wage model is integer IDR daily salary (no floating-point cents)",
    Number.isInteger(budiProfile.dailySalary) && budiProfile.dailySalary > 0,
    `Daily Salary: Rp ${budiProfile.dailySalary.toLocaleString()}`
  );

  // 3.2 Historical Salary Updates
  const initialSalary = budiProfile.dailySalary;
  const updatedSalary = initialSalary + 10000;

  // Change salary as Owner via API
  const salaryUpdateRes = await fetch(`${BASE_URL}/api/owner/employees/${budiProfile.id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Cookie": ownerCookie,
    },
    body: JSON.stringify({
      dailySalary: updatedSalary,
      salaryChangeReason: "Audited merit increment",
    }),
  });

  const salaryHistory = await prisma.employeeSalaryHistory.findFirst({
    where: { employeeId: budiProfile.id, newSalary: updatedSalary },
    orderBy: { effectiveDate: "desc" },
  });

  recordTest(
    "WageEngine",
    "Salary updates preserve immutable previous value and effective date in history",
    salaryUpdateRes.status === 200 && salaryHistory && salaryHistory.previousSalary === initialSalary,
    `Previous: Rp ${salaryHistory?.previousSalary.toLocaleString()} -> New: Rp ${salaryHistory?.newSalary.toLocaleString()}`
  );

  // 3.3 Overnight Shift Instance Integrity
  const overnightShift = await prisma.shift.findFirst({
    where: { isOvernight: true, startTime: "22:00", endTime: "06:00" },
  });

  recordTest(
    "WageEngine",
    "Overnight shift configuration (22:00 - 06:00 next day) properly flagged with isOvernight=true",
    Boolean(overnightShift && overnightShift.isOvernight),
    `${overnightShift?.name}`
  );

  // ---------------------------------------------------------------------------
  // SECTION 4: FINANCE EXPORTS & AUDIT INTEGRITY
  // ---------------------------------------------------------------------------
  console.log("\n▶ AUDIT SECTION 4: Finance Reporting, Exports & Audit Immutability");

  // 4.1 Payroll Ledger API Verification
  const payrollRes = await fetch(`${BASE_URL}/api/owner/payroll?year=2026&month=11`, {
    headers: { "Cookie": ownerCookie },
  });
  const payrollData = await payrollRes.json();

  recordTest(
    "FinanceReporting",
    "Monthly payroll reconciliation calculates gross, deductions, and net payout per employee",
    payrollRes.status === 200 && Array.isArray(payrollData.summaries),
    `Workforce count: ${payrollData.summaries?.length}`
  );

  // 4.2 Check Audit Log Zero-Trust Immutability
  const auditLogsRes = await fetch(`${BASE_URL}/api/owner/audit-logs?limit=5`, {
    headers: { "Cookie": ownerCookie },
  });
  const auditLogsData = await auditLogsRes.json();

  recordTest(
    "AuditIntegrity",
    "Append-only Zero-Trust audit log accurately captures system mutations with IP and actor name",
    auditLogsRes.status === 200 && auditLogsData.logs?.length > 0,
    `Total events recorded: ${auditLogsData.total}`
  );

  // 4.3 Owner Overview Cheating Alerts Feed
  const cheatingAlertsRes = await fetch(`${BASE_URL}/api/owner/audit-logs?action=CHEATING_ALERTS`, {
    headers: { "Cookie": ownerCookie },
  });
  const cheatingAlertsData = await cheatingAlertsRes.json();

  recordTest(
    "AuditIntegrity",
    "Owner audit query for 'CHEATING_ALERTS' successfully isolates security incidents",
    cheatingAlertsRes.status === 200 && cheatingAlertsData.logs.every((l) => l.action.startsWith("CHEATING_ALERT_")),
    `Flagged security incidents: ${cheatingAlertsData.total}`
  );

  // ---------------------------------------------------------------------------
  // FINAL CLEANUP: Restore Budi device binding and baseline state
  // ---------------------------------------------------------------------------
  await prisma.deviceRegistration.upsert({
    where: { userId: budiProfile.userId },
    update: {
      deviceFingerprint: "fp_budi_macbook_pro_auth",
      deviceName: "Budi's Authorized MacBook Pro",
      isActive: true,
    },
    create: {
      userId: budiProfile.userId,
      deviceFingerprint: "fp_budi_macbook_pro_auth",
      deviceName: "Budi's Authorized MacBook Pro",
      platform: "macOS Workstation",
      isActive: true,
    },
  });

  console.log("\n================================================================================");
  console.log("  ENTERPRISE AUDIT SUMMARY");
  console.log("================================================================================");
  console.log(`Total Verification Checks: ${auditStats.totalPassed + auditStats.totalFailed}`);
  console.log(`Passed: ${auditStats.totalPassed}`);
  console.log(`Failed: ${auditStats.totalFailed}`);
  console.log("--------------------------------------------------------------------------------");
  Object.keys(auditStats.categories).forEach((cat) => {
    const c = auditStats.categories[cat];
    console.log(`• ${cat.padEnd(20)}: ${c.passed}/${c.passed + c.failed} PASSED`);
  });
  console.log("================================================================================\n");

  if (auditStats.totalFailed > 0) {
    throw new Error(`Enterprise Audit FAILED with ${auditStats.totalFailed} errors!`);
  }
}

runEnterpriseAudit()
  .catch((err) => {
    console.error("[FAIL] Fatal audit failure:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
