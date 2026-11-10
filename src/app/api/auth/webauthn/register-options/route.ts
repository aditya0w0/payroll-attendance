import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createPasskeyRegistrationOptions } from "@/lib/webauthn";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Handles WebAuthn registration options generation for authenticated employees.
 * Supports both GET and POST requests.
 * Enforces Single-Device Immutability: Once bound, re-binding is blocked unless
 * an approved Device Unlock Request exists from the Owner.
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

    // Security Gate: Check if employee already has an active bound passkey device
    if (current.user.role === "EMPLOYEE") {
      const existingDev = await prisma.deviceRegistration.findUnique({
        where: { userId: current.user.id },
      });

      if (existingDev && existingDev.credentialId && existingDev.isActive) {
        const approvedUnlock = await prisma.deviceUnlockRequest.findFirst({
          where: {
            userId: current.user.id,
            status: "APPROVED",
            expiresAt: { gt: new Date() },
          },
        });

        if (!approvedUnlock) {
          return NextResponse.json(
            {
              error: "DEVICE_ALREADY_BOUND",
              message:
                "Perangkat fisik/Passkey sudah terikat secara permanen pada akun ini. Pengikatan ulang hanya diizinkan dengan persetujuan Unlock dari Owner.",
            },
            { status: 403 }
          );
        }
      }
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
