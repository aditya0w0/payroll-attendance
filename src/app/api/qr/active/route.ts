import { NextResponse } from "next/server";
import { getOrCreateActiveQRChallenge } from "@/lib/qr";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const now = new Date();

    // Task 3.1: Dynamic ISP Public IP Auto-Sync via Kiosk Heartbeat
    // When an authenticated OWNER session polls GET /api/qr/active from the workplace WiFi:
    try {
      const current = await getCurrentUser(req);
      if (current && current.user.role === "OWNER") {
        const kioskIp = (
          req.headers.get("x-forwarded-for")?.split(",")[0] ||
          req.headers.get("x-real-ip") ||
          ""
        ).trim();

        const isLoopback =
          !kioskIp ||
          kioskIp === "127.0.0.1" ||
          kioskIp === "::1" ||
          kioskIp === "localhost" ||
          kioskIp.startsWith("fe80::");

        if (!isLoopback) {
          const officeConfig = await prisma.officeConfig.findFirst({
            orderBy: { createdAt: "desc" },
          });

          if (officeConfig && officeConfig.officePublicIp !== kioskIp) {
            await prisma.officeConfig.update({
              where: { id: officeConfig.id },
              data: { officePublicIp: kioskIp },
            });
          }
        }
      }
    } catch (ipSyncErr) {
      console.warn("Kiosk WAN IP auto-sync error:", ipSyncErr);
    }

    const challenge = await getOrCreateActiveQRChallenge();

    return NextResponse.json(
      {
        ...challenge,
        consumed: false,
        serverTime: now.toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error: any) {
    console.error("QR challenge generator error:", error);
    return NextResponse.json({ error: "Failed to generate dynamic QR challenge" }, { status: 500 });
  }
}
