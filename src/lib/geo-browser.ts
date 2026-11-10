/**
 * Browser-side Multi-Stage High-Precision Geolocation Engine
 * 
 * Solves single-shot GPS inaccuracy by using continuous watchPosition sampling,
 * allowing mobile GPS chips and Wi-Fi triangulation to warm up and lock onto satellites
 * until maximum precision (lowest accuracy radius) is achieved.
 */

export interface PrecisionLocationResult {
  latitude: number;
  longitude: number;
  accuracy: number;
  source: "gps_precision" | "gps_standard" | "ip_network";
  isHighPrecision: boolean;
  address?: string;
  error?: string;
}

export interface PrecisionProgressCallback {
  (info: {
    stage: "requesting" | "sampling" | "locking" | "fallback" | "done";
    currentAccuracy?: number;
    bestAccuracy?: number;
    message: string;
  }): void;
}

export async function acquirePrecisionLocation(
  onProgress?: PrecisionProgressCallback,
  options: {
    targetAccuracyMeters?: number; // Stop immediately once accuracy <= target (default: 20m)
    maxAcquisitionMs?: number;     // Max time to wait for satellite lock (default: 7000ms)
    allowIpFallback?: boolean;     // Fallback to IP geolocation if GPS completely unavailable
  } = {}
): Promise<PrecisionLocationResult> {
  const targetAccuracy = options.targetAccuracyMeters ?? 20;
  const maxWait = options.maxAcquisitionMs ?? 7000;
  const allowIp = options.allowIpFallback ?? true;

  if (typeof window === "undefined" || !navigator.geolocation) {
    if (allowIp) {
      return await acquireIpLocationFallback();
    }
    throw new Error("Perangkat atau browser tidak memiliki sensor GPS Geolocation.");
  }

  onProgress?.({
    stage: "requesting",
    message: "Menghubungkan ke sensor lokasi dan satelit GPS...",
  });

  return new Promise<PrecisionLocationResult>((resolve) => {
    let bestFix: GeolocationCoordinates | null = null;
    let watchId: number | null = null;
    let isDone = false;

    const cleanup = () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
    };

    const finish = (result: PrecisionLocationResult) => {
      if (isDone) return;
      isDone = true;
      cleanup();
      clearTimeout(timer);
      onProgress?.({
        stage: "done",
        bestAccuracy: result.accuracy,
        message: `Lokasi terkunci dengan akurasi +/- ${Math.round(result.accuracy)}m`,
      });
      resolve(result);
    };

    // Hard timeout timer: Stop watching and use the best fix acquired
    const timer = setTimeout(async () => {
      if (isDone) return;
      if (bestFix) {
        finish({
          latitude: Number(bestFix.latitude.toFixed(6)),
          longitude: Number(bestFix.longitude.toFixed(6)),
          accuracy: Math.round(bestFix.accuracy),
          source: bestFix.accuracy <= 40 ? "gps_precision" : "gps_standard",
          isHighPrecision: bestFix.accuracy <= 40,
        });
      } else if (allowIp) {
        onProgress?.({
          stage: "fallback",
          message: "GPS tidak merespons, beralih ke deteksi IP jaringan...",
        });
        const ipLoc = await acquireIpLocationFallback();
        finish(ipLoc);
      } else {
        finish({
          latitude: -6.2088,
          longitude: 106.8456,
          accuracy: 500,
          source: "ip_network",
          isHighPrecision: false,
          error: "Waktu permintaan GPS habis tanpa sinyal.",
        });
      }
    }, maxWait);

    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (isDone) return;
          const coords = pos.coords;
          const acc = coords.accuracy;

          if (!bestFix || acc < bestFix.accuracy) {
            bestFix = coords;
          }

          onProgress?.({
            stage: "sampling",
            currentAccuracy: Math.round(acc),
            bestAccuracy: Math.round(bestFix.accuracy),
            message: `Mengkalibrasi sinyal GPS... (Akurasi saat ini: +/- ${Math.round(acc)}m, terbaik: +/- ${Math.round(bestFix.accuracy)}m)`,
          });

          // If reached target high accuracy (e.g. <= 20m), lock immediately
          if (bestFix.accuracy <= targetAccuracy) {
            finish({
              latitude: Number(bestFix.latitude.toFixed(6)),
              longitude: Number(bestFix.longitude.toFixed(6)),
              accuracy: Math.round(bestFix.accuracy),
              source: "gps_precision",
              isHighPrecision: true,
            });
          }
        },
        async (err) => {
          // If watchPosition fails immediately and we have no best fix
          if (!bestFix) {
            if (allowIp) {
              onProgress?.({
                stage: "fallback",
                message: `Izin lokasi ditolak (${err.message}). Menggunakan estimasi lokasi jaringan...`,
              });
              const ipLoc = await acquireIpLocationFallback();
              finish(ipLoc);
            } else {
              finish({
                latitude: -6.2088,
                longitude: 106.8456,
                accuracy: 1000,
                source: "ip_network",
                isHighPrecision: false,
                error: err.message,
              });
            }
          }
        },
        {
          enableHighAccuracy: true,
          timeout: maxWait,
          maximumAge: 0,
        }
      );
    } catch (err: any) {
      if (allowIp) {
        acquireIpLocationFallback().then(finish);
      } else {
        finish({
          latitude: -6.2088,
          longitude: 106.8456,
          accuracy: 1000,
          source: "ip_network",
          isHighPrecision: false,
          error: err?.message,
        });
      }
    }
  });
}

/**
 * Fallback to IP Geolocation when GPS hardware or browser permission is denied
 */
export async function acquireIpLocationFallback(): Promise<PrecisionLocationResult> {
  try {
    const res = await fetch("/api/geo/ip-lookup");
    if (!res.ok) throw new Error("Gagal mengambil data IP");
    const data = await res.json();
    return {
      latitude: Number(data.latitude.toFixed(6)),
      longitude: Number(data.longitude.toFixed(6)),
      accuracy: 500, // IP geolocation has rough city-level accuracy
      source: "ip_network",
      isHighPrecision: false,
      address: `${data.city || "Kota"}, ${data.region || ""}, ${data.country || "Indonesia"}`,
    };
  } catch {
    return {
      latitude: -6.2088,
      longitude: 106.8456,
      accuracy: 1000,
      source: "ip_network",
      isHighPrecision: false,
      address: "Pusat Kota Jakarta (Fallback)",
    };
  }
}

/**
 * Reverse geocode coordinates to human-readable address string
 */
export async function fetchAddressFromCoords(lat: number, lon: number): Promise<string> {
  try {
    const res = await fetch(`/api/geo/reverse?lat=${lat}&lon=${lon}`);
    if (!res.ok) return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    const data = await res.json();
    return data.address || `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  } catch {
    return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  }
}

/**
 * Search places by address / keyword
 */
export async function searchPlacesByQuery(query: string): Promise<
  Array<{
    displayName: string;
    name: string;
    latitude: number;
    longitude: number;
  }>
> {
  if (!query || query.trim().length < 2) return [];
  try {
    const res = await fetch(`/api/geo/geocode?q=${encodeURIComponent(query.trim())}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.results || [];
  } catch {
    return [];
  }
}
