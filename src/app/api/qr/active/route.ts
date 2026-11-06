import { NextResponse } from "next/server";
import { getOrCreateActiveQRChallenge } from "@/lib/qr";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const challenge = await getOrCreateActiveQRChallenge();
    return NextResponse.json(challenge, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error: any) {
    console.error("QR challenge generator error:", error);
    return NextResponse.json({ error: "Failed to generate dynamic QR challenge" }, { status: 500 });
  }
}
