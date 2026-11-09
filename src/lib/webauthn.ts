/**
 * WebAuthn / FIDO2 Passkey Device Identity & Recovery Engine
 * Implements W3C WebAuthn Level 3 via @simplewebauthn/server.
 * Enforces Pragmatic Single-Device Assurance and Zero-Lockout Recovery.
 */

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
  type AuthenticatorTransport,
} from "@simplewebauthn/server";
import { prisma } from "./db";
import { recordTransactionalAuditLog } from "./audit";
import { parseDeviceNameFromUserAgent } from "./device-helper";

export interface WebAuthnConfig {
  rpName: string;
  rpId: string;
  expectedOrigin: string | string[];
  syncPolicy: "ALLOW_WITH_FLAG" | "BLOCK_SYNCED";
}

/**
 * PRODUCTION CUSTOM DOMAIN CONFIGURATION GUIDE:
 * 
 * When configuring custom domains on Vercel or cloud providers:
 * 1. RP_ID:
 *    Must be a bare domain string (e.g. "attendance.umkm.id" or "company.com").
 *    DO NOT include protocols (https://), port numbers (:443), or trailing slashes.
 *    Valid Examples:   "payroll.company.com", "attendance.umkm.id", "localhost"
 *    Invalid Examples: "https://payroll.company.com", "payroll.company.com:3000/"
 * 
 * 2. EXPECTED_ORIGIN:
 *    Must be the full origin URL (e.g. "https://attendance.umkm.id").
 *    MUST include protocol (https:// in production, http:// in local dev).
 *    DO NOT include trailing slashes or subpaths.
 *    Valid Examples:   "https://attendance.umkm.id", "http://localhost:3000"
 *    Invalid Examples: "https://attendance.umkm.id/", "attendance.umkm.id"
 */

/**
 * Strips protocols, ports, and trailing slashes from an RP ID candidate.
 */
export function normalizeRpId(candidate: string | undefined | null): string {
  if (!candidate) return "localhost";
  let cleaned = candidate.trim().toLowerCase();
  // Strip protocol
  cleaned = cleaned.replace(/^https?:\/\//, "");
  // Strip paths
  cleaned = cleaned.split("/")[0];
  // Strip port
  cleaned = cleaned.split(":")[0];
  return cleaned || "localhost";
}

/**
 * Normalizes an origin candidate ensuring no trailing slashes, default ports, and correct protocol.
 */
export function normalizeOrigin(candidate: string | undefined | null, defaultSecure: boolean = false): string {
  if (!candidate) return "http://localhost:3000";
  let cleaned = candidate.trim();
  // Strip trailing slashes
  cleaned = cleaned.replace(/\/+$/, "");

  // If protocol missing, prepend appropriate protocol
  if (!cleaned.startsWith("http://") && !cleaned.startsWith("https://")) {
    const isLocal = cleaned.startsWith("localhost") || cleaned.startsWith("127.0.0.1");
    const proto = !isLocal && (defaultSecure || process.env.NODE_ENV === "production") ? "https://" : "http://";
    cleaned = `${proto}${cleaned}`;
  }

  // Strip standard default ports (:443 for https, :80 for http)
  if (cleaned.startsWith("https://")) {
    cleaned = cleaned.replace(/:443$/, "");
  } else if (cleaned.startsWith("http://")) {
    cleaned = cleaned.replace(/:80$/, "");
  }

  return cleaned;
}

/**
 * Resolves Relying Party parameters dynamically for Vercel Serverless, Preview Deployments,
 * custom domains, and local development.
 */
export function getWebAuthnConfig(hostHeader?: string | null): WebAuthnConfig {
  const envRpId = process.env.RP_ID;
  const envOrigin = process.env.EXPECTED_ORIGIN;
  const vercelUrl = process.env.VERCEL_URL;

  // 1. Resolve RP ID
  let rpId = "localhost";
  if (envRpId && envRpId.trim()) {
    rpId = normalizeRpId(envRpId);
  } else if (hostHeader && hostHeader.trim()) {
    rpId = normalizeRpId(hostHeader);
  } else if (vercelUrl && vercelUrl.trim()) {
    rpId = normalizeRpId(vercelUrl);
  }

  // 2. Resolve Expected Origin(s)
  const origins: string[] = [];

  if (envOrigin && envOrigin.trim()) {
    origins.push(normalizeOrigin(envOrigin));
  }

  if (hostHeader && hostHeader.trim()) {
    const isLocal = hostHeader.includes("localhost") || hostHeader.includes("127.0.0.1");
    const isHttps = process.env.NODE_ENV === "production" || !isLocal;
    const derivedOrigin = `${isHttps ? "https" : "http"}://${hostHeader.replace(/\/+$/, "")}`;
    origins.push(normalizeOrigin(derivedOrigin));
  }

  if (vercelUrl && vercelUrl.trim()) {
    origins.push(`https://${vercelUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`);
  }

  // Always support localhost during local development & testing
  origins.push("http://localhost:3000");
  origins.push("http://127.0.0.1:3000");

  // Deduplicate origins
  const uniqueOrigins = Array.from(new Set(origins));

  const syncPolicy =
    (process.env.STRICT_SINGLE_DEVICE_SYNC_POLICY as "ALLOW_WITH_FLAG" | "BLOCK_SYNCED") ||
    "ALLOW_WITH_FLAG";

  return {
    rpName: "CyberGuard Workforce Attendance",
    rpId,
    expectedOrigin: uniqueOrigins.length === 1 ? uniqueOrigins[0] : uniqueOrigins,
    syncPolicy,
  };
}

/**
 * Interface adapter for future native hardware attestation (Capacitor / React Native Secure Enclave)
 */
export interface IHardwareAttestationAdapter {
  verifyNativeAttestation?(payload: {
    credentialId: string;
    clientDataJSON: string;
    attestationObject: string;
  }): Promise<{ isHardwareBacked: boolean; enclaveType?: string }>;
}

/**
 * Generates registration options for an employee enrolling their passkey.
 */
export async function createPasskeyRegistrationOptions(
  user: {
    id: string;
    username: string;
    email: string;
    employeeProfile?: { fullName: string; employeeId: string } | null;
  },
  hostHeader?: string | null
) {
  const config = getWebAuthnConfig(hostHeader);

  // Check if user already has an active credential
  const existingDevice = await prisma.deviceRegistration.findUnique({
    where: { userId: user.id },
  });

  const cleanExistingCredId = existingDevice?.credentialId?.trim();
  let excludeTransports: AuthenticatorTransport[] | undefined = undefined;
  if (existingDevice?.transports) {
    try {
      const parsed = JSON.parse(existingDevice.transports);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const set = new Set<string>(parsed);
        set.add("internal");
        excludeTransports = Array.from(set) as AuthenticatorTransport[];
      }
    } catch {
      excludeTransports = ["internal"];
    }
  }

  const excludeCredentials =
    cleanExistingCredId
      ? [
          {
            id: cleanExistingCredId,
            type: "public-key" as const,
            transports: excludeTransports,
          },
        ]
      : [];

  const displayName = user.employeeProfile?.fullName || user.username;

  const options = await generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpId,
    userID: Buffer.from(user.id, "utf-8"),
    userName: user.email,
    userDisplayName: displayName,
    attestationType: "none",
    excludeCredentials,
    authenticatorSelection: {
      authenticatorAttachment: "platform", // Enforce platform biometric authenticator
      userVerification: "required",       // Enforce PIN/Biometric verification
      residentKey: "preferred",
    },
  });

  // Store challenge with 5-minute expiration
  await prisma.webAuthnChallenge.upsert({
    where: { challenge: options.challenge },
    update: {
      userId: user.id,
      purpose: "REGISTRATION",
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
    create: {
      challenge: options.challenge,
      userId: user.id,
      purpose: "REGISTRATION",
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  });

  return options;
}

/**
 * Verifies WebAuthn registration response and establishes authoritative device binding.
 */
export async function verifyPasskeyRegistration(
  user: {
    id: string;
    username: string;
    employeeProfile?: { fullName: string } | null;
    role: string;
  },
  response: any,
  deviceFingerprint?: string,
  deviceName?: string,
  hostHeader?: string | null,
  ipAddress: string = "127.0.0.1",
  userAgent: string = "Unknown Device",
  currentSessionToken?: string | null
) {
  const config = getWebAuthnConfig(hostHeader);
  const now = new Date();

  // 1. Locate and consume challenge
  const challengeRecord = await prisma.webAuthnChallenge.findFirst({
    where: {
      userId: user.id,
      purpose: "REGISTRATION",
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!challengeRecord) {
    throw new Error("WebAuthn registration challenge expired or not found. Please try again.");
  }

  // Delete consumed challenge safely without throwing on concurrent requests
  await prisma.webAuthnChallenge.deleteMany({ where: { id: challengeRecord.id } });

  // 2. Verify response
  const verification: VerifiedRegistrationResponse = await verifyRegistrationResponse({
    response,
    expectedChallenge: challengeRecord.challenge,
    expectedOrigin: config.expectedOrigin,
    expectedRPID: config.rpId,
    requireUserVerification: true,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("WebAuthn registration verification failed.");
  }

  const { credential, credentialBackedUp, credentialDeviceType, aaguid } = verification.registrationInfo;

  // 3. Pragmatic Single-Device Assurance Policy Check
  let assuranceTier: "HIGH_HARDWARE_BOUND" | "STANDARD_PASSKEY_SYNCED" = "HIGH_HARDWARE_BOUND";

  if (credentialBackedUp || credentialDeviceType === "multiDevice") {
    if (config.syncPolicy === "BLOCK_SYNCED") {
      throw new Error(
        "Strict Single-Device Policy: Synced/backed-up passkeys are forbidden by administrator policy. A hardware-bound device is required."
      );
    }
    assuranceTier = "STANDARD_PASSKEY_SYNCED";
  }

  // Store clean, direct Base64URL string output from SimpleWebAuthn without double-encoding
  const rawCredId = (credential as any).id;
  const credIdBase64: string = typeof rawCredId === "string"
    ? rawCredId.trim()
    : Buffer.isBuffer(rawCredId) || (rawCredId && typeof rawCredId === "object" && rawCredId instanceof Uint8Array)
    ? Buffer.from(rawCredId).toString("base64url")
    : String(response.id || rawCredId).trim();

  const credPubBase64 = Buffer.from(credential.publicKey).toString("base64url");

  // Ensure transports includes 'internal' so platform authenticators (macOS Touch ID / Face ID) are prioritized
  let normalizedTransports: string[] | null = null;
  if (response.response?.transports && Array.isArray(response.response.transports) && response.response.transports.length > 0) {
    const set = new Set<string>(response.response.transports);
    // Ensure 'internal' is present so platform authenticators are checked first
    set.add("internal");
    normalizedTransports = Array.from(set);
  } else {
    // Default to platform authenticator transport
    normalizedTransports = ["internal"];
  }
  const transportsJson = JSON.stringify(normalizedTransports);

  // 4. Atomic Transaction: Bind Credential as Single Active Device & Revoke Other Sessions
  return await prisma.$transaction(async (tx) => {
    // Invalidate competing active sessions while preserving current session if provided
    if (currentSessionToken) {
      await tx.session.deleteMany({
        where: {
          userId: user.id,
          sessionToken: { not: currentSessionToken },
        },
      });

      // Update existing active session record with newly registered hardware identity
      await tx.session.updateMany({
        where: { sessionToken: currentSessionToken },
        data: { deviceFingerprint: deviceFingerprint || credIdBase64 },
      });
    } else {
      await tx.session.deleteMany({
        where: { userId: user.id },
      });
    }

    const parsed = parseDeviceNameFromUserAgent(userAgent);
    const resolvedDeviceName =
      deviceName && deviceName.trim().length > 0 && deviceName !== "Platform Authenticator"
        ? deviceName.trim()
        : parsed.deviceName;
    const resolvedPlatform = parsed.platform;

    // Use upsert to safely bind or re-bind device without unique constraint collisions
    const newDevice = await tx.deviceRegistration.upsert({
      where: { userId: user.id },
      update: {
        credentialId: credIdBase64,
        credentialPublicKey: credPubBase64,
        counter: credential.counter,
        transports: transportsJson,
        credentialBackedUp,
        credentialDeviceType,
        assuranceTier,
        aaguid: aaguid || null,
        deviceName: resolvedDeviceName,
        deviceFingerprint: deviceFingerprint || null,
        platform: resolvedPlatform,
        isActive: true,
        status: "ACTIVE",
        lastAuthenticatedAt: now,
        lastSeenAt: now,
      },
      create: {
        userId: user.id,
        credentialId: credIdBase64,
        credentialPublicKey: credPubBase64,
        counter: credential.counter,
        transports: transportsJson,
        credentialBackedUp,
        credentialDeviceType,
        assuranceTier,
        aaguid: aaguid || null,
        deviceName: resolvedDeviceName,
        deviceFingerprint: deviceFingerprint || null,
        platform: resolvedPlatform,
        isActive: true,
        status: "ACTIVE",
        lastAuthenticatedAt: now,
        lastSeenAt: now,
      },
    });

    // Transactional Tamper-Evident Audit Record
    await recordTransactionalAuditLog(tx, {
      actorId: user.id,
      actorRole: user.role,
      actorName: user.employeeProfile?.fullName || user.username,
      action: "WEBAUTHN_PASSKEY_BOUND",
      targetEntity: "DEVICE_SECURITY",
      targetId: credIdBase64.substring(0, 16),
      newValues: {
        credentialId: credIdBase64.substring(0, 16) + "...",
        assuranceTier,
        credentialBackedUp,
        credentialDeviceType,
        deviceName: newDevice.deviceName,
      },
      ipAddress,
      userAgent,
      reason: "Employee enrolled WebAuthn / FIDO2 Passkey as authoritative single-device identity",
    });

    return newDevice;
  });
}

/**
 * Generates authentication options for WebAuthn passkey login / storage-cleared recovery.
 */
export async function createPasskeyAuthenticationOptions(
  user: {
    id: string;
    email: string;
  },
  hostHeader?: string | null
) {
  const config = getWebAuthnConfig(hostHeader);

  // Look up registered device credential
  const device = await prisma.deviceRegistration.findUnique({
    where: { userId: user.id },
  });

  if (!device || !device.credentialId || !device.isActive) {
    throw new Error("No active registered WebAuthn passkey found for this account.");
  }

  const cleanCredId = device.credentialId.trim();

  // Normalize transports: Ensure 'internal' is prioritized so macOS Touch ID / Windows Hello is invoked directly.
  // Never pass ['hybrid'] alone without 'internal', which causes Safari to display a cross-device QR modal.
  let allowedTransports: AuthenticatorTransport[] | undefined = undefined;
  if (device.transports) {
    try {
      const parsed = JSON.parse(device.transports);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const set = new Set<string>(parsed);
        set.add("internal");
        allowedTransports = Array.from(set) as AuthenticatorTransport[];
      }
    } catch {
      allowedTransports = ["internal"];
    }
  } else {
    allowedTransports = ["internal"];
  }

  const allowCredentials = [
    {
      id: cleanCredId,
      type: "public-key" as const,
      transports: allowedTransports,
    },
  ];

  const options = await generateAuthenticationOptions({
    rpID: config.rpId,
    allowCredentials,
    userVerification: "required",
  });

  // Store challenge
  await prisma.webAuthnChallenge.upsert({
    where: { challenge: options.challenge },
    update: {
      userId: user.id,
      purpose: "AUTHENTICATION",
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
    create: {
      challenge: options.challenge,
      userId: user.id,
      purpose: "AUTHENTICATION",
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  });

  return options;
}

/**
 * Verifies WebAuthn authentication assertion (Zero-Lockout Recovery).
 */
export async function verifyPasskeyAuthentication(
  user: {
    id: string;
    username: string;
    employeeProfile?: { fullName: string } | null;
    role: string;
  },
  response: any,
  hostHeader?: string | null,
  ipAddress: string = "127.0.0.1",
  userAgent: string = "Unknown Device"
) {
  const config = getWebAuthnConfig(hostHeader);
  const now = new Date();

  // 1. Locate challenge
  const challengeRecord = await prisma.webAuthnChallenge.findFirst({
    where: {
      userId: user.id,
      purpose: "AUTHENTICATION",
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!challengeRecord) {
    throw new Error("Authentication challenge expired or not found. Please try again.");
  }

  // Delete consumed challenge safely without throwing on concurrent requests
  await prisma.webAuthnChallenge.deleteMany({ where: { id: challengeRecord.id } });

  // 2. Fetch device registration
  const device = await prisma.deviceRegistration.findUnique({
    where: { userId: user.id },
  });

  if (!device || !device.credentialId || !device.credentialPublicKey || !device.isActive) {
    throw new Error("No registered active WebAuthn passkey for this account.");
  }

  // 3. Verify assertion
  const cleanCredId = device.credentialId.trim();
  let verifyTransports: AuthenticatorTransport[] | undefined = undefined;
  if (device.transports) {
    try {
      const parsed = JSON.parse(device.transports);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const set = new Set<string>(parsed);
        set.add("internal");
        verifyTransports = Array.from(set) as AuthenticatorTransport[];
      }
    } catch {
      verifyTransports = ["internal"];
    }
  } else {
    verifyTransports = ["internal"];
  }

  const credentialPublicKey = Buffer.from(device.credentialPublicKey, "base64url");

  const verification: VerifiedAuthenticationResponse = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challengeRecord.challenge,
    expectedOrigin: config.expectedOrigin,
    expectedRPID: config.rpId,
    credential: {
      id: cleanCredId,
      publicKey: credentialPublicKey,
      counter: device.counter,
      transports: verifyTransports,
    },
    requireUserVerification: true,
  });

  if (!verification.verified) {
    throw new Error("WebAuthn biometric authentication failed.");
  }

  const { newCounter } = verification.authenticationInfo;

  // 4. Update device counter and last seen in database
  await prisma.deviceRegistration.update({
    where: { id: device.id },
    data: {
      counter: newCounter,
      lastSeenAt: now,
      lastAuthenticatedAt: now,
    },
  });

  return { verified: true, device };
}
