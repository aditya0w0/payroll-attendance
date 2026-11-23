"use client";

import React, { useState, useEffect, useRef } from "react";
import { Clock, ShieldCheck, RefreshCw, Maximize2, Minimize2 } from "lucide-react";

export default function OwnerQRDisplayPage() {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string>("");
  const [secondsRemaining, setSecondsRemaining] = useState<number>(15);
  const [loading, setLoading] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const tokenRef = useRef<string>("");

  const fetchActiveQR = async () => {
    try {
      const res = await fetch("/api/qr/active", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();

      if (data.token && data.token !== tokenRef.current) {
        tokenRef.current = data.token;
        setToken(data.token);
        setQrDataUrl(data.qrDataUrl);
        setSecondsRemaining(data.secondsRemaining || 15);
      }
    } catch (e) {
      console.error("Failed to fetch QR challenge:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveQR();

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    const pollInterval = setInterval(() => {
      fetchActiveQR();
    }, 1500);

    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      clearInterval(timer);
      clearInterval(pollInterval);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  return (
    <div className="max-w-md mx-auto text-center space-y-5 py-6">
      <div className="flex flex-col items-center gap-1">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          Terminal Presensi QR
        </h1>
        <p className="text-xs text-[var(--text-secondary)] max-w-sm">
          Tampilkan di pintu masuk kantor untuk pemindaian absensi kehadiran.
        </p>

        {/* Operational Toolbar */}
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => {
              setLoading(true);
              fetchActiveQR();
            }}
            className="hig-button-secondary text-xs"
            title="Perbarui token QR sekarang"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Perbarui
          </button>
          <button
            onClick={toggleFullscreen}
            className="hig-button-secondary text-xs"
            title="Beralih ke mode layar penuh"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            {isFullscreen ? "Keluar Layar Penuh" : "Layar Penuh"}
          </button>
        </div>
      </div>

      {/* QR Code Card */}
      <div className="hig-card-elevated p-8 rounded-3xl inline-block shadow-md">
        {loading || !qrDataUrl ? (
          <div className="w-64 h-64 flex items-center justify-center text-xs text-[var(--text-tertiary)]">
            Membuat kode QR dinamis...
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3 bg-white rounded-2xl border border-[var(--separator)] shadow-sm inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt="Terminal Presensi QR Dinamis"
                className="w-64 h-64 object-contain rounded-xl"
              />
            </div>

            {/* Countdown Timer */}
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-medium px-1">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[var(--accent)]" />
                Rotasi 15 detik
              </span>
              <span className="font-mono font-semibold text-sm text-[var(--text-primary)] tabular-numbers">
                00:{String(secondsRemaining).padStart(2, "0")}
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-[var(--separator-subtle)] h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-[var(--accent)] h-full transition-all duration-1000 ease-linear rounded-full"
                style={{ width: `${(secondsRemaining / 15) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Status Notice */}
      <div className="text-[11px] text-[var(--text-tertiary)] max-w-sm mx-auto flex items-center justify-center gap-1.5 font-medium">
        <ShieldCheck className="w-3.5 h-3.5 text-[var(--system-green)] shrink-0" />
        <span>Token sekali pakai. Terproteksi dari kecurangan foto dan duplikasi layar.</span>
      </div>
    </div>
  );
}