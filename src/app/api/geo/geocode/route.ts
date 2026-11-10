import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Lightweight LRU cache to minimize external Nominatim calls
const geocodeCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q")?.trim();

    if (!query || query.length < 2) {
      return NextResponse.json({ error: "Query parameter 'q' must be at least 2 characters" }, { status: 400 });
    }

    const cacheKey = query.toLowerCase();
    const cached = geocodeCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({ results: cached.data });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      query
    )}&limit=5&countrycodes=id&addressdetails=1`;

    const res = await fetch(nominatimUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "PayrollAttendanceApp/1.0 (anti-cheat-geofence)",
        "Accept-Language": "id,en;q=0.8",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json({ results: [] });
    }

    const rawResults = await res.json();
    const formatted = (rawResults || []).map((item: any) => ({
      displayName: item.display_name,
      name: item.name || item.display_name.split(",")[0],
      latitude: parseFloat(item.lat),
      longitude: parseFloat(item.lon),
      type: item.type,
      importance: item.importance,
    }));

    geocodeCache.set(cacheKey, { data: formatted, timestamp: Date.now() });

    return NextResponse.json({ results: formatted });
  } catch (error: any) {
    console.error("Geocode API error:", error?.message);
    return NextResponse.json({ results: [], error: "Gagal mencari alamat" }, { status: 500 });
  }
}
