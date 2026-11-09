import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser, createSession, SESSION_COOKIE_NAME, SESSION_TTL_DAYS } from "@/lib/auth";
import { verifyPasskeyRegistration } from "@/lib/webauthn";
import { parseDeviceNameFromUserAgent } from "@/lib/device-helper";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const current = await getCurrentUser(req);
    if (!current || !current.user) {
      return NextResponse.json({ error: "Unauthenticated. Please log in first." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { deviceFingerprint, deviceName } = body;

    // Accept either direct attestation object or nested { response: attestation }
    const response = (body.id && body.rawId && body.response) ? body : body.response;

    if (!response) {
      return NextResponse.json({ error: "Missing WebAuthn response object" }, { status: 400 });
    }

    const hostHeader = req.headers.get("host");
    const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
    const userAgent = req.headers.get("user-agent") || "Unknown Device";

    // Resolve dynamic human-readable device name from User-Agent
    const parsedDevice = parseDeviceNameFromUserAgent(userAgent);
    const resolvedDeviceName =
      deviceName && deviceName.trim().length > 0 && deviceName !== "Platform Authenticator"
        ? deviceName.trim()
        : parsedDevice.deviceName;

    // Bind WebAuthn passkey while preserving current active session token
    const boundDevice = await verifyPasskeyRegistration(
      current.user,
      response,
      deviceFingerprint,
      resolvedDeviceName,
      hostHeader,
      ip,
      userAgent,
      current.sessionToken
    );

    // Atomically maintain / renew valid authoritative session for client
    let activeToken = current.sessionToken;
    if (!activeToken) {
      activeToken = await createSession(
        current.user.id,
        deviceFingerprint || boundDevice.credentialId || "webauthn_passkey"
      );
    }

    // Set or refresh authoritative HTTP-only session cookie
    try {
      const cookieStore = cookies();
      const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
      cookieStore.set(SESSION_COOKIE_NAME, activeToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production" && process.env.SECURE_COOKIES !== "false",
        sameSite: "lax",
        path: "/",
        expires: expiresAt,
      });
    } catch {
      // Fallback for non-cookie test harnesses
    }

    return NextResponse.json({
      success: true,
      message: "Passkey registered successfully! This physical hardware device is now bound to your account.",
      redirectUrl: "/employee",
      device: {
        id: boundDevice.id,
        credentialId: boundDevice.credentialId?.substring(0, 16) + "...",
        assuranceTier: boundDevice.assuranceTier,
        deviceName: boundDevice.deviceName,
        platform: boundDevice.platform,
        status: boundDevice.status,
        credentialBackedUp: boundDevice.credentialBackedUp,
      },
    });
  } catch (error: any) {
    console.error("WebAuthn register verify error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to verify passkey registration" },
      { status: 400 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "Method Not Allowed. Use POST to verify WebAuthn registration attestation." },
    { status: 405 }
  );
}
