import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getWebAuthnConfig, normalizeOrigin, normalizeRpId } from "@/lib/webauthn";

describe("WebAuthn RP ID & Origin Security Policy (src/lib/webauthn.ts)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.RP_ID;
    delete process.env.EXPECTED_ORIGIN;
    delete process.env.VERCEL_URL;
    delete process.env.STRICT_SINGLE_DEVICE_SYNC_POLICY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it.each([
    { input: "https://attendance.umkm.id:443/login", expected: "attendance.umkm.id" },
    { input: "http://localhost:3000", expected: "localhost" },
    { input: "PAYROLL.COMPANY.COM:8443/", expected: "payroll.company.com" },
    { input: undefined, expected: "localhost" },
    { input: "   ", expected: "localhost" },
  ])("normalizeRpId($input) -> $expected", ({ input, expected }) => {
    expect(normalizeRpId(input)).toBe(expected);
  });

  it.each([
    { input: "https://attendance.umkm.id:443///", secure: false, expected: "https://attendance.umkm.id" },
    { input: "http://localhost:80/", secure: false, expected: "http://localhost" },
    { input: "attendance.umkm.id", secure: true, expected: "https://attendance.umkm.id" },
    { input: "localhost:3000", secure: true, expected: "http://localhost:3000" },
  ])("normalizeOrigin($input, $secure) -> $expected", ({ input, secure, expected }) => {
    expect(normalizeOrigin(input, secure)).toBe(expected);
  });

  it("blocks localhost and ignores spoofed Host header in production when EXPECTED_ORIGIN is configured", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.RP_ID = "attendance.umkm.id";
    process.env.EXPECTED_ORIGIN = "https://attendance.umkm.id/";

    const cfg = getWebAuthnConfig("evil-attacker.example.com");
    const origins = Array.isArray(cfg.expectedOrigin) ? cfg.expectedOrigin : [cfg.expectedOrigin];

    expect(cfg.rpId).toBe("attendance.umkm.id");
    expect(origins).toEqual(["https://attendance.umkm.id"]);
    expect(origins).not.toContain("http://localhost:3000");
    expect(origins).not.toContain("http://127.0.0.1:3000");
    expect(origins).not.toContain("https://evil-attacker.example.com");
  });

  it("derives HTTPS origin from hostHeader only when EXPECTED_ORIGIN is unset", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";

    const cfg = getWebAuthnConfig("preview-branch.vercel.app:443");
    const origins = Array.isArray(cfg.expectedOrigin) ? cfg.expectedOrigin : [cfg.expectedOrigin];

    expect(cfg.rpId).toBe("preview-branch.vercel.app");
    expect(origins).toEqual(["https://preview-branch.vercel.app"]);
  });

  it("includes localhost origins only in non-production environments", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";

    const cfg = getWebAuthnConfig("localhost:3000");
    const origins = Array.isArray(cfg.expectedOrigin) ? cfg.expectedOrigin : [cfg.expectedOrigin];

    expect(cfg.rpId).toBe("localhost");
    expect(origins).toContain("http://localhost:3000");
    expect(origins).toContain("http://127.0.0.1:3000");
  });
});
