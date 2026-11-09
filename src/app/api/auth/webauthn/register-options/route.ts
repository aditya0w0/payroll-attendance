import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createPasskeyRegistrationOptions } from "@/lib/webauthn";

export const dynamic = "force-dynamic";

/**
 * Handles WebAuthn registration options generation for authenticated employees.
 * Supports both GET and POST requests.
 */
async function handleRegisterOptions(req: Request) {
  try {
    const current = await getCurrentUser(req);
    if (!current || !current.user) {
      return NextResponse.json(
        { error: "Unauthenticated. Please log in first." },
        { status: 401 }
      );
    }

    const hostHeader = req.headers.get("host");
    const options = await createPasskeyRegistrationOptions(current.user, hostHeader);

    // Return the WebAuthn registration options cleanly as direct JSON
    return NextResponse.json(options);
  } catch (error: any) {
    console.error("WebAuthn register options error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate passkey registration challenge" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  return handleRegisterOptions(req);
}

export async function POST(req: Request) {
  return handleRegisterOptions(req);
}
