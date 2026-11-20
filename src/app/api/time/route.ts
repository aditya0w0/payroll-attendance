import { NextResponse } from "next/server";
import { getJakartaNow, getJakartaDateString, formatJakartaTime, BUSINESS_TIMEZONE } from "@/lib/timezone";

export const dynamic = "force-dynamic";

/**
 * Authoritative Time & Timezone Synchronization Endpoint
 * Provides authoritative Internet/Server time in Asia/Jakarta (UTC+7).
 */
export async function GET() {
  const now = getJakartaNow();
  const dateStr = getJakartaDateString(now);
  const timeStr = formatJakartaTime(now, true);

  return NextResponse.json({
    success: true,
    serverTime: now.toISOString(),
    timezone: BUSINESS_TIMEZONE,
    dateJakarta: dateStr,
    timeJakarta: timeStr,
    timestamp: now.getTime(),
    source: "INTERNET_SERVER",
  });
}
