"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Zap,
  SwitchCamera,
  RotateCcw,
  MapPin,
  Clock,
} from "lucide-react";
import Link from "next/link";
import { formatIDR } from "@/lib/utils";
import { getClientDeviceIdentity } from "@/lib/device-client";
import jsQR from "jsqr";

interface DashboardShiftInfo {
  today: {
    shiftDate: string;
    scheduledStart: string;
    scheduledEnd: string;
    state: "NOT_CHECKED_IN" | "CHECKED_IN" | "COMPLETED";
    activeRecord: {
      checkInTime: string;
      checkOutTime: string | null;
      status: string;
      lateMinutes: number;
      lateDeduction: number;
      netDailyEarnings: number;
    } | null;
  };
  employee: {
    fullName: string;
    employeeId: string;
    shift: {
      name: string;
      startTime: string;
      endTime: string;
      isOvernight: boolean;
    };
  };
}

export default function EmployeeScanPage() {
  const router = useRouter();
  const [shiftInfo, setShiftInfo] = useState<DashboardShiftInfo | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = sessionStorage.getItem("cg_employee_dashboard_cache");
        if (cached) return JSON.parse(cached);
      } catch {}
    }
    return null;
  });
  const [loadingShift, setLoadingShift] = useState(false);

  // Scan & Processing State
  const [loading, setLoading] = useState(false);
  const [scanningPulse, setScanningPulse] = useState(false);
  const [scanStatusHint, setScanStatusHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<any | null>(null);

  // Geolocation Anti-Cheat Verification State
  const [gpsCoords, setGpsCoords] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Early Clock-Out Warning Popup State & Mandatory Countdown
  const [earlyModalOpen, setEarlyModalOpen] = useState(false);
  const [earlyToken, setEarlyToken] = useState<string>("");
  const [earlyScheduledEnd, setEarlyScheduledEnd] = useState<string>("");
  const [earlyMinutes, setEarlyMinutes] = useState<number>(0);
  const [earlyReason, setEarlyReason] = useState<string>("");
  const [earlyApproved, setEarlyApproved] = useState<boolean>(false);
  const [earlyCountdown, setEarlyCountdown] = useState<number>(5);
  const [earlySubmitting, setEarlySubmitting] = useState(false);

  // Timezone Synchronization Metadata
  const getTimezoneMetadata = async (): Promise<{
    timezoneSource: "INTERNET" | "LOCAL_FALLBACK";
    clientTimezone: string;
  }> => {
    const localTz =
      typeof Intl !== "undefined" && Intl.DateTimeFormat
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : "Asia/Jakarta";
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch("/api/time", { signal: controller.signal, cache: "no-store" });
      clearTimeout(timeoutId);
      if (res.ok) {
        return {
          timezoneSource: "INTERNET",
          clientTimezone: localTz,
        };
      }
    } catch {
      // Network timeout or offline fallback
    }
    return {
      timezoneSource: "LOCAL_FALLBACK",
      clientTimezone: localTz,
    };
  };

  // 5-second mandatory countdown lock for early checkout
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (earlyModalOpen && earlyCountdown > 0) {
      timer = setTimeout(() => {
        setEarlyCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [earlyModalOpen, earlyCountdown]);

  // Active Refs to prevent React Stale Closure bugs inside requestAnimationFrame
  const gpsCoordsRef = useRef<{
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null>(null);
  const isSubmittingRef = useRef(false);
  const pendingTokenRef = useRef<string | null>(null);
  const lastScannedTokenRef = useRef<string | null>(null);
  const lastScannedTimeRef = useRef<number>(0);
  const lastScanTickRef = useRef<number>(0);

  // Camera Stream & Live Scanner State
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  // 1. Fetch current employee shift & attendance state
  const loadShiftStatus = async () => {
    try {
      setLoadingShift(true);
      const res = await fetch("/api/employee/dashboard", { cache: "no-store" });
      if (res.ok) {
        const d = await res.json();
        setShiftInfo(d);
        if (typeof window !== "undefined") {
          try {
            sessionStorage.setItem("cg_employee_dashboard_cache", JSON.stringify(d));
          } catch {}
        }
      }
    } catch {
      // Non-fatal, scanner can still function
    } finally {
      setLoadingShift(false);
    }
  };

  // Helper to commit GPS coordinates to both React state and ref
  const commitGpsCoordinates = (coords: {
    latitude: number;
    longitude: number;
    accuracy: number;
  }) => {
    gpsCoordsRef.current = coords;
    setGpsCoords(coords);
    setGpsError(null);
    setGpsLoading(false);

    // If a token was waiting for GPS acquisition, submit immediately
    if (pendingTokenRef.current) {
      const queuedToken = pendingTokenRef.current;
      pendingTokenRef.current = null;
      submitToken(queuedToken);
    }
  };

  // 2. Direct Native Geolocation Trigger (Synchronous browser call)
  const triggerNativeGpsPrompt = () => {
    if (typeof window === "undefined" || !("geolocation" in window.navigator)) {
      setGpsError("Fitur lokasi tidak didukung pada peramban ini.");
      return;
    }

    setGpsLoading(true);
    setGpsError(null);

    window.navigator.geolocation.getCurrentPosition(
      (position) => {
        commitGpsCoordinates({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy),
        });
      },
      (geoErr) => {
        setGpsLoading(false);
        if (geoErr.code === 1) {
          setGpsError(
            "Izin akses lokasi belum diaktifkan. Buka setelan peramban atau klik ikon gembok pada bilah alamat untuk mengizinkan akses lokasi kantor."
          );
        } else if (geoErr.code === 2) {
          setGpsError("Sinyal GPS tidak terdeteksi. Pastikan perangkat Anda memiliki sinyal GPS atau koneksi jaringan yang memadai.");
        } else if (geoErr.code === 3) {
          setGpsError("Waktu pencarian koordinat lokasi habis. Silakan coba kembali.");
        } else {
          setGpsError("Gagal memperoleh koordinat lokasi perangkat.");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  };

  // Mount initialization: Load Shift Status, GPS, and Start Camera
  useEffect(() => {
    loadShiftStatus();
    triggerNativeGpsPrompt();
    startCamera("environment");

    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setTorchOn(false);
    isSubmittingRef.current = false;
  };

  const startCamera = async (targetFacing: "environment" | "user" = facingMode) => {
    setCameraStarting(true);
    setCameraError(null);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setCameraError("Kamera tidak didukung pada browser ini. Buka situs di Safari atau Chrome.");
      setCameraStarting(false);
      return;
    }

    try {
      let stream: MediaStream | null = null;
      let lastError: any = null;

      // Strategy 1: Ideal facingMode and 720p resolution
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: targetFacing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch (err1) {
        lastError = err1;
      }

      // Strategy 2: Relaxed resolution with ideal facingMode
      if (!stream) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: targetFacing },
            },
            audio: false,
          });
        } catch (err2) {
          lastError = err2;
        }
      }

      // Strategy 3: Minimal generic video stream (desktop webcams, virtual cams)
      if (!stream) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } catch (err3) {
          lastError = err3;
        }
      }

      if (!stream) {
        throw lastError || new Error("Kamera tidak dapat diinisialisasi.");
      }

      streamRef.current = stream;

      if (videoRef.current) {
        const video = videoRef.current;
        video.srcObject = stream;

        let loopInitiated = false;
        const initiateLoop = () => {
          if (!loopInitiated) {
            loopInitiated = true;
            startScanningLoop();
          }
        };

        video.onloadedmetadata = async () => {
          try {
            await video.play();
          } catch (playErr) {
            console.warn("Video play error:", playErr);
          }
          initiateLoop();
        };

        await video.play().catch(() => {});
        if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
          initiateLoop();
        }
      }

      setCameraActive(true);
      setFacingMode(targetFacing);

      const track = stream.getVideoTracks()[0];
      const capabilities: any = track?.getCapabilities ? track.getCapabilities() : {};
      setTorchSupported(Boolean(capabilities?.torch));
    } catch (err: any) {
      console.error("Camera access error:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setCameraError(
          "Izin akses kamera belum diberikan. Buka setelan peramban untuk mengizinkan akses kamera pada situs ini."
        );
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setCameraError("Kamera tidak terdeteksi pada perangkat ini.");
      } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
        setCameraError("Kamera sedang digunakan oleh aplikasi lain.");
      } else if (err.name === "OverconstrainedError") {
        setCameraError("Spesifikasi sensor kamera tidak didukung pada peramban ini.");
      } else {
        setCameraError("Kamera tidak dapat dibuka saat ini. Silakan coba kembali.");
      }
      setCameraActive(false);
    } finally {
      setCameraStarting(false);
    }
  };

  // Continuous Auto-Scanning Engine with Sub-50ms Canvas Downscaling
  const startScanningLoop = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    const scanFrame = async () => {
      // If currently submitting or camera stream stopped, schedule next check
      if (!videoRef.current || !streamRef.current) {
        animFrameRef.current = requestAnimationFrame(scanFrame);
        return;
      }

      if (isSubmittingRef.current) {
        animFrameRef.current = requestAnimationFrame(scanFrame);
        return;
      }

      // THROTTLE: Run heavy QR decoding every ~125ms (~8 checks/sec)
      // This frees up >85% CPU cycles so main thread stays silky smooth
      const now = performance.now();
      if (now - lastScanTickRef.current < 125) {
        animFrameRef.current = requestAnimationFrame(scanFrame);
        return;
      }
      lastScanTickRef.current = now;

      const video = videoRef.current;

      if (
        video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA &&
        video.videoWidth > 0 &&
        video.videoHeight > 0
      ) {
        let foundRawToken: string | null = null;

        // 1. Try native BarcodeDetector if supported (instant hardware-accelerated decode)
        if (typeof window !== "undefined" && "BarcodeDetector" in window) {
          try {
            const detector =
              (window as any).__barcodeDetector ||
              new (window as any).BarcodeDetector({ formats: ["qr_code"] });
            (window as any).__barcodeDetector = detector;
            const barcodes = await detector.detect(video);
            if (barcodes.length > 0 && barcodes[0]?.rawValue) {
              foundRawToken = barcodes[0].rawValue.trim();
            }
          } catch {}
        }

        // 2. High-Performance Fallback: Downscaled jsQR Canvas
        if (!foundRawToken && canvasRef.current) {
          try {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (ctx) {
              // Downscale to max 480px to avoid 1080p CPU thrashing on mobile browsers
              const maxDim = 480;
              const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
              const scanWidth = Math.round(video.videoWidth * scale);
              const scanHeight = Math.round(video.videoHeight * scale);

              if (canvas.width !== scanWidth || canvas.height !== scanHeight) {
                canvas.width = scanWidth;
                canvas.height = scanHeight;
              }

              ctx.drawImage(video, 0, 0, scanWidth, scanHeight);
              const imageData = ctx.getImageData(0, 0, scanWidth, scanHeight);
              const code = jsQR(imageData.data, scanWidth, scanHeight, {
                inversionAttempts: "dontInvert",
              });
              if (code && code.data) {
                foundRawToken = code.data.trim();
              }
            }
          } catch {}
        }

        // 3. Process detected QR code
        if (foundRawToken && foundRawToken.length > 3) {
          const cleanToken = extractCleanToken(foundRawToken);
          const now = Date.now();

          // Prevent double-submitting the exact same token within 4 seconds
          if (
            lastScannedTokenRef.current === cleanToken &&
            now - lastScannedTimeRef.current < 4000
          ) {
            animFrameRef.current = requestAnimationFrame(scanFrame);
            return;
          }

          lastScannedTokenRef.current = cleanToken;
          lastScannedTimeRef.current = now;
          isSubmittingRef.current = true;
          setScanningPulse(true);

          // Haptic tick on QR lock
          if (typeof navigator !== "undefined" && navigator.vibrate) {
            navigator.vibrate(60);
          }

          // Keep animation frame running so loop persists and waits on isSubmittingRef
          animFrameRef.current = requestAnimationFrame(scanFrame);

          submitToken(cleanToken);
          return;
        }
      }

      animFrameRef.current = requestAnimationFrame(scanFrame);
    };

    animFrameRef.current = requestAnimationFrame(scanFrame);
  };

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      const newTorch = !torchOn;
      await (track as any).applyConstraints({
        advanced: [{ torch: newTorch }],
      });
      setTorchOn(newTorch);
    } catch (e) {
      console.error("Torch error:", e);
    }
  };

  const switchCamera = () => {
    const nextFacing = facingMode === "environment" ? "user" : "environment";
    startCamera(nextFacing);
  };

  // Clean and extract QR Token (Handles JSON payload { t: "qr_..." } & plain string)
  const extractCleanToken = (raw: string): string => {
    let trimmed = (raw || "").trim();
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      trimmed = trimmed.slice(1, -1).trim();
    }
    if (trimmed.startsWith("{") && (trimmed.includes('"t"') || trimmed.includes("'t'"))) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed.t === "string" && parsed.t.trim().length > 0) {
          return parsed.t.trim();
        }
      } catch {}
    }
    return trimmed;
  };

  const submitToken = async (
    tokenToSubmit: string,
    earlyOptions?: {
      forceEarlyCheckout: boolean;
      earlyCheckoutReason: string;
      earlyCheckoutApproved: boolean;
    }
  ) => {
    const cleanToken = extractCleanToken(tokenToSubmit);

    // Read LIVE GPS from ref to guarantee freshness and prevent stale closure
    const currentGps = gpsCoordsRef.current;

    if (!currentGps) {
      // If GPS is currently acquiring, store token as pending and display soft hint
      if (gpsLoading) {
        pendingTokenRef.current = cleanToken;
        setScanStatusHint("QR terbaca. Menunggu sinyal GPS satelit mengunci...");
        return;
      }

      setGpsError("Koordinat GPS belum terkunci. Klik tombol 'Izinkan Akses Lokasi' di bawah.");
      isSubmittingRef.current = false;
      setLoading(false);
      setScanningPulse(false);
      lastScannedTokenRef.current = null;
      return;
    }

    setScanStatusHint("Memverifikasi kehadiran...");
    setLoading(true);
    setError(null);

    try {
      const [dev, tzMeta] = await Promise.all([
        getClientDeviceIdentity(),
        getTimezoneMetadata(),
      ]);

      const payload: Record<string, any> = {
        token: cleanToken,
        deviceFingerprint: dev.deviceFingerprint,
        latitude: currentGps.latitude,
        longitude: currentGps.longitude,
        accuracy: currentGps.accuracy,
        timezoneSource: tzMeta.timezoneSource,
        clientTimezone: tzMeta.clientTimezone,
      };

      if (earlyOptions?.forceEarlyCheckout) {
        payload.forceEarlyCheckout = true;
        payload.earlyCheckoutReason = earlyOptions.earlyCheckoutReason;
        payload.earlyCheckoutApproved = earlyOptions.earlyCheckoutApproved;
      }

      const res = await fetch("/api/qr/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        // Intercept early clock-out restriction before shift ends
        if (data.code === "EARLY_CHECKOUT_RESTRICTED") {
          setEarlyToken(cleanToken);
          setEarlyScheduledEnd(data.scheduledEndTime || "17:00:00");
          setEarlyMinutes(data.minutesEarly || 0);
          setEarlyReason("");
          setEarlyApproved(false);
          setEarlyCountdown(5);
          setEarlyModalOpen(true);
          isSubmittingRef.current = false;
          setLoading(false);
          setScanningPulse(false);
          setScanStatusHint(null);
          return;
        }

        let errorMsg = data.error || data.message || "Attendance scan failed";
        if (data.code === "SCAN_COOLDOWN_ACTIVE") {
          errorMsg = "Anda baru saja melakukan Check-In. Tunggu minimal 1 menit sebelum Check-Out.";
        } else if (data.code === "SHIFT_ALREADY_COMPLETED") {
          errorMsg = "Shift hari ini sudah selesai (Check-In dan Check-Out sudah lengkap).";
        } else if (data.code === "GEO_OUT_OF_BOUNDS") {
          errorMsg = "Posisi GPS Anda berada di luar area kantor.";
        } else if (data.code === "FORGED_QR") {
          errorMsg = "QR code sudah berganti atau kedaluwarsa. Arahkan kamera ke QR baru di layar.";
        } else if (data.code === "QR_QUEUE_ROTATING") {
          errorMsg = "QR baru saja digunakan karyawan lain. Arahkan kamera ke QR berikutnya di layar.";
        } else if (data.code === "EARLY_CHECKOUT_REASON_REQUIRED") {
          errorMsg = "Alasan kepulangan lebih awal wajib diisi.";
        }
        throw new Error(errorMsg);
      }

      // Success: Double haptic confirmation and stop camera
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }
      stopCamera();
      setScanResult(data);
      if (typeof window !== "undefined") {
        try {
          if (shiftInfo) {
            const nextState: "NOT_CHECKED_IN" | "CHECKED_IN" | "COMPLETED" =
              data.action === "CHECK_IN" ? "CHECKED_IN" : "COMPLETED";
            const updated: DashboardShiftInfo = {
              ...shiftInfo,
              today: {
                ...shiftInfo.today,
                state: nextState,
                activeRecord: data.record || shiftInfo.today.activeRecord,
              },
            };
            sessionStorage.setItem("cg_employee_dashboard_cache", JSON.stringify(updated));
            setShiftInfo(updated);
          }
        } catch {}
      }
      loadShiftStatus();
    } catch (err: any) {
      // Error: Keep camera stream alive, show error, and re-arm scanner after 2.5s
      setError(err.message || "Gagal memproses presensi.");
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
      }
      setTimeout(() => {
        isSubmittingRef.current = false;
        setScanningPulse(false);
        setScanStatusHint(null);
        lastScannedTokenRef.current = null;
      }, 2500);
    } finally {
      setLoading(false);
    }
  };

  // Determine current contextual workflow
  const isCheckedIn = shiftInfo?.today?.state === "CHECKED_IN";
  const isCompleted = shiftInfo?.today?.state === "COMPLETED";

  return (
    <div className="space-y-4">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/employee"
          className="min-h-[44px] px-3.5 py-2 text-xs text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white flex items-center gap-2 font-medium transition-colors rounded-lg border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Dashboard</span>
        </Link>
        <div className="flex items-center gap-1.5">
          <span className="hig-badge text-[10px] font-mono uppercase px-2.5 py-1 font-bold tracking-tight bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            {isCheckedIn ? "MODE: ABSEN PULANG" : isCompleted ? "SHIFT SELESAI" : "MODE: ABSEN MASUK"}
          </span>
        </div>
      </div>

      {!scanResult ? (
        <div className="space-y-4">
          {/* Shift State Header Banner */}
          <div className="p-4 rounded-3xl liquid-glass flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                  isCheckedIn
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25 shadow-inner"
                    : isCompleted
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 shadow-inner"
                    : "bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/25 shadow-inner"
                }`}
              >
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 block">
                  {isCheckedIn ? "Status: Sedang Bekerja" : isCompleted ? "Status: Selesai" : "Status: Siap Masuk"}
                </span>
                <h3 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                  {isCheckedIn
                    ? "Arahkan ke QR untuk Absen Pulang (Check-Out)"
                    : isCompleted
                    ? "Presensi hari ini sudah selesai"
                    : "Arahkan ke QR untuk Absen Masuk (Check-In)"}
                </h3>
              </div>
            </div>

            {isCheckedIn && shiftInfo?.today?.activeRecord && (
              <span className="text-[11px] font-mono text-neutral-500 font-medium shrink-0">
                In: {shiftInfo.today.activeRecord.checkInTime.split(", ")[1] || shiftInfo.today.activeRecord.checkInTime}
              </span>
            )}
          </div>

          {/* Apple Style Seamless Viewfinder Card */}
          <div className="liquid-glass p-5 rounded-3xl text-center space-y-4">
            {/* Viewfinder Viewport */}
            <div
              className={`relative w-full max-w-[300px] aspect-square mx-auto rounded-3xl overflow-hidden bg-neutral-950 border transition-all duration-300 shadow-inner flex items-center justify-center ${
                scanningPulse
                  ? "border-emerald-500 ring-4 ring-emerald-500/30 shadow-[0_0_25px_rgba(16,185,129,0.4)]"
                  : error
                  ? "border-red-500/80 ring-2 ring-red-500/20"
                  : "border-white/20 dark:border-white/10"
              }`}
            >
              {/* Live Video Feed & Offscreen Canvas */}
              <video
                ref={videoRef}
                playsInline
                autoPlay
                muted
                className={`w-full h-full object-cover ${cameraActive ? "block" : "hidden"}`}
              />
              <canvas ref={canvasRef} className="hidden" />

              {cameraActive ? (
                <>
                  {/* Decorative Viewfinder Overlays */}
                  <div className="absolute inset-0 pointer-events-none select-none z-10">
                    <div className="absolute inset-0 border-[26px] border-black/40" />

                    {/* Viewfinder Target Frame */}
                    <div className="absolute inset-7 rounded-2xl border border-white/50">
                      {/* Corner Markers */}
                      <div className="absolute -top-1 -left-1 w-6 h-6 border-t-[3.5px] border-l-[3.5px] border-blue-500 rounded-tl-sm pointer-events-none" />
                      <div className="absolute -top-1 -right-1 w-6 h-6 border-t-[3.5px] border-r-[3.5px] border-blue-500 rounded-tr-sm pointer-events-none" />
                      <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-[3.5px] border-l-[3.5px] border-blue-500 rounded-bl-sm pointer-events-none" />
                      <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-[3.5px] border-r-[3.5px] border-blue-500 rounded-tr-sm pointer-events-none" />
                    </div>
                  </div>

                  {/* Processing Status Overlay */}
                  {loading && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-md z-30 flex flex-col items-center justify-center gap-2 text-white">
                      <div className="w-9 h-9 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span className="text-xs font-medium tracking-wide">
                        {scanStatusHint || "Memverifikasi QR..."}
                      </span>
                    </div>
                  )}

                  {/* Camera Controls */}
                  <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between z-20 pointer-events-auto">
                    {torchSupported ? (
                      <button
                        type="button"
                        onClick={toggleTorch}
                        className={`p-2.5 rounded-full backdrop-blur-xl border border-white/30 transition-all ${
                          torchOn
                            ? "bg-amber-400 text-black shadow-lg scale-105"
                            : "bg-black/40 hover:bg-black/60 text-white"
                        }`}
                        title={torchOn ? "Matikan Flash" : "Nyalakan Flash"}
                      >
                        <Zap className="w-3.5 h-3.5 fill-current" />
                      </button>
                    ) : (
                      <div className="w-7 h-7" />
                    )}

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={switchCamera}
                        className="p-2.5 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-xl border border-white/30 transition-all hover:scale-105"
                        title="Ganti Kamera Depan/Belakang"
                      >
                        <SwitchCamera className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                /* Camera Inactive / Permission Prompt */
                <div className="flex flex-col items-center justify-center p-6 text-center space-y-3 z-20 pointer-events-auto">
                  <div className="w-14 h-14 rounded-2xl bg-white/10 text-white flex items-center justify-center shadow-inner border border-white/10">
                    <Camera className="w-7 h-7 stroke-[1.5]" />
                  </div>
                  <button
                    type="button"
                    onClick={() => startCamera("environment")}
                    disabled={cameraStarting}
                    className="liquid-glass-btn-primary text-xs px-4 py-2 font-medium flex items-center gap-1.5 z-20 pointer-events-auto rounded-xl"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>{cameraStarting ? "Menghubungkan Kamera..." : "Aktifkan Kamera"}</span>
                  </button>
                  <span className="text-[10px] text-neutral-400 pointer-events-none select-none">
                    Kamera memindai QR secara otomatis
                  </span>
                </div>
              )}
            </div>

            {/* Viewfinder Caption */}
            <div className="space-y-1">
              <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 block">
                {isCompleted
                  ? "Presensi Hari Ini Selesai"
                  : isCheckedIn
                  ? "Absen Pulang (Check-Out)"
                  : "Absen Masuk (Check-In)"}
              </span>
              <p className="text-[11px] text-neutral-500 max-w-xs mx-auto">
                {isCompleted
                  ? "Presensi masuk dan pulang untuk shift hari ini sudah lengkap."
                  : "Dekatkan kamera ke layar terminal QR di kantor. Pemindaian akan berjalan otomatis tanpa perlu menekan tombol."}
              </p>
            </div>

            {/* GPS Status & Diagnostics */}
            {gpsCoords ? (
              <div className="flex items-center justify-between p-3 rounded-2xl bg-white/30 dark:bg-black/20 backdrop-blur-md border border-white/40 dark:border-white/10 text-xs shadow-inner">
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-neutral-500" />
                  <span className="text-neutral-500 text-[11px]">Lokasi GPS:</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="liquid-glass-pill px-3 py-1 text-[10px] font-mono font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 inline-flex items-center gap-1.5 shadow-sm">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    <span>Terkunci (+/-{gpsCoords.accuracy}m)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => triggerNativeGpsPrompt()}
                    title="Perbarui Koordinat GPS"
                    className="p-1.5 hover:bg-white/50 dark:hover:bg-white/10 rounded-full transition-colors"
                  >
                    <RotateCcw className="w-3 h-3 text-neutral-400" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs space-y-2.5 text-left">
                <div className="flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5 flex-1">
                    <span className="font-semibold text-xs text-[var(--text-primary)] block">
                      Akses Lokasi Kantor Diperlukan
                    </span>
                    <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                      {gpsError ||
                        "Sistem presensi membutuhkan koordinat lokasi perangkat Anda untuk memastikan kehadiran di area kantor."}
                    </p>
                  </div>
                </div>
                <div className="pt-1 border-t border-amber-500/15">
                  <button
                    type="button"
                    onClick={() => triggerNativeGpsPrompt()}
                    disabled={gpsLoading}
                    className="hig-button-primary text-[11px] px-3.5 py-1.5 font-medium"
                  >
                    {gpsLoading ? "Mengunci Koordinat..." : "Izinkan Akses Lokasi"}
                  </button>
                </div>
              </div>
            )}

            {/* Camera Error Alert */}
            {cameraError && (
              <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-xs text-left space-y-2">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-[var(--system-red)] shrink-0 mt-0.5" />
                  <div className="space-y-0.5 flex-1">
                    <span className="font-semibold text-xs text-[var(--text-primary)] block">
                      Akses Kamera Terhambat
                    </span>
                    <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                      {cameraError}
                    </p>
                  </div>
                </div>
                <div className="pt-1 border-t border-red-500/15">
                  <button
                    type="button"
                    onClick={() => startCamera("environment")}
                    className="hig-button-secondary text-[11px] px-3 py-1.5 font-medium"
                  >
                    Buka Kamera Ulang
                  </button>
                </div>
              </div>
            )}

            {/* Live Scan Error Alert */}
            {error && (
              <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 text-xs text-left flex items-start gap-2.5 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                <div className="space-y-1 flex-1">
                  <span className="font-semibold text-xs block text-red-900 dark:text-red-200">
                    Gagal Melakukan Presensi
                  </span>
                  <p className="text-[11px] text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    {error}
                  </p>
                  <span className="text-[10px] text-neutral-400 block pt-0.5">
                    Kamera tetap aktif. Silakan arahkan kembali ke QR yang valid di layar.
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Early Clock-Out Warning Modal with 5s Mandatory Countdown */}
          {earlyModalOpen && (
            <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
              <div className="hig-card-elevated max-w-sm w-full p-5 space-y-4 shadow-xl border border-[var(--separator-subtle)] text-left">
                <div className="flex items-center gap-2.5 pb-2 border-b border-[var(--separator-subtle)]">
                  <div className="w-8 h-8 rounded-full bg-amber-500/15 text-amber-600 flex items-center justify-center shrink-0">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                      Konfirmasi Pulang Lebih Awal
                    </h3>
                    <span className="text-[10px] text-[var(--text-secondary)] block">
                      Jadwal shift selesai pukul {earlyScheduledEnd} WIB
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                  <div className="font-medium text-[11px]">
                    Anda mencoba check-out {earlyMinutes} menit lebih awal dari jadwal resmi.
                  </div>
                  <p className="text-[10px] leading-relaxed text-[var(--text-secondary)]">
                    Kepulangan sebelum shift selesai wajib mencantumkan alasan yang valid dan persetujuan atasan/pemilik.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-[var(--text-primary)] block">
                    Alasan Pulang Awal <span className="text-[var(--system-red)]">*</span>
                  </label>
                  <textarea
                    value={earlyReason}
                    onChange={(e) => setEarlyReason(e.target.value)}
                    placeholder="Tuliskan alasan jelas (misal: keperluan mendesak keluarga, sakit, dll.)"
                    rows={3}
                    className="w-full text-xs p-2.5 rounded-xl border border-[var(--separator-subtle)] bg-[var(--surface-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                  />
                </div>

                <label className="flex items-start gap-2 cursor-pointer select-none text-xs text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={earlyApproved}
                    onChange={(e) => setEarlyApproved(e.target.checked)}
                    className="mt-0.5 rounded border-[var(--separator-subtle)] text-blue-600 focus:ring-0"
                  />
                  <span className="text-[11px] leading-tight">
                    Saya menyatakan sudah memperoleh izin langsung dari Owner atau Supervisor.
                  </span>
                </label>

                <div className="pt-2 border-t border-[var(--separator-subtle)] flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEarlyModalOpen(false);
                      setEarlyToken("");
                      isSubmittingRef.current = false;
                      setLoading(false);
                    }}
                    disabled={earlySubmitting}
                    className="hig-button-secondary flex-1 py-2 text-xs"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (earlyCountdown > 0 || !earlyReason.trim()) return;
                      setEarlySubmitting(true);
                      setEarlyModalOpen(false);
                      await submitToken(earlyToken, {
                        forceEarlyCheckout: true,
                        earlyCheckoutReason: earlyReason.trim(),
                        earlyCheckoutApproved: earlyApproved,
                      });
                      setEarlySubmitting(false);
                    }}
                    disabled={earlyCountdown > 0 || !earlyReason.trim() || earlySubmitting}
                    className="hig-button-primary flex-1 py-2 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {earlyCountdown > 0
                      ? `Jeda verifikasi (${earlyCountdown}d)`
                      : "Konfirmasi Pulang"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Result Screen */
        <div className="space-y-4 animate-in fade-in zoom-in-95">
          {scanResult.action === "CHECK_IN" ? (
            /* Check-in Confirmation */
            <div className="hig-card p-6 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6 stroke-[2]" />
              </div>

              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  Check-In Berhasil
                </span>
                <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mt-2">
                  Shift Session Aktif
                </h2>
                <p className="text-xs text-neutral-500 mt-1">{scanResult.message}</p>
              </div>

              <div className="bg-neutral-50 dark:bg-neutral-900 p-3.5 rounded-xl text-left text-xs space-y-2 border border-neutral-200 dark:border-neutral-800">
                <div className="flex justify-between items-center">
                  <span className="text-neutral-500">Waktu Masuk:</span>
                  <span className="font-mono font-medium text-neutral-900 dark:text-neutral-100">
                    {scanResult.attendance.actualCheckIn}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-neutral-500">Gaji Harian:</span>
                  <span className="font-medium text-neutral-900 dark:text-neutral-100 tabular-nums">
                    {formatIDR(scanResult.attendance.dailySalary)}
                  </span>
                </div>
                {scanResult.attendance.isLate && (
                  <div className="flex justify-between items-center text-red-600 dark:text-red-400 font-medium">
                    <span>Potongan Keterlambatan:</span>
                    <span className="tabular-nums">
                      -{formatIDR(scanResult.attendance.pendingDeduction)}
                    </span>
                  </div>
                )}
              </div>

              <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 text-xs text-blue-900 dark:text-blue-200 text-left">
                <span className="font-semibold block text-[11px]">Langkah Selanjutnya:</span>
                <p className="text-[11px] text-blue-800 dark:text-blue-300 mt-0.5">
                  Saat selesai jam kerja nanti, buka kembali halaman ini untuk scan QR Absen Pulang (Check-Out) dan mencairkan slip gaji harian Anda.
                </p>
              </div>

              <button
                type="button"
                onClick={() => router.push("/employee")}
                className="hig-button-primary w-full py-2.5 text-xs font-medium"
              >
                Kembali ke Dashboard
              </button>
            </div>
          ) : (
            /* Check-Out Confirmation: Transparent Apple Pay Style Payslip Receipt */
            <div className="space-y-4">
              <div className="hig-card p-5 space-y-3.5 shadow-sm border border-neutral-200 dark:border-neutral-800">
                <div className="text-center pb-3 border-b border-neutral-200 dark:border-neutral-800">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 block">
                    Shift Selesai • Slip Gaji Harian
                  </span>
                  <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 mt-0.5">
                    {scanResult.payslip.shiftName}
                  </h2>
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 mt-1.5 inline-block">
                    {scanResult.payslip.status}
                  </span>
                </div>

                <div className="text-xs space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-500">Gaji Harian Kotor</span>
                    <span className="font-medium text-neutral-900 dark:text-neutral-100 tabular-nums">
                      {formatIDR(scanResult.payslip.dailySalary)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-neutral-500">
                    <span>Jadwal Masuk</span>
                    <span className="font-mono text-neutral-700 dark:text-neutral-300">
                      {scanResult.payslip.scheduledCheckIn.split(", ")[1] ||
                        scanResult.payslip.scheduledCheckIn}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-neutral-500">
                    <span>Waktu Masuk Riil</span>
                    <span className="font-mono text-neutral-700 dark:text-neutral-300">
                      {scanResult.payslip.actualCheckIn.split(", ")[1] ||
                        scanResult.payslip.actualCheckIn}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-neutral-500">Durasi Keterlambatan</span>
                    <span
                      className={
                        scanResult.payslip.lateDurationMinutes > 0
                          ? "font-medium text-red-600 dark:text-red-400"
                          : "font-medium text-emerald-600 dark:text-emerald-400"
                      }
                    >
                      {scanResult.payslip.lateDurationMinutes > 0
                        ? `${scanResult.payslip.lateDurationMinutes} menit`
                        : "0 menit (Tepat Waktu)"}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-neutral-500">
                    <span>Kebijakan Potongan</span>
                    <span className="text-neutral-800 dark:text-neutral-200">
                      {scanResult.payslip.deductionPolicy}
                    </span>
                  </div>

                  {scanResult.payslip.lateDeduction > 0 && (
                    <div className="flex justify-between items-center text-red-600 dark:text-red-400 font-medium pt-1.5 border-t border-neutral-100 dark:border-neutral-800">
                      <span>Potongan Keterlambatan</span>
                      <span className="tabular-nums">
                        -{formatIDR(scanResult.payslip.lateDeduction)}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between items-baseline pt-3 border-t border-neutral-200 dark:border-neutral-800">
                    <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
                      Gaji Harian Bersih
                    </span>
                    <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {formatIDR(scanResult.payslip.netDailyEarnings)}
                    </span>
                  </div>
                </div>

                <div className="text-[10px] text-neutral-400 text-center pt-2 border-t border-neutral-100 dark:border-neutral-800">
                  {scanResult.payslip.policyDescription}
                </div>
              </div>

              <button
                type="button"
                onClick={() => router.push("/employee")}
                className="hig-button-primary w-full py-2.5 text-xs font-medium"
              >
                Kembali ke Dashboard
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}