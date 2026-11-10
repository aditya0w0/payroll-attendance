/**
 * Real-Time Mobile GPS Stream Warm-Up Engine
 * 
 * Prevents erratic cellular BTS / CGNAT gateway jumps (Tegal/Semarang/Jakarta)
 * by continuously streaming hardware satellite samples via watchPosition,
 * discarding coarse cellular BTS readings (> 80m), and locking only true
 * satellite fixes (accuracy <= 50m).
 */

export type GpsStreamStage =
  | "requesting"
  | "sampling"
  | "cellular_bts_warning"
  | "locked"
  | "timeout"
  | "denied"
  | "error";

export interface GpsStreamDiagnostic {
  stage: GpsStreamStage;
  accuracy: number | null;
  bestAccuracy: number | null;
  latitude: number | null;
  longitude: number | null;
  elapsedSeconds: number;
  isCellularBts: boolean;
  errorCode?: "GPS_INDOOR_TIMEOUT" | "GPS_PERMISSION_DENIED" | "GPS_UNAVAILABLE" | string;
  errorMessage?: string;
}

export interface GpsStreamOptions {
  targetAccuracyMeters?: number; // Target accuracy to achieve satellite lock (default: 50m)
  discardThresholdMeters?: number; // Readings with accuracy > this threshold discarded from lock (default: 80m)
  maxWaitSeconds?: number; // Total timeout before raising GPS_INDOOR_TIMEOUT (default: 12s)
  btsWarningSeconds?: number; // If accuracy remains > 500m after this duration, warn of BTS tower (default: 5s)
  onDiagnostic?: (diagnostic: GpsStreamDiagnostic) => void;
}

export interface GpsLockResult {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export interface GpsStreamSubscription {
  stop: () => void;
  promise: Promise<GpsLockResult>;
}

export function startGpsWarmUp(options: GpsStreamOptions = {}): GpsStreamSubscription {
  const targetAccuracy = options.targetAccuracyMeters ?? 50;
  const discardThreshold = options.discardThresholdMeters ?? 80;
  const maxWait = options.maxWaitSeconds ?? 12;
  const btsWarningSec = options.btsWarningSeconds ?? 5;

  let isFinished = false;
  let watchId: number | null = null;
  let secondTimer: NodeJS.Timeout | null = null;
  let elapsedSeconds = 0;
  let bestAccuracySeen: number | null = null;
  let lastReportedAccuracy: number | null = null;
  let lastCoords: { latitude: number; longitude: number } | null = null;

  let resolvePromise!: (res: GpsLockResult) => void;
  let rejectPromise!: (err: any) => void;

  const promise = new Promise<GpsLockResult>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  const cleanup = () => {
    isFinished = true;
    if (watchId !== null && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    if (secondTimer !== null) {
      clearInterval(secondTimer);
      secondTimer = null;
    }
  };

  const notify = (update: Partial<GpsStreamDiagnostic> & { stage: GpsStreamStage }) => {
    if (isFinished && update.stage !== "locked" && update.stage !== "timeout" && update.stage !== "denied" && update.stage !== "error") {
      return;
    }
    options.onDiagnostic?.({
      stage: update.stage,
      accuracy: update.accuracy !== undefined ? update.accuracy : lastReportedAccuracy,
      bestAccuracy: update.bestAccuracy !== undefined ? update.bestAccuracy : bestAccuracySeen,
      latitude: update.latitude !== undefined ? update.latitude : lastCoords?.latitude ?? null,
      longitude: update.longitude !== undefined ? update.longitude : lastCoords?.longitude ?? null,
      elapsedSeconds,
      isCellularBts: (lastReportedAccuracy !== null && lastReportedAccuracy > 500) || (update.isCellularBts ?? false),
      errorCode: update.errorCode,
      errorMessage: update.errorMessage,
    });
  };

  if (typeof window === "undefined" || !navigator.geolocation) {
    const error = new Error("Perangkat atau browser tidak mendukung sensor GPS Geolocation.");
    (error as any).code = "GPS_UNAVAILABLE";
    notify({
      stage: "error",
      errorCode: "GPS_UNAVAILABLE",
      errorMessage: error.message,
    });
    cleanup();
    rejectPromise(error);
    return { stop: cleanup, promise };
  }

  // Initial stage notification
  notify({
    stage: "requesting",
    accuracy: null,
    bestAccuracy: null,
    latitude: null,
    longitude: null,
    isCellularBts: false,
  });

  // Second-by-second ticker for timeout, elapsed counter, and BTS warning detection
  secondTimer = setInterval(() => {
    if (isFinished) return;
    elapsedSeconds += 1;

    // Check if after 5 seconds accuracy remains > 500m (Cellular BTS tower)
    const isBts = lastReportedAccuracy !== null && lastReportedAccuracy > 500;
    if (elapsedSeconds >= btsWarningSec && isBts) {
      notify({
        stage: "cellular_bts_warning",
        accuracy: lastReportedAccuracy,
        bestAccuracy: bestAccuracySeen,
        isCellularBts: true,
        errorMessage: `Sinyal satelit GPS lemah (terdeteksi BTS seluler ±${lastReportedAccuracy}m). Pastikan izin 'Lokasi Akurat / Precise Location' aktif di setelan browser dan geser ke dekat pintu/jendela.`,
      });
    } else {
      notify({
        stage: "sampling",
        accuracy: lastReportedAccuracy,
        bestAccuracy: bestAccuracySeen,
        isCellularBts: isBts,
      });
    }

    // 12-second total timeout
    if (elapsedSeconds >= maxWait) {
      cleanup();
      const timeoutError = new Error(
        "Sinyal satelit GPS terhalang atap ruangan. Silakan melangkah beberapa meter ke dekat pintu atau jendela, lalu tekan Coba Lagi."
      );
      (timeoutError as any).code = "GPS_INDOOR_TIMEOUT";
      (timeoutError as any).lastAccuracy = lastReportedAccuracy;
      (timeoutError as any).bestAccuracy = bestAccuracySeen;

      notify({
        stage: "timeout",
        errorCode: "GPS_INDOOR_TIMEOUT",
        errorMessage: timeoutError.message,
        accuracy: lastReportedAccuracy,
        bestAccuracy: bestAccuracySeen,
        isCellularBts: lastReportedAccuracy !== null && lastReportedAccuracy > 500,
      });

      rejectPromise(timeoutError);
    }
  }, 1000);

  try {
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (isFinished) return;

        const coords = pos.coords;
        const rawAccuracy = Math.round(coords.accuracy);
        lastReportedAccuracy = rawAccuracy;
        lastCoords = {
          latitude: Number(coords.latitude.toFixed(6)),
          longitude: Number(coords.longitude.toFixed(6)),
        };

        if (bestAccuracySeen === null || rawAccuracy < bestAccuracySeen) {
          bestAccuracySeen = rawAccuracy;
        }

        const isBts = rawAccuracy > 500;

        // Discard check: If accuracy > 80m, discard from lock, report to UI
        if (rawAccuracy > discardThreshold) {
          notify({
            stage: elapsedSeconds >= btsWarningSec && isBts ? "cellular_bts_warning" : "sampling",
            accuracy: rawAccuracy,
            bestAccuracy: bestAccuracySeen,
            latitude: lastCoords.latitude,
            longitude: lastCoords.longitude,
            isCellularBts: isBts,
          });
          return;
        }

        // Acceptable satellite fix achieved: if accuracy <= targetAccuracy (50m), lock immediately
        if (rawAccuracy <= targetAccuracy) {
          cleanup();
          notify({
            stage: "locked",
            accuracy: rawAccuracy,
            bestAccuracy: bestAccuracySeen,
            latitude: lastCoords.latitude,
            longitude: lastCoords.longitude,
            isCellularBts: false,
          });

          resolvePromise({
            latitude: lastCoords.latitude,
            longitude: lastCoords.longitude,
            accuracy: rawAccuracy,
          });
          return;
        }

        // Reading is between targetAccuracy (50m) and discardThreshold (80m)
        notify({
          stage: "sampling",
          accuracy: rawAccuracy,
          bestAccuracy: bestAccuracySeen,
          latitude: lastCoords.latitude,
          longitude: lastCoords.longitude,
          isCellularBts: false,
        });
      },
      (err) => {
        if (isFinished) return;
        cleanup();

        let errorCode = "GPS_ERROR";
        let errorMessage = err.message || "Gagal memperoleh sinyal GPS.";

        if (err.code === 1) { // PERMISSION_DENIED
          errorCode = "GPS_PERMISSION_DENIED";
          errorMessage = "Izin lokasi ditolak. Buka setelan browser dan aktifkan 'Lokasi Akurat / Precise Location'.";
          notify({
            stage: "denied",
            errorCode,
            errorMessage,
            isCellularBts: false,
          });
        } else if (err.code === 3) { // TIMEOUT
          errorCode = "GPS_INDOOR_TIMEOUT";
          errorMessage = "Sinyal satelit GPS terhalang atap ruangan. Silakan melangkah beberapa meter ke dekat pintu atau jendela, lalu tekan Coba Lagi.";
          notify({
            stage: "timeout",
            errorCode,
            errorMessage,
            isCellularBts: false,
          });
        } else {
          notify({
            stage: "error",
            errorCode,
            errorMessage,
            isCellularBts: false,
          });
        }

        const geoError = new Error(errorMessage);
        (geoError as any).code = errorCode;
        rejectPromise(geoError);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0, // Force fresh satellite acquisition, never use cached coordinates
        timeout: 15000,
      }
    );
  } catch (e: any) {
    cleanup();
    const error = new Error(e?.message || "Gagal mengaktifkan sensor lokasi.");
    (error as any).code = "GPS_UNAVAILABLE";
    notify({
      stage: "error",
      errorCode: "GPS_UNAVAILABLE",
      errorMessage: error.message,
    });
    rejectPromise(error);
  }

  return {
    stop: cleanup,
    promise,
  };
}
