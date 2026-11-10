import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const reverseCache = new Map<string, { address: string; timestamp: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const latStr = searchParams.get("lat");
    const lonStr = searchParams.get("lon");

    if (!latStr || !lonStr) {
      return NextResponse.json({ error: "Parameters 'lat' and 'lon' are required" }, { status: 400 });
    }

    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);

    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return NextResponse.json({ error: "Invalid geographic coordinates" }, { status: 400 });
    }

    // Cache key rounded to ~11 meters (4 decimal places)
    const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    const cached = reverseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({ address: cached.address });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;

    const res = await fetch(nominatimUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "PayrollAttendanceApp/1.0 (anti-cheat-geofence)",
        "Accept-Language": "id,en;q=0.8",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json({ address: `${lat.toFixed(6)}, ${lon.toFixed(6)}` });
    }

    const data = await res.json();
    const address = data?.display_name || `${lat.toFixed(6)}, ${lon.toFixed(6)}`;

    reverseCache.set(cacheKey, { address, timestamp: Date.now() });

    return NextResponse.json({ address, details: data?.address || null });
  } catch (error: any) {
    console.error("Reverse geocode API error:", error?.message);
    return NextResponse.json({ address: null, error: "Gagal mendeteksi nama alamat" }, { status: 500 });
  }
}
