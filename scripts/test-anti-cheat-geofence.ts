/**
 * Anti-Cheat Hardening Verification Suite
 * Dual Geofence (GPS Haversine) & Office WiFi IP Verification
 * 
 * Verifies:
 * 1. Haversine distance engine accuracy
 * 2. Missing GPS coordinates rejection (HTTP 400 GPS_REQUIRED)
 * 3. Low accuracy GPS rejection (HTTP 403 GPS_LOW_ACCURACY)
 * 4. Geofence out-of-bounds rejection (HTTP 403 GEO_OUT_OF_BOUNDS)
 * 5. WiFi IP mismatch rejection when enforced (HTTP 403 WIFI_IP_MISMATCH)
 * 6. Successful in-range attendance check-in with matching WiFi IP (HTTP 200)
 * 7. Audit logging and transactional telemetry persistence
 * 8. Zero-Trust security: No attendance record or token consumption on check failures
 */

import { prisma } from "../src/lib/db";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { POST as postQrScan } from "../src/app/api/qr/scan/route";
import { POST as postScanVerify } from "../src/app/api/employee/attendance/scan-verify/route";
import { GET as getOfficeConfig, POST as postOfficeConfig } from "../src/app/api/owner/office-config/route";
import { GET as getMyIp } from "../src/app/api/owner/my-ip/route";
import { calculateHaversineDistance, isValidCoordinate } from "../src/lib/geo";

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

async function createTestChallenge() {
  const token = `qr_test_${crypto.randomBytes(16).toString("hex")}`;
  return prisma.qRChallenge.create({
    data: {
      token,
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 15000),
      isActive: true,
    },
  });
}

async function runAntiCheatGeofenceTests() {
  console.log("================================================================================");
  console.log("STARTING DUAL GEOFENCE (GPS HAVERSINE) & WIFI IP VERIFICATION SUITE");
  console.log("================================================================================");

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Haversine Mathematical Engine
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 1: Mathematical Haversine Distance Engine ---");

    const distSame = calculateHaversineDistance(-6.2088, 106.8456, -6.2088, 106.8456);
    assert(distSame === 0, "Haversine returns 0m for identical coordinates", `Distance: ${distSame}m`);

    // Monas (-6.1754, 106.8272) to Bundaran HI (-6.1950, 106.8230) ~ 2.23 km
    const distMonasToHI = calculateHaversineDistance(-6.1754, 106.8272, -6.1950, 106.8230);
    assert(
      distMonasToHI >= 2100 && distMonasToHI <= 2400,
      "Haversine calculates accurate geographic distance between landmarks",
      `Distance: ${distMonasToHI}m`
    );

    // Shift coordinates by ~0.00027 degrees (~30 meters)
    const officeLat = -6.2088;
    const officeLon = 106.8456;
    const nearbyLat = officeLat + 0.0002; // ~22 meters
    const distNearby = calculateHaversineDistance(officeLat, officeLon, nearbyLat, officeLon);
    assert(
      distNearby > 15 && distNearby < 35,
      "Haversine accurately measures localized radius under 50m",
      `Distance: ${distNearby}m`
    );

    // Shift coordinates by ~0.0045 degrees (~500 meters)
    const farLat = officeLat + 0.0045; // ~500 meters
    const distFar = calculateHaversineDistance(officeLat, officeLon, farLat, officeLon);
    assert(
      distFar >= 450 && distFar <= 550,
      "Haversine accurately identifies out-of-bounds coordinates ~500m away",
      `Distance: ${distFar}m`
    );

    assert(isValidCoordinate(-6.2088, 106.8456), "Coordinate validator accepts valid Jakarta coordinates");
    assert(!isValidCoordinate(95, 106.8456), "Coordinate validator rejects latitude > 90");
    assert(!isValidCoordinate(-6.2088, 200), "Coordinate validator rejects longitude > 180");

    // -------------------------------------------------------------------------
    // Setup Test Data: Owner, Shift, Employee, Device
    // -------------------------------------------------------------------------
    console.log("\n--- Setting up Test Data in SQLite ---");

    const ownerPassword = "owner_test_password";
    const employeePassword = "emp_test_password";
    const ownerHash = await bcrypt.hash(ownerPassword, 10);
    const empHash = await bcrypt.hash(employeePassword, 10);

    const testOwner = await prisma.user.upsert({
      where: { email: "owner_geo_test@company.com" },
      update: { role: "OWNER", status: "ACTIVE" },
      create: {
        username: "owner_geo_test",
        email: "owner_geo_test@company.com",
        passwordHash: ownerHash,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    const testEmp = await prisma.user.upsert({
      where: { email: "emp_geo_test@company.com" },
      update: { role: "EMPLOYEE", status: "ACTIVE" },
      create: {
        username: "emp_geo_test",
        email: "emp_geo_test@company.com",
        passwordHash: empHash,
        role: "EMPLOYEE",
        status: "ACTIVE",
      },
    });

    // Ensure employee profile with shift
    let shift = await prisma.shift.findFirst();
    if (!shift) {
      const policy = await prisma.deductionPolicy.create({
        data: {
          name: "Standard Policy",
          mode: "PER_MINUTE",
          rate: 500,
          gracePeriodMinutes: 10,
          maxDeductionPercent: 100,
        },
      });
      shift = await prisma.shift.create({
        data: {
          name: "General Shift",
          startTime: "00:00",
          endTime: "23:59",
          isOvernight: false,
          gracePeriodMinutes: 15,
          applicableDays: "0,1,2,3,4,5,6",
          deductionPolicyId: policy.id,
        },
      });
    }

    const empProfile = await prisma.employeeProfile.upsert({
      where: { userId: testEmp.id },
      update: {
        shiftId: shift.id,
        dailySalary: 250000,
        employmentStatus: "ACTIVE",
      },
      create: {
        userId: testEmp.id,
        employeeId: "EMP-GEO-TEST",
        fullName: "Geofence Test Employee",
        dailySalary: 250000,
        shiftId: shift.id,
        employmentStatus: "ACTIVE",
      },
    });

    const empFingerprint = `fp_geo_test_${Date.now()}`;
    await prisma.deviceRegistration.upsert({
      where: { userId: testEmp.id },
      update: {
        deviceFingerprint: empFingerprint,
        deviceName: "Pixel 8 Pro (Anti-Cheat Test)",
        isActive: true,
        status: "ACTIVE",
      },
      create: {
        userId: testEmp.id,
        deviceFingerprint: empFingerprint,
        deviceName: "Pixel 8 Pro (Anti-Cheat Test)",
        isActive: true,
        status: "ACTIVE",
      },
    });

    // Create session tokens
    const ownerSessionToken = `session_owner_geo_${Date.now()}`;
    await prisma.session.create({
      data: {
        sessionToken: ownerSessionToken,
        userId: testOwner.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const empSessionToken = `session_emp_geo_${Date.now()}`;
    await prisma.session.create({
      data: {
        sessionToken: empSessionToken,
        userId: testEmp.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // Clean existing attendance records for clean test run
    await prisma.attendanceRecord.deleteMany({
      where: { employeeId: empProfile.id },
    });

    // -------------------------------------------------------------------------
    // TEST 2: Owner Office Configuration Endpoint & IP Resolver
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 2: Owner Office Configuration & Public IP Endpoints ---");

    // 2.1 My IP Endpoint (Auth Guard & Detection)
    const myIpUnauthReq = new Request("http://localhost:3000/api/owner/my-ip");
    const myIpUnauthRes = await getMyIp(myIpUnauthReq);
    assert(myIpUnauthRes.status === 403, "GET /api/owner/my-ip rejects unauthenticated access with HTTP 403");

    const myIpReq = new Request("http://localhost:3000/api/owner/my-ip", {
      headers: {
        "x-forwarded-for": "103.28.112.5",
        Cookie: `payroll_auth_token=${ownerSessionToken}`,
      },
    });
    const myIpRes = await getMyIp(myIpReq);
    const myIpData = await myIpRes.json();
    assert(myIpRes.status === 200, "GET /api/owner/my-ip returns HTTP 200");
    assert(myIpData.ip === "103.28.112.5", "GET /api/owner/my-ip extracts client WAN IP", `IP: ${myIpData.ip}`);

    // 2.2 Owner updates OfficeConfig
    const updateConfigReq = new Request("http://localhost:3000/api/owner/office-config", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `payroll_auth_token=${ownerSessionToken}`,
      },
      body: JSON.stringify({
        officeName: "Headquarters Jakarta",
        latitude: -6.2088,
        longitude: 106.8456,
        radiusMeters: 50,
        officePublicIp: "103.28.112.5",
        enforceWifiIp: false,
        enforceGeofence: true,
        maxGpsAccuracy: 80,
      }),
    });

    const updateConfigRes = await postOfficeConfig(updateConfigReq);
    const updateConfigData = await updateConfigRes.json();
    assert(updateConfigRes.status === 200, "POST /api/owner/office-config successfully updates configuration");
    assert(updateConfigData.config.radiusMeters === 50, "Office radius is set to 50 meters");

    // Verify audit log for office config update
    const configAuditLog = await prisma.auditLog.findFirst({
      where: { action: "OFFICE_CONFIG_UPDATED" },
      orderBy: { timestamp: "desc" },
    });
    assert(Boolean(configAuditLog), "Audit log recorded for OFFICE_CONFIG_UPDATED");

    // -------------------------------------------------------------------------
    // TEST 3: Anti-Cheat Scenario - Missing GPS Coordinates
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 3: Anti-Cheat - Missing GPS Coordinates (HTTP 400 GPS_REQUIRED) ---");

    const challengeMissingGps = await createTestChallenge();

    const missingGpsReq = new Request("http://localhost:3000/api/qr/scan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `payroll_auth_token=${empSessionToken}`,
      },
      body: JSON.stringify({
        token: challengeMissingGps.token,
        deviceFingerprint: empFingerprint,
        // Omit latitude and longitude
      }),
    });

    const missingGpsRes = await postQrScan(missingGpsReq);
    const missingGpsData = await missingGpsRes.json();
    assert(missingGpsRes.status === 400, "Missing GPS coordinates rejected with HTTP 400", `Status: ${missingGpsRes.status}`);
    assert(missingGpsData.code === "GPS_REQUIRED", "Error code is GPS_REQUIRED", `Code: ${missingGpsData.code}`);

    // Verify challenge token was NOT consumed
    const checkChallengeUnconsumed = await prisma.qRChallenge.findUnique({
      where: { token: challengeMissingGps.token },
    });
    assert(checkChallengeUnconsumed?.isActive === true, "QR challenge token remains unconsumed after GPS failure");

    // -------------------------------------------------------------------------
    // TEST 4: Anti-Cheat Scenario - Low Accuracy GPS Spoof Guard (HTTP 403 GPS_LOW_ACCURACY)
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 4: Anti-Cheat - Low GPS Accuracy / Cell Tower (HTTP 403 GPS_LOW_ACCURACY) ---");

    const challengeLowAcc = await createTestChallenge();

    const lowAccReq = new Request("http://localhost:3000/api/qr/scan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `payroll_auth_token=${empSessionToken}`,
      },
      body: JSON.stringify({
        token: challengeLowAcc.token,
        deviceFingerprint: empFingerprint,
        latitude: -6.2088,
        longitude: 106.8456,
        accuracy: 250, // Threshold is 80m
      }),
    });

    const lowAccRes = await postQrScan(lowAccReq);
    const lowAccData = await lowAccRes.json();
    assert(lowAccRes.status === 403, "Low accuracy GPS rejected with HTTP 403", `Status: ${lowAccRes.status}`);
    assert(lowAccData.code === "GPS_LOW_ACCURACY", "Error code is GPS_LOW_ACCURACY", `Code: ${lowAccData.code}`);

    // -------------------------------------------------------------------------
    // TEST 5: Anti-Cheat Scenario - Out of Bounds Geofence (HTTP 403 GEO_OUT_OF_BOUNDS)
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 5: Anti-Cheat - Geofence Out of Bounds (HTTP 403 GEO_OUT_OF_BOUNDS) ---");

    const challengeFar = await createTestChallenge();

    // 500m away from office (-6.2088, 106.8456)
    const farCoordinates = {
      latitude: -6.2133,
      longitude: 106.8456,
      accuracy: 15,
    };

    const farReq = new Request("http://localhost:3000/api/qr/scan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `payroll_auth_token=${empSessionToken}`,
      },
      body: JSON.stringify({
        token: challengeFar.token,
        deviceFingerprint: empFingerprint,
        ...farCoordinates,
      }),
    });

    const farRes = await postQrScan(farReq);
    const farData = await farRes.json();
    assert(farRes.status === 403, "Out of bounds GPS scan rejected with HTTP 403", `Status: ${farRes.status}`);
    assert(farData.code === "GEO_OUT_OF_BOUNDS", "Error code is GEO_OUT_OF_BOUNDS", `Code: ${farData.code}`);
    assert(farData.distance > 50, "Distance reported exceeds office radius threshold", `Distance: ${farData.distance}m`);

    // Verify no attendance record created
    const recordAfterFar = await prisma.attendanceRecord.findFirst({
      where: { employeeId: empProfile.id },
    });
    assert(!recordAfterFar, "Transactional Rollback: No attendance record created for out-of-bounds scan");

    // -------------------------------------------------------------------------
    // TEST 6: Anti-Cheat Scenario - Office WiFi IP Mismatch (HTTP 403 WIFI_IP_MISMATCH)
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 6: Anti-Cheat - Office WiFi IP Mismatch ---");

    // Enable enforceWifiIp = true and set Jakarta headquarters coordinates
    await prisma.officeConfig.updateMany({
      data: {
        latitude: -6.2088,
        longitude: 106.8456,
        radiusMeters: 50,
        officePublicIp: "103.28.112.5",
        enforceWifiIp: true,
      },
    });

    const challengeWifiMismatch = await createTestChallenge();

    const wifiMismatchReq = new Request("http://localhost:3000/api/qr/scan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "198.51.100.99", // External home / cellular network
        Cookie: `payroll_auth_token=${empSessionToken}`,
      },
      body: JSON.stringify({
        token: challengeWifiMismatch.token,
        deviceFingerprint: empFingerprint,
        latitude: -6.2088,
        longitude: 106.8456,
        accuracy: 15,
      }),
    });

    const wifiMismatchRes = await postQrScan(wifiMismatchReq);
    const wifiMismatchData = await wifiMismatchRes.json();
    assert(wifiMismatchRes.status === 403, "WiFi IP mismatch rejected with HTTP 403", `Status: ${wifiMismatchRes.status}`);
    assert(wifiMismatchData.code === "WIFI_IP_MISMATCH", "Error code is WIFI_IP_MISMATCH", `Code: ${wifiMismatchData.code}`);

    // -------------------------------------------------------------------------
    // TEST 7: Anti-Cheat Scenario - In-Range GPS & Matching WiFi IP (HTTP 200 CHECK_IN)
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 7: Anti-Cheat - Valid In-Range Scan with Matching WiFi IP ---");

    const challengeValid = await createTestChallenge();

    // 20 meters from office center (well within 50m radius)
    const validCoords = {
      latitude: -6.2088 + 0.00018,
      longitude: 106.8456,
      accuracy: 12,
    };

    const currentOffice7 = await prisma.officeConfig.findFirst({ orderBy: { createdAt: "desc" } });
    const matchingIp = currentOffice7?.officePublicIp || "103.28.112.5";

    const validReq = new Request("http://localhost:3000/api/qr/scan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": matchingIp, // Matching office public WiFi IP
        Cookie: `payroll_auth_token=${empSessionToken}`,
      },
      body: JSON.stringify({
        token: challengeValid.token,
        deviceFingerprint: empFingerprint,
        ...validCoords,
      }),
    });

    const validRes = await postQrScan(validReq);
    const validData = await validRes.json();
    assert(validRes.status === 200, "Valid attendance check-in accepted with HTTP 200", `Status: ${validRes.status}`);
    assert(validData.action === "CHECK_IN", "Scan action resolved as CHECK_IN", `Action: ${validData.action}`);

    // Verify Attendance Record Telemetry
    const savedRecord = await prisma.attendanceRecord.findFirst({
      where: { employeeId: empProfile.id },
      orderBy: { createdAt: "desc" },
    });
    assert(Boolean(savedRecord), "AttendanceRecord successfully persisted in database");
    assert(
      savedRecord?.checkInLatitude !== null && savedRecord?.checkInLatitude !== undefined,
      "checkInLatitude accurately stored in attendance record"
    );
    assert(
      savedRecord?.checkInLongitude !== null && savedRecord?.checkInLongitude !== undefined,
      "checkInLongitude accurately stored in attendance record"
    );
    assert(
      typeof savedRecord?.checkInDistanceMeters === "number" && savedRecord.checkInDistanceMeters <= 50,
      "checkInDistanceMeters is within 50m boundary",
      `Distance: ${savedRecord?.checkInDistanceMeters}m`
    );
    assert(
      savedRecord?.checkInClientIp === matchingIp,
      "checkInClientIp is stored as matching office IP",
      `IP: ${savedRecord?.checkInClientIp}`
    );

    // Verify Transactional Audit Log
    const attendanceAudit = await prisma.auditLog.findFirst({
      where: {
        action: "ATTENDANCE_RECORDED",
        actorId: testEmp.id,
      },
      orderBy: { timestamp: "desc" },
    });
    assert(Boolean(attendanceAudit), "Transactional Audit Log ATTENDANCE_RECORDED created");
    const auditMeta = JSON.parse(attendanceAudit?.newValues || "{}");
    assert(auditMeta.geofenceMatched === true, "Audit metadata confirms geofenceMatched = true");
    assert(auditMeta.wifiMatched === true, "Audit metadata confirms wifiMatched = true");

    // -------------------------------------------------------------------------
    // TEST 8: Alias Endpoint /api/employee/attendance/scan-verify Check-Out
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 8: Alias Endpoint /api/employee/attendance/scan-verify ---");

    const currentOffice8 = await prisma.officeConfig.findFirst({ orderBy: { createdAt: "desc" } });
    const matchingIp8 = currentOffice8?.officePublicIp || "103.28.112.5";

    // 8.1 First test double-scan cooldown guard without bypass header
    const challengeCooldown = await createTestChallenge();
    const cooldownReq = new Request("http://localhost:3000/api/employee/attendance/scan-verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": matchingIp8,
        Cookie: `payroll_auth_token=${empSessionToken}`,
      },
      body: JSON.stringify({
        qrToken: challengeCooldown.token,
        deviceFingerprint: empFingerprint,
        latitude: -6.2088,
        longitude: 106.8456,
        accuracy: 10,
      }),
    });
    const cooldownRes = await postScanVerify(cooldownReq);
    const cooldownData = await cooldownRes.json();
    assert(cooldownRes.status === 429, "Immediate check-out rejected by 60s cooldown with HTTP 429", `Status: ${cooldownRes.status}`);
    assert(cooldownData.code === "SCAN_COOLDOWN_ACTIVE", "Error code is SCAN_COOLDOWN_ACTIVE", `Code: ${cooldownData.code}`);

    // Verify token was NOT consumed by the cooldown guard
    const challengeAfterCooldown = await prisma.qRChallenge.findUnique({ where: { token: challengeCooldown.token } });
    assert(challengeAfterCooldown?.isActive === true, "QR token was not consumed during cooldown rejection");

    // 8.2 Perform check-out with x-test-bypass-cooldown: true
    const challengeCheckout = await createTestChallenge();

    const checkoutReq = new Request("http://localhost:3000/api/employee/attendance/scan-verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": matchingIp8,
        "x-test-bypass-cooldown": "true",
        Cookie: `payroll_auth_token=${empSessionToken}`,
      },
      body: JSON.stringify({
        qrToken: challengeCheckout.token,
        deviceFingerprint: empFingerprint,
        latitude: -6.2088,
        longitude: 106.8456,
        accuracy: 10,
      }),
    });

    const checkoutRes = await postScanVerify(checkoutReq);
    const checkoutData = await checkoutRes.json();
    assert(checkoutRes.status === 200, "Alias endpoint /api/employee/attendance/scan-verify processes check-out successfully with cooldown bypass");
    assert(checkoutData.action === "CHECK_OUT", "Action is CHECK_OUT", `Action: ${checkoutData.action}`);

    // Verify check-out telemetry in AttendanceRecord
    const completedRecord = await prisma.attendanceRecord.findFirst({
      where: { employeeId: empProfile.id },
      orderBy: { createdAt: "desc" },
    });
    assert(Boolean(completedRecord?.checkOutTime), "AttendanceRecord has checkOutTime recorded");
    assert(completedRecord?.checkOutLatitude !== null && completedRecord?.checkOutLatitude !== undefined, "checkOutLatitude is accurately saved");
    assert(completedRecord?.checkOutLongitude !== null && completedRecord?.checkOutLongitude !== undefined, "checkOutLongitude is accurately saved");
    assert(typeof completedRecord?.checkOutDistanceMeters === "number", "checkOutDistanceMeters is accurately saved", `Dist: ${completedRecord?.checkOutDistanceMeters}m`);
    assert(completedRecord?.checkOutClientIp === matchingIp8, "checkOutClientIp is accurately saved", `IP: ${completedRecord?.checkOutClientIp}`);
    assert(
      completedRecord?.status === "COMPLETED" || completedRecord?.status === "LATE_COMPLETED",
      "AttendanceRecord status is COMPLETED or LATE_COMPLETED",
      `Status: ${completedRecord?.status}`
    );

    // Clean up test attendance records, sessions, challenges, and reset OfficeConfig
    await prisma.qRChallenge.deleteMany({ where: { token: { startsWith: "qr_test_" } } });
    await prisma.attendanceRecord.deleteMany({ where: { employeeId: empProfile.id } });
    await prisma.session.deleteMany({ where: { userId: { in: [testOwner.id, testEmp.id] } } });
    await prisma.officeConfig.updateMany({ data: { enforceWifiIp: false } });

    console.log("\n================================================================================");
    console.log(`TEST RESULTS: ${passedTests}/${totalTests} PASSED, ${failedTests} FAILED`);
    console.log("================================================================================");

    if (failedTests > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error("Unhandled error during test suite:", err);
    process.exit(1);
  } finally {
    await prisma.officeConfig.updateMany({ data: { enforceWifiIp: false } }).catch(() => {});
    await prisma.$disconnect();
  }
}

runAntiCheatGeofenceTests();
