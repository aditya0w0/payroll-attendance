import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createPasskeyAuthenticationOptions } from "@/lib/webauthn";

export const dynamic = "force-dynamic";

/**
 * Common handler to generate WebAuthn authentication options.
 * Accepts user identifier via query parameter or JSON body.
 */
async function handleLoginOptions(identifier: string | null | undefined, hostHeader: string | null) {
  if (!identifier || typeof identifier !== "string" || !identifier.trim()) {
    return NextResponse.json({ error: "Identifier is required" }, { status: 400 });
  }

  const cleanId = identifier.trim().toLowerCase();

  // Find user by email, username, or employeeId
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: cleanId },
        { username: cleanId },
        { employeeProfile: { employeeId: identifier.trim() } },
      ],
    },
    include: {
      deviceRegistration: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (!user.deviceRegistration?.credentialId || !user.deviceRegistration?.isActive) {
    return NextResponse.json(
      {
        error: "NO_WEBAUTHN_CREDENTIAL",
        message: "No active WebAuthn passkey registered for this account.",
      },
      { status: 404 }
    );
  }

  const options = await createPasskeyAuthenticationOptions(user, hostHeader);

  // Return both direct options spread and nested fields for backwards and standard compatibility
  return NextResponse.json({
    ...options,
    options,
    userId: user.id,
    deviceName: user.deviceRegistration.deviceName,
    assuranceTier: user.deviceRegistration.assuranceTier,
  });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const identifier = url.searchParams.get("identifier");
    const hostHeader = req.headers.get("host");
    return await handleLoginOptions(identifier, hostHeader);
  } catch (error: any) {
    console.error("WebAuthn login options GET error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate authentication challenge" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const url = new URL(req.url);
    const identifier = body?.identifier || url.searchParams.get("identifier");
    const hostHeader = req.headers.get("host");
    return await handleLoginOptions(identifier, hostHeader);
  } catch (error: any) {
    console.error("WebAuthn login options POST error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate authentication challenge" },
      { status: 500 }
    );
  }
}
