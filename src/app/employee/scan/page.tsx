"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  QrCode,
  Camera,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Zap,
  ShieldCheck,
  SwitchCamera,
  X,
  RotateCcw,
  MapPin,
  Crosshair,
} from "lucide-react";
import Link from "next/link";
import { formatIDR } from "@/lib/utils";
import { getClientDeviceIdentity } from "@/lib/device-client";

export default function EmployeeScanPage() {
  const router = useRouter();
  const [tokenInput, setTokenInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<any | null>(null);

  // Geolocation Anti-Cheat Verification State
  const [gpsCoords, setGpsCoords] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"idle" | "acquiring" | "ready" | "denied" | "error">("idle");
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [isDev, setIsDev] = useState(false);

  // Camera Stream & Live Scanner State
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isDetectingRef = useRef(false);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  const startGpsWatch = () => {
    const isDevelopment =
      process.env.NODE_ENV === "development" ||
      (typeof window !== "undefined" &&
        (window.location.hostname === "localhost" ||
          window.location.hostname === "127.0.0.1"));

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsStatus("error");
      setGpsError(
        isDevelopment
          ? "[GPS-UNAVAILABLE] Pastikan Location Services macOS dan Wi-Fi aktif. Pada mode development, gunakan koordinat mock jika hardware tidak memiliki GPS."
          : "Geolocation is not supported by your browser."
      );
      return;
    }

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    setGpsStatus("acquiring");
    setGpsError(null);

    // Continuous watchPosition for precision convergence (improves accuracy as satellites lock)
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsCoords((prev) => {
          // Keep the fix with best accuracy
          if (!prev || pos.coords.accuracy <= prev.accuracy) {
            return {
              latitude: Number(pos.coords.latitude.toFixed(6)),
              longitude: Number(pos.coords.longitude.toFixed(6)),
              accuracy: Math.round(pos.coords.accuracy),
            };
          }
          return prev;
        });
        setGpsStatus("ready");
        setGpsError(null);
      },
      (err) => {
        setGpsCoords((current) => {
          if (current) return current;
          if (err.code === 1) {
            setGpsStatus("denied");
            setGpsError(
              isDevelopment
                ? "[GPS-UNAVAILABLE] Pastikan Location Services macOS dan Wi-Fi aktif. Pada mode development, gunakan koordinat mock jika hardware tidak memiliki GPS."
                : "Geolocation access is mandatory for attendance check-in. Please enable location permissions in your browser."
            );
          } else if (err.code === 3) {
            setGpsStatus("error");
            setGpsError("Waktu permintaan lokasi GPS habis (timeout). Pastikan Wi-Fi atau GPS aktif lalu coba lagi.");
          } else {
            setGpsStatus("error");
            setGpsError(err.message || "Failed to acquire GPS location.");
          }
          return null;
        });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const acquireGpsLocation = startGpsWatch;

  const handleUseMockGps = () => {
    setGpsCoords({
      latitude: -6.928715,
      longitude: 109.655502,
      accuracy: 10,
    });
    setGpsStatus("ready");
    setGpsError(null);
  };

  // Mount initialization: Acquire GPS & Environment detection
  useEffect(() => {
    setIsDev(
      process.env.NODE_ENV === "development" ||
        (typeof window !== "undefined" &&
          (window.location.hostname === "localhost" ||
            window.location.hostname === "127.0.0.1"))
    );
    startGpsWatch();
    return () => {
      stopCamera();
      if (watchIdRef.current !== null && typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
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

    // Stop existing stream if running
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setCameraError(
        "Kamera tidak didukung pada browser ini. Silakan gunakan tombol 1-Tap Scan atau masukkan token secara manual."
      );
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
        console.warn(
          "Primary camera constraints failed (OverconstrainedError/fallback triggered), retrying with generic constraints:",
          constraintErr
        );
        // Fallback for MacBooks, laptops, or webcams without environment lens or with strict constraint limits
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      setCameraActive(true);
      setFacingMode(targetFacing);

      // Check torch capabilities
      const track = stream.getVideoTracks()[0];
      const capabilities: any = track?.getCapabilities ? track.getCapabilities() : {};
      setTorchSupported(Boolean(capabilities?.torch));

      // Launch barcode detector frame loop if available
      initBarcodeDetection();
    } catch (err: any) {
      console.error("Camera access error:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setCameraError(
          "Izin kamera ditolak. Izinkan akses kamera di pengaturan browser Anda atau gunakan tombol 1-Tap Scan di bawah."
        );
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setCameraError(
          "Kamera fisik tidak ditemukan pada perangkat ini. Gunakan 1-Tap Scan atau masukkan token manual."
        );
      } else {
        setCameraError(
          err.message || "Gagal menginisialisasi kamera. Gunakan tombol 1-Tap Scan di bawah."
        );
      }
      setCameraActive(false);
    } finally {
      setCameraStarting(false);
    }
  };

  const initBarcodeDetection = () => {
    if (typeof window === "undefined" || !("BarcodeDetector" in window)) {
      return;
    }

    try {
      const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
      const detect = async () => {
        if (!videoRef.current || !streamRef.current || isDetectingRef.current) return;
        if (videoRef.current.readyState >= 2) {
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0 && barcodes[0]?.rawValue) {
              const raw = barcodes[0].rawValue.trim();
              if (raw.length > 3) {
                isDetectingRef.current = true;
                stopCamera();
                await submitToken(raw);
                return;
              }
            }
          } catch {
            // Frame pass dropped or non-critical error, continue loop
          }
        }
        animFrameRef.current = requestAnimationFrame(detect);
      };
      animFrameRef.current = requestAnimationFrame(detect);
    } catch {
      // BarcodeDetector initialization fallback
    }
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

  const handleQuickScanActiveQR = async () => {
    setError(null);
    setLoading(true);

    try {
      const qrRes = await fetch("/api/qr/active");
      const qrData = await qrRes.json();
      if (!qrData.token) {
        throw new Error(
          "Could not fetch active workplace QR. Please ensure the terminal is running."
        );
      }

      await submitToken(qrData.token);
    } catch (err: any) {
      setError(err.message || "Failed to scan QR");
      setLoading(false);
    }
  };

  const submitToken = async (tokenToSubmit: string) => {
    if (!gpsCoords) {
      setGpsStatus("error");
      setGpsError(
        isDev
          ? "[GPS-UNAVAILABLE] Pastikan Location Services macOS dan Wi-Fi aktif. Pada mode development, gunakan koordinat mock jika hardware tidak memiliki GPS."
          : "Valid GPS coordinates are required for attendance check-in. Please enable location permissions."
      );
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
          token: tokenToSubmit.trim(),
          deviceFingerprint: dev.deviceFingerprint,
          latitude: gpsCoords.latitude,
          longitude: gpsCoords.longitude,
          accuracy: gpsCoords.accuracy,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Attendance scan failed");
      }

      setScanResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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
        <span className="text-[11px] font-semibold uppercase text-neutral-400 tracking-wider">
          Scanner
        </span>
      </div>

      {!scanResult ? (
        <div className="space-y-4">
          {/* Apple Style Viewfinder Card */}
          <div className="apple-card p-6 text-center space-y-4">
            {/* Viewfinder Viewport */}
            <div className="relative w-full max-w-[280px] aspect-square mx-auto rounded-3xl overflow-hidden bg-neutral-950 border border-neutral-200 dark:border-neutral-800 shadow-inner flex items-center justify-center">
              {cameraActive ? (
                <>
                  {/* Live Video Feed */}
                  <video
                    ref={videoRef}
                    playsInline
                    autoPlay
                    muted
                    className="w-full h-full object-cover"
                  />

                  {/* 1. DECORATIVE OVERLAYS - STRICTLY pointer-events-none select-none */}
                  <div className="absolute inset-0 pointer-events-none select-none z-10">
                    {/* Dark Border Frame Cutout */}
                    <div className="absolute inset-0 border-[28px] border-black/40" />

                    {/* Viewfinder Alignment Box */}
                    <div className="absolute inset-7 rounded-2xl border-2 border-white/60">
                      {/* Corner Target Markers */}
                      <div className="absolute -top-1 -left-1 w-5 h-5 border-t-[3px] border-l-[3px] border-blue-500 rounded-tl-sm pointer-events-none" />
                      <div className="absolute -top-1 -right-1 w-5 h-5 border-t-[3px] border-r-[3px] border-blue-500 rounded-tr-sm pointer-events-none" />
                      <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-[3px] border-l-[3px] border-blue-500 rounded-bl-sm pointer-events-none" />
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-[3px] border-r-[3px] border-blue-500 rounded-br-sm pointer-events-none" />

                      {/* Laser Alignment Guide */}
                      <div className="absolute left-2 right-2 top-1/2 h-0.5 bg-blue-500/80 shadow-[0_0_8px_rgba(59,130,246,0.9)] animate-pulse pointer-events-none" />
                    </div>
                  </div>

                  {/* 2. INTERACTIVE CONTROLS OVER VIDEO - STRICTLY pointer-events-auto z-20 */}
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
                        title="Ganti Kamera"
                      >
                        <SwitchCamera className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={stopCamera}
                        className="p-2 rounded-full bg-black/50 hover:bg-black/70 text-white backdrop-blur-md transition-colors"
                        title="Tutup Kamera"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                /* Camera Inactive Placeholder */
                <div className="flex flex-col items-center justify-center p-6 text-center space-y-3 z-20 pointer-events-auto">
                  <div className="w-14 h-14 rounded-2xl bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 flex items-center justify-center shadow-sm">
                    <Camera className="w-7 h-7 stroke-[1.5]" />
                  </div>
                  <button
                    type="button"
                    onClick={() => startCamera("environment")}
                    disabled={cameraStarting}
                    className="apple-btn-secondary text-xs px-3.5 py-1.5 font-medium flex items-center gap-1.5 z-20 pointer-events-auto"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>{cameraStarting ? "Membuka Kamera..." : "Aktifkan Kamera"}</span>
                  </button>
                  <span className="text-[10px] text-neutral-400 pointer-events-none select-none">
                    Arahkan ke QR terminal kehadiran
                  </span>
                </div>
              )}
            </div>

            <div>
              <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                Attendance Scanner
              </h2>
              <p className="text-xs text-neutral-500 max-w-xs mx-auto mt-1">
                Scan the dynamic 15-second QR on the workplace terminal to record your check-in or
                check-out.
              </p>
            </div>

            {/* Geolocation Anti-Cheat Verification Status */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-xs">
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-neutral-500" />
                <span className="text-neutral-600 dark:text-neutral-400 font-medium">GPS Location:</span>
              </div>
              {gpsStatus === "acquiring" && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                  <Crosshair className="w-3 h-3 animate-spin text-blue-500" />
                  <span>[ACQUIRING GPS...]</span>
                </span>
              )}
              {gpsStatus === "ready" && gpsCoords && (
                <div className="flex items-center gap-1.5">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${
                      gpsCoords.accuracy <= 25
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                        : gpsCoords.accuracy <= 80
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                        : "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                    }`}
                  >
                    {gpsCoords.accuracy <= 25
                      ? "[GPS-PRESISI]"
                      : gpsCoords.accuracy <= 80
                      ? "[GPS-ACQUIRED]"
                      : "[GPS-CALIBRATING]"}
                  </span>
                  <span className="text-[11px] text-neutral-500 tabular-nums font-mono">
                    ±{Math.round(gpsCoords.accuracy)}m
                  </span>
                  <button
                    type="button"
                    onClick={startGpsWatch}
                    title="Kalibrasi ulang satelit GPS"
                    className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                </div>
              )}
              {(gpsStatus === "denied" || gpsStatus === "error" || gpsStatus === "idle") && (
                <button
                  type="button"
                  onClick={startGpsWatch}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300 border border-red-200 dark:border-red-800 hover:bg-red-100"
                >
                  <Crosshair className="w-3 h-3" />
                  <span>Retry Location</span>
                </button>
              )}
            </div>

            {/* 1. Geolocation Permission / Timeout Error Card */}
            {(gpsStatus === "denied" || (gpsStatus === "error" && gpsError)) && (
              <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 text-xs flex items-start gap-2.5 text-left">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
                <div className="space-y-2 flex-1">
                  <div>
                    <span className="font-semibold block">
                      {gpsError?.includes("[GPS-UNAVAILABLE]")
                        ? "[GPS-UNAVAILABLE]"
                        : "[GPS REQUIRED]"}
                    </span>
                    <span className="leading-relaxed">
                      {gpsError?.replace("[GPS-UNAVAILABLE] ", "") ||
                        "Geolocation access is mandatory for attendance check-in. Please enable location permissions in your browser."}
                    </span>
                  </div>
                  {isDev && (
                    <div className="pt-2 border-t border-red-200 dark:border-red-800/60 flex items-center justify-between">
                      <span className="text-[11px] text-red-700 dark:text-red-400 font-mono">
                        Development Environment
                      </span>
                      <button
                        type="button"
                        onClick={handleUseMockGps}
                        className="apple-btn-secondary text-[11px] px-2.5 py-1 font-medium bg-white dark:bg-neutral-800 border-red-300 dark:border-red-700 hover:bg-neutral-50 dark:hover:bg-neutral-700"
                      >
                        Use Mock Office Coordinates
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 2. Camera Permission or Hardware Error Banner */}
            {cameraError && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2 text-left">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div>
                  <span className="font-semibold block">[CAMERA ERROR]</span>
                  <span className="leading-relaxed">{cameraError}</span>
                </div>
              </div>
            )}

            {/* 3. Attendance Scan & Challenge Error Banner */}
            {error && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 text-xs flex items-start gap-2 text-left">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
                <div>
                  <span className="font-semibold block">[SCAN ERROR]</span>
                  <span className="leading-relaxed">{error}</span>
                </div>
              </div>
            )}

            {/* Quick 1-Tap Scan Action - High Priority Interactive Fallback */}
            <button
              type="button"
              onClick={handleQuickScanActiveQR}
              disabled={loading || gpsStatus !== "ready"}
              className="apple-btn-primary w-full py-3 text-xs font-semibold flex items-center justify-center gap-2 relative z-20 pointer-events-auto disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Zap className="w-4 h-4 fill-white" />
              <span>{loading ? "Validating Challenge..." : "1-Tap Scan Workplace QR Code"}</span>
            </button>

            <div className="pt-2 text-[11px] text-neutral-400 border-t border-neutral-100 dark:border-neutral-800">
              Runs client Web Crypto authentication against the workplace terminal.
            </div>
          </div>

          {/* Manual Challenge Input */}
          <div className="apple-card p-4 space-y-2">
            <label className="block text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
              Or Enter 15-Second Challenge Token
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="qr_..."
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                className="apple-input text-xs font-mono relative z-20 pointer-events-auto"
              />
              <button
                type="button"
                onClick={() => submitToken(tokenInput)}
                disabled={loading || !tokenInput.trim() || gpsStatus !== "ready"}
                className="apple-btn-secondary text-xs px-4 relative z-20 pointer-events-auto font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Scan
              </button>
            </div>
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
                  Check-In Confirmed
                </span>
                <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mt-2">
                  Shift Session Active
                </h2>
                <p className="text-xs text-neutral-500 mt-1">{scanResult.message}</p>
              </div>

              <div className="bg-neutral-50 dark:bg-neutral-900 p-3.5 rounded-xl text-left text-xs space-y-2 border border-neutral-200 dark:border-neutral-800">
                <div className="flex justify-between items-center">
                  <span className="text-neutral-500">Actual Check-In:</span>
                  <span className="font-mono font-medium text-neutral-900 dark:text-neutral-100">
                    {scanResult.attendance.actualCheckIn}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-neutral-500">Base Daily Wage:</span>
                  <span className="font-medium text-neutral-900 dark:text-neutral-100 tabular-nums">
                    {formatIDR(scanResult.attendance.dailySalary)}
                  </span>
                </div>
                {scanResult.attendance.isLate && (
                  <div className="flex justify-between items-center text-red-600 dark:text-red-400 font-medium">
                    <span>Lateness Penalty:</span>
                    <span className="tabular-nums">
                      -{formatIDR(scanResult.attendance.pendingDeduction)}
                    </span>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => router.push("/employee")}
                className="apple-btn-primary w-full py-2.5 text-xs font-medium"
              >
                Go to Dashboard
              </button>
            </div>
          ) : (
            /* Check-Out Confirmation: Transparent Apple Pay Style Payslip Receipt */
            <div className="space-y-4">
              <div className="apple-card p-5 space-y-3.5 shadow-sm border border-neutral-200 dark:border-neutral-800">
                <div className="text-center pb-3 border-b border-neutral-200 dark:border-neutral-800">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 block">
                    Shift Completed • Daily Earnings Receipt
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
                    <span className="text-neutral-500">Daily Salary</span>
                    <span className="font-medium text-neutral-900 dark:text-neutral-100 tabular-nums">
                      {formatIDR(scanResult.payslip.dailySalary)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-neutral-500">
                    <span>Scheduled Check-In</span>
                    <span className="font-mono text-neutral-700 dark:text-neutral-300">
                      {scanResult.payslip.scheduledCheckIn.split(", ")[1] ||
                        scanResult.payslip.scheduledCheckIn}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-neutral-500">
                    <span>Actual Check-In</span>
                    <span className="font-mono text-neutral-700 dark:text-neutral-300">
                      {scanResult.payslip.actualCheckIn.split(", ")[1] ||
                        scanResult.payslip.actualCheckIn}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-neutral-500">Late Duration</span>
                    <span
                      className={
                        scanResult.payslip.lateDurationMinutes > 0
                          ? "font-medium text-red-600 dark:text-red-400"
                          : "font-medium text-emerald-600 dark:text-emerald-400"
                      }
                    >
                      {scanResult.payslip.lateDurationMinutes > 0
                        ? `${scanResult.payslip.lateDurationMinutes} minutes`
                        : "0 mins (On Time)"}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-neutral-500">
                    <span>Deduction Policy</span>
                    <span className="text-neutral-800 dark:text-neutral-200">
                      {scanResult.payslip.deductionPolicy}
                    </span>
                  </div>

                  {scanResult.payslip.lateDeduction > 0 && (
                    <div className="flex justify-between items-center text-red-600 dark:text-red-400 font-medium pt-1.5 border-t border-neutral-100 dark:border-neutral-800">
                      <span>Late Deduction</span>
                      <span className="tabular-nums">
                        -{formatIDR(scanResult.payslip.lateDeduction)}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between items-baseline pt-3 border-t border-neutral-200 dark:border-neutral-800">
                    <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
                      Net Daily Earnings
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
                Return to Dashboard
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
