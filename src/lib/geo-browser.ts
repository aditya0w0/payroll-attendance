/**
 * Browser-side Multi-Stage High-Precision Geolocation Engine
 * 
 * Solves single-shot GPS inaccuracy by using continuous watchPosition sampling,
 * allowing mobile GPS chips and Wi-Fi triangulation to warm up and lock onto satellites
 * until maximum precision (lowest accuracy radius) is achieved.
 */

export const DEFAULT_OFFICE_COORDS = {
  latitude: -6.9338,
  longitude: 109.6541,
  address: "Buaran, Pekalongan, Jawa Tengah",
};

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
    discardThresholdMeters?: number; // Discard readings coarser than this (default: 80m)
    maxAcquisitionMs?: number;     // Max time to wait for satellite lock (default: 15000ms)
    allowIpFallback?: boolean;     // Fallback to IP geolocation ONLY if user explicitly permits (default: false)
  } = {}
): Promise<PrecisionLocationResult> {
  const targetAccuracy = options.targetAccuracyMeters ?? 20;
  const discardThreshold = options.discardThresholdMeters ?? 80;
  const maxWait = options.maxAcquisitionMs ?? 15000;
  // CRITICAL: Default to false to prevent cellular IP (e.g. Tegal gateway) from silently overriding Pekalongan GPS
  const allowIp = options.allowIpFallback ?? false;

  if (typeof window === "undefined" || !navigator.geolocation) {
    if (allowIp) {
      return await acquireIpLocationFallback();
    }
    throw new Error("Perangkat atau browser tidak memiliki sensor GPS Geolocation aktif.");
  }

  onProgress?.({
    stage: "requesting",
    message: "Mengaktifkan sensor satelit GPS perangkat...",
  });

  return new Promise<PrecisionLocationResult>((resolve, reject) => {
    let bestFix: GeolocationCoordinates | null = null;
    let lastSeenAccuracy: number | null = null;
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
        message: result.error
          ? result.error
          : `Lokasi terkunci dengan akurasi +/- ${Math.round(result.accuracy)}m (${result.isHighPrecision ? "Satelit Presisi Tinggi" : "GPS Standar"})`,
      });
      resolve(result);
    };

    // Timeout timer: Stop watching and use the best fix acquired ONLY if within discardThreshold (<= 80m)
    const timer = setTimeout(async () => {
      if (isDone) return;
      if (bestFix && bestFix.accuracy <= discardThreshold) {
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
          message: "Sinyal GPS belum terkunci, beralih ke estimasi IP jaringan...",
        });
        const ipLoc = await acquireIpLocationFallback();
        finish(ipLoc);
      } else {
        const errorMsg = lastSeenAccuracy && lastSeenAccuracy > discardThreshold
          ? `Satelit GPS presisi belum terkunci (hanya terdeteksi BTS seluler +/- ${Math.round(lastSeenAccuracy)}m yang kurang presisi). Silakan geser pin manual pada peta atau pilih preset Pekalongan.`
          : "Sinyal satelit GPS belum terkunci (terhalang atap ruangan atau izin lokasi belum aktif). Silakan geser pin manual pada peta atau pilih preset kota terdekat.";
        finish({
          latitude: DEFAULT_OFFICE_COORDS.latitude,
          longitude: DEFAULT_OFFICE_COORDS.longitude,
          accuracy: 100,
          source: "gps_standard",
          isHighPrecision: false,
          error: errorMsg,
        });
      }
    }, maxWait);

    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (isDone) return;
          const coords = pos.coords;
          const acc = coords.accuracy;
          lastSeenAccuracy = acc;

          // Discard coarse cellular BTS guesses (> 80m) from becoming bestFix
          if (acc <= discardThreshold && (!bestFix || acc < bestFix.accuracy)) {
            bestFix = coords;
          }

          const isCellularBts = acc > 300;
          onProgress?.({
            stage: "sampling",
            currentAccuracy: Math.round(acc),
            bestAccuracy: bestFix ? Math.round(bestFix.accuracy) : undefined,
            message: isCellularBts
              ? `Terdeteksi sinyal BTS seluler +/- ${Math.round(acc)}m (terlalu kasar). Mengkalibrasi satelit GPS presisi...`
              : `Mengkalibrasi sinyal satelit GPS... (Akurasi: +/- ${Math.round(acc)}m${bestFix ? `, terbaik: +/- ${Math.round(bestFix.accuracy)}m` : ""})`,
          });

          // If reached target high accuracy (e.g. <= 20m), lock immediately
          if (bestFix && bestFix.accuracy <= targetAccuracy) {
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
          if (!bestFix) {
            if (allowIp) {
              onProgress?.({
                stage: "fallback",
                message: `Izin lokasi ditolak (${err.message}). Menggunakan estimasi jaringan...`,
              });
              const ipLoc = await acquireIpLocationFallback();
              finish(ipLoc);
            } else {
              let errorMsg = `Gagal membaca GPS: ${err.message}`;
              if (err.code === 1) {
                errorMsg = "Izin lokasi belum diizinkan di browser ini. Buka setelan browser dan izinkan akses lokasi (Precise Location) untuk situs ini.";
              } else if (err.code === 2) {
                errorMsg = "Sinyal GPS fisik tidak tersedia pada perangkat saat ini.";
              } else if (err.code === 3) {
                errorMsg = "Mencari sinyal GPS satelit memakan waktu terlalu lama. Pastikan GPS aktif dan berada di dekat jendela/luar ruangan.";
              }
              finish({
                latitude: DEFAULT_OFFICE_COORDS.latitude,
                longitude: DEFAULT_OFFICE_COORDS.longitude,
                accuracy: 100,
                source: "gps_standard",
                isHighPrecision: false,
                error: errorMsg,
              });
            }
          }
        },
        {
          enableHighAccuracy: true,
          timeout: maxWait,
          maximumAge: 0, // Force fresh satellite acquisition, never use cached coordinates
        }
      );
    } catch (err: any) {
      if (allowIp) {
        acquireIpLocationFallback().then(finish);
      } else {
        finish({
          latitude: DEFAULT_OFFICE_COORDS.latitude,
          longitude: DEFAULT_OFFICE_COORDS.longitude,
          accuracy: 100,
          source: "gps_standard",
          isHighPrecision: false,
          error: err?.message || "Sensor GPS tidak dapat diakses",
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
      accuracy: 500, // IP geolocation has rough regional accuracy
      source: "ip_network",
      isHighPrecision: false,
      address: `${data.city || "Kota"}, ${data.region || ""}, ${data.country || "Indonesia"} (Estimasi IP Jaringan)`,
    };
  } catch {
    return {
      latitude: DEFAULT_OFFICE_COORDS.latitude,
      longitude: DEFAULT_OFFICE_COORDS.longitude,
      accuracy: 500,
      source: "ip_network",
      isHighPrecision: false,
      address: DEFAULT_OFFICE_COORDS.address,
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
