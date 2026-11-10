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
  ChevronDown,
  ChevronUp,
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
  const [shiftInfo, setShiftInfo] = useState<DashboardShiftInfo | null>(null);
  const [loadingShift, setLoadingShift] = useState(true);

  // Scan & Processing State
  const [loading, setLoading] = useState(false);
  const [scanningPulse, setScanningPulse] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<any | null>(null);

  // Manual / Dev Fallback State (Collapsed by default)
  const [showManualSection, setShowManualSection] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [isDev, setIsDev] = useState(false);

  // Geolocation Anti-Cheat Verification State
  const [gpsCoords, setGpsCoords] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Camera Stream & Live Scanner State
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isDetectingRef = useRef(false);

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
      }
    } catch {
      // Non-fatal, scanner can still function
    } finally {
      setLoadingShift(false);
    }
  };

  // 2. Direct Native Geolocation Trigger (Synchronous browser call)
  const triggerNativeGpsPrompt = () => {
    if (typeof window === "undefined" || !("geolocation" in window.navigator)) {
      setGpsError("API Geolocation tidak ditemukan di browser ini.");
      return;
    }

    setGpsLoading(true);
    setGpsError(null);

    window.navigator.geolocation.getCurrentPosition(
      (position) => {
        setGpsLoading(false);
        setGpsError(null);
        setGpsCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy),
        });
      },
      (error) => {
        setGpsLoading(false);
        const rawReason = `[CODE ${error.code}] ${error.message || "Unknown geolocation error"}`;
        if (error.code === 1) {
          setGpsError(
            `${rawReason} — Izin lokasi belum aktif. Klik ikon Gembok di kiri URL bar browser -> Izinkan Lokasi (Precise Location).`
          );
        } else if (error.code === 2) {
          setGpsError(`${rawReason} — Sinyal GPS satelit tidak terdeteksi.`);
        } else if (error.code === 3) {
          setGpsError(`${rawReason} — Timeout mencari koordinat GPS.`);
        } else {
          setGpsError(rawReason);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  };

  // Local Testing Fallback
  const handleUseOfficeGpsLocal = async () => {
    try {
      const res = await fetch("/api/owner/office-config");
      const data = await res.json();
      if (data.config && data.config.latitude && data.config.longitude) {
        setGpsCoords({
          latitude: data.config.latitude,
          longitude: data.config.longitude,
          accuracy: 10,
        });
        setGpsLoading(false);
        setGpsError(null);
        return;
      }
    } catch {}

    setGpsCoords({
      latitude: -6.928715,
      longitude: 109.655502,
      accuracy: 10,
    });
    setGpsLoading(false);
    setGpsError(null);
  };

  // Mount initialization: Load Shift Status, GPS, and Start Camera
  useEffect(() => {
    const isDevelopment =
      process.env.NODE_ENV === "development" ||
      (typeof window !== "undefined" &&
        (window.location.hostname === "localhost" ||
          window.location.hostname === "127.0.0.1"));
    setIsDev(isDevelopment);

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
    isDetectingRef.current = false;
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
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: targetFacing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (constraintErr: any) {
        console.warn("Retrying with generic video constraints:", constraintErr);
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      streamRef.current = stream;

      if (videoRef.current) {
        const video = videoRef.current;
        video.srcObject = stream;
        video.onloadedmetadata = async () => {
          try {
            await video.play();
          } catch (playErr) {
            console.warn("Video play error:", playErr);
          }
          startScanningLoop();
        };

        await video.play().catch(() => {});
        startScanningLoop();
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
          "Izin kamera belum diberikan. Klik ikon Gembok di address bar browser untuk mengizinkan kamera."
        );
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setCameraError("Kamera tidak ditemukan pada perangkat ini.");
      } else {
        setCameraError(err.message || "Gagal membuka kamera.");
      }
      setCameraActive(false);
    } finally {
      setCameraStarting(false);
    }
  };

  // Continuous Auto-Scanning Engine
  const startScanningLoop = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    const scanFrame = async () => {
      // If currently submitting or camera stopped, wait for next frame
      if (!videoRef.current || !streamRef.current || isDetectingRef.current) {
        animFrameRef.current = requestAnimationFrame(scanFrame);
        return;
      }

      const video = videoRef.current;

      if (
        video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA &&
        video.videoWidth > 0 &&
        video.videoHeight > 0
      ) {
        let foundRawToken: string | null = null;

        // 1. Try native BarcodeDetector if supported (very fast on Android/Chrome)
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

        // 2. Fallback to jsQR canvas scanner
        if (!foundRawToken && canvasRef.current) {
          try {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (ctx) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "dontInvert",
              });
              if (code && code.data) {
                foundRawToken = code.data.trim();
              }
            }
          } catch {}
        }

        // 3. Process detected QR code automatically
        if (foundRawToken && foundRawToken.length > 3) {
          // Pause scanner while verifying this frame
          isDetectingRef.current = true;
          setScanningPulse(true);

          // Haptic tick on QR acquisition
          if (typeof navigator !== "undefined" && navigator.vibrate) {
            navigator.vibrate(60);
          }

          // Submit automatically without stopping video stream
          await submitToken(foundRawToken);
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
    const trimmed = (raw || "").trim();
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

  const submitToken = async (tokenToSubmit: string) => {
    const cleanToken = extractCleanToken(tokenToSubmit);

    if (!gpsCoords) {
      setGpsError(
        isDev
          ? "Koordinat GPS belum terkunci. Klik tombol 'Gunakan Lokasi Kantor (Mode Tes Lokal)' di bawah."
          : "Koordinat GPS diperlukan untuk presensi. Klik 'Minta Izin Lokasi' di bawah."
      );
      setLoading(false);
      setScanningPulse(false);
      // Re-enable scanner loop after 2 seconds
      setTimeout(() => {
        isDetectingRef.current = false;
      }, 2000);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const dev = await getClientDeviceIdentity();
      const res = await fetch("/api/qr/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: cleanToken,
          deviceFingerprint: dev.deviceFingerprint,
          latitude: gpsCoords.latitude,
          longitude: gpsCoords.longitude,
          accuracy: gpsCoords.accuracy,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
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
        }
        throw new Error(errorMsg);
      }

      // Success: Play confirmation haptic and stop camera
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }
      stopCamera();
      setScanResult(data);
      loadShiftStatus();
    } catch (err: any) {
      // Error: Keep camera stream alive, show error, and re-arm after 2.5s
      setError(err.message || "Gagal memproses presensi.");
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
      }
      setTimeout(() => {
        isDetectingRef.current = false;
        setScanningPulse(false);
      }, 2500);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickScanActiveQR = async () => {
    setError(null);
    setLoading(true);

    try {
      const qrRes = await fetch("/api/qr/active");
      const qrData = await qrRes.json();
      if (!qrData.token) {
        throw new Error("Tidak dapat mengambil QR aktif dari terminal.");
      }
      await submitToken(qrData.token);
    } catch (err: any) {
      setError(err.message || "Failed to scan QR");
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
          className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 flex items-center gap-1.5 font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Dashboard</span>
        </Link>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded font-semibold bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
            {isCheckedIn ? "MODE: ABSEN PULANG" : isCompleted ? "SHIFT SELESAI" : "MODE: ABSEN MASUK"}
          </span>
        </div>
      </div>

      {!scanResult ? (
        <div className="space-y-4">
          {/* Shift State Header Banner */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                  isCheckedIn
                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                    : isCompleted
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                    : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                }`}
              >
                <Clock className="w-4 h-4" />
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
          <div className="apple-card p-5 text-center space-y-4">
            {/* Viewfinder Viewport */}
            <div
              className={`relative w-full max-w-[300px] aspect-square mx-auto rounded-3xl overflow-hidden bg-neutral-950 border transition-all duration-300 shadow-inner flex items-center justify-center ${
                scanningPulse
                  ? "border-emerald-500 ring-4 ring-emerald-500/20 shadow-emerald-500/30"
                  : error
                  ? "border-red-500/80 ring-2 ring-red-500/20"
                  : "border-neutral-200 dark:border-neutral-800"
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
                  {/* Decorative Overlays */}
                  <div className="absolute inset-0 pointer-events-none select-none z-10">
                    <div className="absolute inset-0 border-[26px] border-black/40" />

                    {/* Viewfinder Target Frame */}
                    <div className="absolute inset-7 rounded-2xl border border-white/50">
                      {/* Corner Markers */}
                      <div className="absolute -top-1 -left-1 w-6 h-6 border-t-[3.5px] border-l-[3.5px] border-blue-500 rounded-tl-sm pointer-events-none" />
                      <div className="absolute -top-1 -right-1 w-6 h-6 border-t-[3.5px] border-r-[3.5px] border-blue-500 rounded-tr-sm pointer-events-none" />
                      <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-[3.5px] border-l-[3.5px] border-blue-500 rounded-bl-sm pointer-events-none" />
                      <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-[3.5px] border-r-[3.5px] border-blue-500 rounded-tr-sm pointer-events-none" />

                      {/* Animated Laser Scanning Line */}
                      <div className="absolute left-2 right-2 top-1/2 h-0.5 bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.9)] animate-pulse pointer-events-none" />
                    </div>
                  </div>

                  {/* Processing Status Overlay */}
                  {loading && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-30 flex flex-col items-center justify-center gap-2 text-white">
                      <div className="w-9 h-9 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span className="text-xs font-medium tracking-wide">Memverifikasi QR...</span>
                    </div>
                  )}

                  {/* Camera Controls */}
                  <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between z-20 pointer-events-auto">
                    {torchSupported ? (
                      <button
                        type="button"
                        onClick={toggleTorch}
                        className={`p-2 rounded-full backdrop-blur-md transition-colors ${
                          torchOn
                            ? "bg-amber-400 text-black shadow-md"
                            : "bg-black/50 hover:bg-black/70 text-white"
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
                        className="p-2 rounded-full bg-black/50 hover:bg-black/70 text-white backdrop-blur-md transition-colors"
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
                  <div className="w-14 h-14 rounded-2xl bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 flex items-center justify-center shadow-sm">
                    <Camera className="w-7 h-7 stroke-[1.5]" />
                  </div>
                  <button
                    type="button"
                    onClick={() => startCamera("environment")}
                    disabled={cameraStarting}
                    className="apple-btn-primary text-xs px-4 py-2 font-medium flex items-center gap-1.5 z-20 pointer-events-auto"
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
                {isCheckedIn ? "Absen Pulang (Check-Out)" : "Absen Masuk (Check-In)"}
              </span>
              <p className="text-[11px] text-neutral-500 max-w-xs mx-auto">
                Dekatkan kamera ke layar terminal QR di kantor. Pemindaian akan berjalan otomatis tanpa perlu menekan tombol.
              </p>
            </div>

            {/* GPS Diagnostic & Status */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-xs">
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-neutral-500" />
                <span className="text-neutral-500 text-[11px]">GPS Location:</span>
              </div>

              {gpsCoords ? (
                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    <span>LOKASI DIDAPAT: +/-{gpsCoords.accuracy}m</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => triggerNativeGpsPrompt()}
                    title="Refresh GPS"
                    className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded transition-colors"
                  >
                    <RotateCcw className="w-3 h-3 text-neutral-400" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => triggerNativeGpsPrompt()}
                  disabled={gpsLoading}
                  className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-medium inline-flex items-center gap-1 shadow-sm transition-all"
                >
                  <span>{gpsLoading ? "Mengunci GPS..." : "Aktifkan Izin GPS"}</span>
                </button>
              )}
            </div>

            {/* GPS Error Alert */}
            {gpsError && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 text-amber-900 dark:text-amber-200 text-xs space-y-2 text-left">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="leading-relaxed text-[11px]">{gpsError}</p>
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-amber-200/60 dark:border-amber-800/60">
                  <button
                    type="button"
                    onClick={() => triggerNativeGpsPrompt()}
                    className="apple-btn-secondary text-[11px] px-3 py-1 font-medium bg-white dark:bg-neutral-800"
                  >
                    Coba Lagi
                  </button>
                  <button
                    type="button"
                    onClick={handleUseOfficeGpsLocal}
                    className="apple-btn-secondary text-[11px] px-2.5 py-1 font-medium bg-white dark:bg-neutral-800 text-neutral-600"
                  >
                    Gunakan Lokasi Kantor (Mode Tes)
                  </button>
                </div>
              </div>
            )}

            {/* Camera Error Alert */}
            {cameraError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 text-xs text-left flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                <div className="space-y-1">
                  <p className="text-[11px] leading-relaxed">{cameraError}</p>
                  <button
                    type="button"
                    onClick={() => startCamera("environment")}
                    className="apple-btn-secondary text-[11px] px-2.5 py-1 font-medium bg-white dark:bg-neutral-800"
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

          {/* Collapsible Manual Testing / Dev Section */}
          <div className="border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden bg-white dark:bg-neutral-900">
            <button
              type="button"
              onClick={() => setShowManualSection(!showManualSection)}
              className="w-full p-3 text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 flex items-center justify-between transition-colors"
            >
              <span className="text-[11px] font-medium">Opsi Pengujian / Manual Token (Khusus Demo)</span>
              {showManualSection ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showManualSection && (
              <div className="p-4 pt-1 border-t border-neutral-100 dark:border-neutral-800 space-y-3">
                <button
                  type="button"
                  onClick={handleQuickScanActiveQR}
                  disabled={loading || !gpsCoords}
                  className="apple-btn-secondary w-full py-2.5 text-xs font-medium flex items-center justify-center gap-2"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  <span>Ambil QR Aktif Terminal Otomatis (1-Tap Test)</span>
                </button>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="Masukkan token manual..."
                    className="flex-1 apple-input text-xs font-mono py-2"
                  />
                  <button
                    type="button"
                    onClick={() => submitToken(tokenInput)}
                    disabled={loading || !tokenInput.trim() || !gpsCoords}
                    className="apple-btn-primary text-xs px-4 py-2 font-medium"
                  >
                    Submit
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Result Screen */
        <div className="space-y-4 animate-in fade-in zoom-in-95">
          {scanResult.action === "CHECK_IN" ? (
            /* Check-in Confirmation */
            <div className="apple-card p-6 text-center space-y-4">
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
                className="apple-btn-primary w-full py-2.5 text-xs font-medium"
              >
                Kembali ke Dashboard
              </button>
            </div>
          ) : (
            /* Check-Out Confirmation: Transparent Apple Pay Style Payslip Receipt */
            <div className="space-y-4">
              <div className="apple-card p-5 space-y-3.5 shadow-sm border border-neutral-200 dark:border-neutral-800">
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
                className="apple-btn-primary w-full py-2.5 text-xs font-medium"
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