import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const current = await getCurrentUser(req);
  if (!current) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(req.url);
    const paramIp = searchParams.get("ip")?.trim();

    // Strict IP syntax validation to prevent arbitrary path injection in external API calls
    const IP_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^[a-fA-F0-9:]+$/;
    const sanitizedParamIp = paramIp && IP_REGEX.test(paramIp) ? paramIp : null;

    const clientIp = (
      sanitizedParamIp ||
      req.headers.get("x-forwarded-for")?.split(",")[0] ||
      req.headers.get("x-real-ip") ||
      "127.0.0.1"
    ).trim();

    // Handle local loopback / private IP
    const isPrivate =
      clientIp === "127.0.0.1" ||
      clientIp === "::1" ||
      clientIp.startsWith("192.168.") ||
      clientIp.startsWith("10.") ||
      clientIp.startsWith("172.16.");

    const targetIp = isPrivate ? "" : clientIp;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(`http://ip-api.com/json/${targetIp}?fields=status,message,country,countryCode,regionName,city,lat,lon,timezone,isp,query`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json({
        ip: clientIp,
        city: "Jakarta",
        region: "DKI Jakarta",
        country: "Indonesia",
        latitude: -6.2088,
        longitude: 106.8456,
        isFallback: true,
      });
    }

    const data = await res.json();
    if (data.status !== "success") {
      return NextResponse.json({
        ip: clientIp,
        city: "Jakarta",
        region: "DKI Jakarta",
        country: "Indonesia",
        latitude: -6.2088,
        longitude: 106.8456,
        isFallback: true,
      });
    }

    return NextResponse.json({
      ip: data.query || clientIp,
      city: data.city,
      region: data.regionName,
      country: data.country,
      latitude: data.lat,
      longitude: data.lon,
      isp: data.isp,
      isFallback: false,
    });
  } catch (error: any) {
    console.error("IP lookup error:", error?.message);
    return NextResponse.json({
      city: "Jakarta",
      region: "DKI Jakarta",
      country: "Indonesia",
      latitude: -6.2088,
      longitude: 106.8456,
      isFallback: true,
    });
  }
}
