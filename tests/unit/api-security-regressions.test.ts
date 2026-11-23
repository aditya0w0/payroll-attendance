import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  getOrCreateActiveQRChallengeMock,
  validateAndConsumeQRTokenMock,
  recordAuditLogMock,
  recordTransactionalAuditLogMock,
  triggerBackgroundFlushMock,
  createPasskeyAuthenticationOptionsMock,
  prismaMock,
} = vi.hoisted(() => {
  const txMock = {
    payrollPeriod: { findUnique: vi.fn(), upsert: vi.fn() },
    payrollRecord: { upsert: vi.fn() },
    attendanceRecord: { updateMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    qRScanLog: { create: vi.fn() },
  };
  return {
    getCurrentUserMock: vi.fn(),
    getOrCreateActiveQRChallengeMock: vi.fn(),
    validateAndConsumeQRTokenMock: vi.fn(),
    recordAuditLogMock: vi.fn(),
    recordTransactionalAuditLogMock: vi.fn(),
    triggerBackgroundFlushMock: vi.fn(),
    createPasskeyAuthenticationOptionsMock: vi.fn(),
    prismaMock: {
      officeConfig: { findFirst: vi.fn(), update: vi.fn() },
      payrollPeriod: { findUnique: vi.fn() },
      employeeProfile: { findMany: vi.fn() },
      attendanceRecord: { findUnique: vi.fn(), update: vi.fn() },
      auditLog: { findMany: vi.fn() },
      user: { findFirst: vi.fn() },
      $transaction: vi.fn(async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)),
      __tx: txMock,
    },
  };
});

vi.mock("@/lib/auth", () => ({
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));
vi.mock("@/lib/qr", () => ({
  getOrCreateActiveQRChallenge: getOrCreateActiveQRChallengeMock,
  validateAndConsumeQRToken: validateAndConsumeQRTokenMock,
}));
vi.mock("@/lib/audit", () => ({
  recordAuditLog: recordAuditLogMock,
  recordTransactionalAuditLog: recordTransactionalAuditLogMock,
}));
vi.mock("@/lib/audit-outbox", () => ({
  triggerBackgroundFlush: triggerBackgroundFlushMock,
}));
vi.mock("@/lib/webauthn", () => ({
  createPasskeyAuthenticationOptions: createPasskeyAuthenticationOptionsMock,
}));

import { GET as getQrActive } from "@/app/api/qr/active/route";
import { POST as finalizePayroll } from "@/app/api/owner/payroll/route";
import { PATCH as patchOwnerAttendance } from "@/app/api/owner/attendance/route";
import { GET as getAuditLogs } from "@/app/api/owner/audit-logs/route";
import { GET as getGeoIpLookup } from "@/app/api/geo/ip-lookup/route";
import { GET as getGeoGeocode } from "@/app/api/geo/geocode/route";
import { GET as getGeoReverse } from "@/app/api/geo/reverse/route";
import { GET as getWebAuthnLoginOptions } from "@/app/api/auth/webauthn/login-options/route";
import { handleAttendanceScan } from "@/lib/attendance-scan-handler";

const OWNER_SESSION = {
  sessionToken: "tok_owner",
  user: { id: "owner_1", username: "owner", role: "OWNER" },
};

const EMPLOYEE_SESSION = {
  sessionToken: "tok_emp",
  user: {
    id: "emp_user_1",
    username: "budi",
    role: "EMPLOYEE",
    deviceRegistration: {
      id: "dev_1",
      deviceFingerprint: "fp_budi",
      deviceName: "Pixel 8",
      isActive: true,
    },
    employeeProfile: {
      id: "emp_prof_1",
      fullName: "Budi Santoso",
      employeeId: "EMP-001",
      dailySalary: 150_000,
      shiftId: "shift_1",
      shift: {
        id: "shift_1",
        name: "Shift Pagi",
        startTime: "08:00",
        endTime: "17:00",
        isOvernight: false,
        gracePeriodMinutes: 10,
        deductionPolicy: { mode: "PER_MINUTE", rate: 500, gracePeriodMinutes: 10, maxDeductionPercent: 100 },
      },
    },
  },
};

describe("API security & business-logic regression suite", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
  });

  describe("GET /api/qr/active allowlist authorization", () => {
    it("returns 401 for unauthenticated requests (prevents cookie-omission bypass)", async () => {
      getCurrentUserMock.mockResolvedValue(null);

      const res = await getQrActive(new Request("http://localhost:3000/api/qr/active"));
      expect(res.status).toBe(401);
      expect(getOrCreateActiveQRChallengeMock).not.toHaveBeenCalled();
    });

    it("returns 403 for authenticated EMPLOYEE sessions", async () => {
      getCurrentUserMock.mockResolvedValue(EMPLOYEE_SESSION);

      const res = await getQrActive(new Request("http://localhost:3000/api/qr/active"));
      expect(res.status).toBe(403);
      expect(getOrCreateActiveQRChallengeMock).not.toHaveBeenCalled();
    });

    it("returns 200 with challenge token for authenticated OWNER sessions", async () => {
      getCurrentUserMock.mockResolvedValue(OWNER_SESSION);
      getOrCreateActiveQRChallengeMock.mockResolvedValue({
        token: "qr_valid_token",
        expiresAt: new Date(Date.now() + 15_000),
        secondsRemaining: 15,
        qrDataUrl: "data:image/png;base64,abc",
      });

      const res = await getQrActive(new Request("http://localhost:3000/api/qr/active"));
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.token).toBe("qr_valid_token");
    });
  });

  describe("POST /api/owner/payroll immutability & validation", () => {
    it("rejects invalid month (13) with 400", async () => {
      getCurrentUserMock.mockResolvedValue(OWNER_SESSION);

      const req = new NextRequest("http://localhost:3000/api/owner/payroll", {
        method: "POST",
        body: JSON.stringify({ year: 2026, month: 13 }),
        headers: { "content-type": "application/json" },
      });
      const res = await finalizePayroll(req);
      expect(res.status).toBe(400);
    });

    it("rejects re-finalizing an already FINALIZED payroll period with 409 without touching snapshots", async () => {
      getCurrentUserMock.mockResolvedValue(OWNER_SESSION);
      prismaMock.payrollPeriod.findUnique.mockResolvedValue({ id: "pp_1", status: "FINALIZED" });

      const req = new NextRequest("http://localhost:3000/api/owner/payroll", {
        method: "POST",
        body: JSON.stringify({ year: 2026, month: 11 }),
        headers: { "content-type": "application/json" },
      });
      const res = await finalizePayroll(req);
      expect(res.status).toBe(409);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(prismaMock.__tx.payrollRecord.upsert).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /api/owner/attendance immutability, date validation & early-checkout approval", () => {
    const existingAttendance = {
      id: "att_1",
      shiftDate: "2026-11-23",
      checkInTime: new Date("2026-11-23T01:00:00.000Z"),
      checkOutTime: new Date("2026-11-23T08:00:00.000Z"),
      scheduledStartTime: new Date("2026-11-23T01:00:00.000Z"),
      status: "COMPLETED",
      lateMinutes: 0,
      lateDeduction: 0,
      netDailyEarnings: 150_000,
      dailySalarySnapshot: 150_000,
      earlyCheckOutApproved: false,
      deductionPolicySnapshot: JSON.stringify({ mode: "PER_MINUTE", rate: 500, gracePeriodMinutes: 10 }),
      employee: { fullName: "Budi Santoso" },
      shift: { gracePeriodMinutes: 10 },
    };

    it("blocks manual correction with 409 if month payroll is already FINALIZED", async () => {
      getCurrentUserMock.mockResolvedValue(OWNER_SESSION);
      prismaMock.attendanceRecord.findUnique.mockResolvedValue(existingAttendance);
      prismaMock.payrollPeriod.findUnique.mockResolvedValue({ id: "pp_1", status: "FINALIZED" });

      const req = new NextRequest("http://localhost:3000/api/owner/attendance", {
        method: "PATCH",
        body: JSON.stringify({
          recordId: "att_1",
          status: "COMPLETED",
          correctionReason: "Try editing locked payroll month",
        }),
        headers: { "content-type": "application/json" },
      });

      const res = await patchOwnerAttendance(req);
      expect(res.status).toBe(409);
      expect(prismaMock.attendanceRecord.update).not.toHaveBeenCalled();
    });

    it("rejects malformed checkInTime date string with 400", async () => {
      getCurrentUserMock.mockResolvedValue(OWNER_SESSION);
      prismaMock.attendanceRecord.findUnique.mockResolvedValue(existingAttendance);
      prismaMock.payrollPeriod.findUnique.mockResolvedValue(null);

      const req = new NextRequest("http://localhost:3000/api/owner/attendance", {
        method: "PATCH",
        body: JSON.stringify({
          recordId: "att_1",
          checkInTime: "not-a-real-date",
          correctionReason: "Testing invalid date guard",
        }),
        headers: { "content-type": "application/json" },
      });

      const res = await patchOwnerAttendance(req);
      expect(res.status).toBe(400);
      expect(prismaMock.attendanceRecord.update).not.toHaveBeenCalled();
    });

    it("allows OWNER to explicitly approve earlyCheckOutApproved", async () => {
      getCurrentUserMock.mockResolvedValue(OWNER_SESSION);
      prismaMock.attendanceRecord.findUnique.mockResolvedValue(existingAttendance);
      prismaMock.payrollPeriod.findUnique.mockResolvedValue(null);
      prismaMock.attendanceRecord.update.mockResolvedValue({
        ...existingAttendance,
        earlyCheckOutApproved: true,
      });

      const req = new NextRequest("http://localhost:3000/api/owner/attendance", {
        method: "PATCH",
        body: JSON.stringify({
          recordId: "att_1",
          status: "COMPLETED",
          earlyCheckOutApproved: true,
          correctionReason: "Izin sakit disetujui langsung oleh Owner",
        }),
        headers: { "content-type": "application/json" },
      });

      const res = await patchOwnerAttendance(req);
      expect(res.status).toBe(200);
      expect(prismaMock.attendanceRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ earlyCheckOutApproved: true }),
        })
      );
    });
  });

  describe("handleAttendanceScan anti-cheat, cooldown & concurrency regressions", () => {
    it("does NOT leak office expectedIp in 403 WIFI_IP_MISMATCH response", async () => {
      getCurrentUserMock.mockResolvedValue(EMPLOYEE_SESSION);
      prismaMock.officeConfig.findFirst.mockResolvedValue({
        officeName: "HQ",
        latitude: -6.2088,
        longitude: 106.8456,
        radiusMeters: 50,
        officePublicIp: "203.0.113.42",
        enforceWifiIp: true,
        enforceGeofence: false,
        maxGpsAccuracy: 80,
      });

      const req = new Request("http://localhost:3000/api/qr/scan", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "198.51.100.9",
        },
        body: JSON.stringify({ token: "qr_test", deviceFingerprint: "fp_budi" }),
      });

      const res = await handleAttendanceScan(req);
      const body = await res.json();
      expect(res.status).toBe(403);
      expect(body.code).toBe("WIFI_IP_MISMATCH");
      expect(body).not.toHaveProperty("expectedIp");
      expect(JSON.stringify(body)).not.toContain("203.0.113.42");
    });

    it("blocks x-test-bypass-cooldown header in production with 429", async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      getCurrentUserMock.mockResolvedValue(EMPLOYEE_SESSION);
      prismaMock.officeConfig.findFirst.mockResolvedValue({
        officeName: "HQ",
        latitude: -6.2088,
        longitude: 106.8456,
        radiusMeters: 50,
        officePublicIp: "127.0.0.1",
        enforceWifiIp: false,
        enforceGeofence: false,
        maxGpsAccuracy: 80,
      });
      prismaMock.attendanceRecord.findUnique.mockResolvedValue({
        id: "att_live",
        status: "CHECKED_IN",
        checkInTime: new Date(Date.now() - 5_000), // 5 seconds ago
        scheduledEndTime: new Date(Date.now() + 3_600_000),
      });

      const req = new Request("http://localhost:3000/api/qr/scan", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-bypass-cooldown": "true",
        },
        body: JSON.stringify({ token: "qr_test", deviceFingerprint: "fp_budi" }),
      });

      const res = await handleAttendanceScan(req);
      const body = await res.json();
      expect(res.status).toBe(429);
      expect(body.code).toBe("SCAN_COOLDOWN_ACTIVE");
    });

    it("ignores client-spoofed earlyCheckoutApproved:true and writes false to DB + audit log", async () => {
      getCurrentUserMock.mockResolvedValue(EMPLOYEE_SESSION);
      prismaMock.officeConfig.findFirst.mockResolvedValue({
        officeName: "HQ",
        latitude: -6.2088,
        longitude: 106.8456,
        radiusMeters: 50,
        officePublicIp: "127.0.0.1",
        enforceWifiIp: false,
        enforceGeofence: false,
        maxGpsAccuracy: 80,
      });
      const existingCheckIn = {
        id: "att_early",
        status: "CHECKED_IN",
        checkInTime: new Date(Date.now() - 120_000),
        scheduledStartTime: new Date(Date.now() - 120_000),
        scheduledEndTime: new Date(Date.now() + 3_600_000), // 1h remaining -> early checkout
        lateMinutes: 0,
        lateDeduction: 0,
        dailySalarySnapshot: 150_000,
        netDailyEarnings: 150_000,
        deductionPolicySnapshot: JSON.stringify({ mode: "PER_MINUTE", rate: 500, gracePeriodMinutes: 10 }),
      };
      prismaMock.attendanceRecord.findUnique.mockResolvedValue(existingCheckIn);
      validateAndConsumeQRTokenMock.mockResolvedValue({ valid: true, challengeId: "chal_1" });
      prismaMock.__tx.attendanceRecord.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.__tx.attendanceRecord.findUnique.mockResolvedValue({
        ...existingCheckIn,
        status: "COMPLETED",
        earlyCheckOutApproved: false,
      });

      const req = new Request("http://localhost:3000/api/qr/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: "qr_valid",
          deviceFingerprint: "fp_budi",
          forceEarlyCheckout: true,
          earlyCheckoutReason: "Keperluan keluarga mendesak",
          earlyCheckoutApproved: true, // Attacker tries to self-approve!
        }),
      });

      const res = await handleAttendanceScan(req);
      expect(res.status).toBe(200);
      expect(prismaMock.__tx.attendanceRecord.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "att_early", status: "CHECKED_IN" },
          data: expect.objectContaining({
            isEarlyCheckOut: true,
            earlyCheckOutApproved: false,
          }),
        })
      );
      expect(recordTransactionalAuditLogMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          newValues: expect.objectContaining({ earlyCheckOutApproved: false }),
        })
      );
    });

    it("returns 409 CONCURRENT_ATTENDANCE_CONFLICT if conditional checkout updateMany matches 0 rows", async () => {
      getCurrentUserMock.mockResolvedValue(EMPLOYEE_SESSION);
      prismaMock.officeConfig.findFirst.mockResolvedValue({
        officeName: "HQ",
        latitude: -6.2088,
        longitude: 106.8456,
        radiusMeters: 50,
        officePublicIp: "127.0.0.1",
        enforceWifiIp: false,
        enforceGeofence: false,
        maxGpsAccuracy: 80,
      });
      prismaMock.attendanceRecord.findUnique.mockResolvedValue({
        id: "att_race",
        status: "CHECKED_IN",
        checkInTime: new Date(Date.now() - 120_000),
        scheduledStartTime: new Date(Date.now() - 120_000),
        scheduledEndTime: new Date(Date.now() - 60_000),
        lateMinutes: 0,
        lateDeduction: 0,
        dailySalarySnapshot: 150_000,
        netDailyEarnings: 150_000,
        deductionPolicySnapshot: JSON.stringify({ mode: "PER_MINUTE", rate: 500, gracePeriodMinutes: 10 }),
      });
      validateAndConsumeQRTokenMock.mockResolvedValue({ valid: true, challengeId: "chal_race" });
      prismaMock.__tx.attendanceRecord.updateMany.mockResolvedValue({ count: 0 });

      const req = new Request("http://localhost:3000/api/qr/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "qr_race", deviceFingerprint: "fp_budi" }),
      });

      const res = await handleAttendanceScan(req);
      const body = await res.json();
      expect(res.status).toBe(409);
      expect(body.code).toBe("CONCURRENT_ATTENDANCE_CONFLICT");
    });
  });

  describe("Geo auth, audit-log limit clamping & WebAuthn anti-enumeration", () => {
    it("rejects unauthenticated requests across all /api/geo/* endpoints with 401", async () => {
      getCurrentUserMock.mockResolvedValue(null);

      const [r1, r2, r3] = await Promise.all([
        getGeoIpLookup(new Request("http://localhost:3000/api/geo/ip-lookup?ip=1.1.1.1")),
        getGeoGeocode(new Request("http://localhost:3000/api/geo/geocode?q=jakarta")),
        getGeoReverse(new Request("http://localhost:3000/api/geo/reverse?lat=-6.2&lon=106.8")),
      ]);

      expect(r1.status).toBe(401);
      expect(r2.status).toBe(401);
      expect(r3.status).toBe(401);
    });

    it.each([
      { query: "limit=999999", expectedTake: 500 },
      { query: "limit=-10", expectedTake: 1 },
      { query: "limit=invalid", expectedTake: 100 },
    ])("clamps /api/owner/audit-logs?$query to take=$expectedTake", async ({ query, expectedTake }) => {
      getCurrentUserMock.mockResolvedValue(OWNER_SESSION);
      prismaMock.auditLog.findMany.mockResolvedValue([]);

      const res = await getAuditLogs(new NextRequest(`http://localhost:3000/api/owner/audit-logs?${query}`));
      expect(res.status).toBe(200);
      expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: expectedTake })
      );
    });

    it("returns identical 404 for unknown user vs unbound user and omits deviceName on 200", async () => {
      prismaMock.user.findFirst.mockResolvedValueOnce(null);
      const unknownRes = await getWebAuthnLoginOptions(
        new Request("http://localhost:3000/api/auth/webauthn/login-options?identifier=ghost@company.com")
      );
      const unknownBody = await unknownRes.json();

      prismaMock.user.findFirst.mockResolvedValueOnce({ id: "u2", deviceRegistration: null });
      const unboundRes = await getWebAuthnLoginOptions(
        new Request("http://localhost:3000/api/auth/webauthn/login-options?identifier=budi@company.com")
      );
      const unboundBody = await unboundRes.json();

      expect(unknownRes.status).toBe(404);
      expect(unboundRes.status).toBe(404);
      expect(unknownBody).toEqual(unboundBody);

      prismaMock.user.findFirst.mockResolvedValueOnce({
        id: "u3",
        email: "budi@company.com",
        deviceRegistration: {
          credentialId: "cred_1",
          isActive: true,
          deviceName: "Budi Secret Phone",
          assuranceTier: "HIGH_HARDWARE_BOUND",
        },
      });
      createPasskeyAuthenticationOptionsMock.mockResolvedValue({ challenge: "chal_abc" });

      const okRes = await getWebAuthnLoginOptions(
        new Request("http://localhost:3000/api/auth/webauthn/login-options?identifier=budi@company.com")
      );
      const okBody = await okRes.json();
      expect(okRes.status).toBe(200);
      expect(okBody).not.toHaveProperty("deviceName");
      expect(okBody).not.toHaveProperty("assuranceTier");
    });
  });
});
