"use client";

import React, { useState, useEffect } from "react";
import { QrCode, Clock, ShieldCheck, RefreshCw } from "lucide-react";

export default function OwnerQRDisplayPage() {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string>("");
  const [secondsRemaining, setSecondsRemaining] = useState<number>(15);
  const [loading, setLoading] = useState<boolean>(true);
  const tokenRef = React.useRef<string>("");

  const fetchActiveQR = async () => {
    try {
      const res = await fetch("/api/qr/active", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();

      // If token rotated (either expired or consumed by employee ahead in queue):
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

    // 1-second countdown display tick
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    // Task 2.2: Fast-poll every 1500ms (1.5 seconds) for instant queue rotation on consumption
    const pollInterval = setInterval(() => {
      fetchActiveQR();
    }, 1500);

    return () => {
      clearInterval(timer);
      clearInterval(pollInterval);
    };
  }, []);

  return (
    <div className="max-w-md mx-auto text-center space-y-6 py-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
          Terminal Presensi QR
        </h1>
        <p className="text-xs text-neutral-500 mt-1 max-w-sm mx-auto">
          Buka layar ini di pintu masuk kantor. Karyawan memindai QR menggunakan perangkat terdaftar untuk absensi masuk dan keluar.
        </p>
      </div>

      {/* QR Code Container */}
      <div className="liquid-glass-elevated p-8 rounded-3xl inline-block shadow-lg">
        {loading || !qrDataUrl ? (
          <div className="w-64 h-64 flex items-center justify-center text-xs text-neutral-400">
            Membuat kode QR dinamis...
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3 bg-white rounded-2xl border border-neutral-200 shadow-sm inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt="Terminal Presensi QR Dinamis"
                className="w-64 h-64 object-contain rounded-xl"
              />
            </div>

            {/* Countdown Timer */}
            <div className="flex items-center justify-between text-xs text-neutral-500 font-medium px-1">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-600" />
                Berganti tiap 15 detik
              </span>
              <span className="font-mono font-semibold text-sm text-neutral-900 dark:text-neutral-100 tabular-nums">
                00:{String(secondsRemaining).padStart(2, "0")}
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-neutral-100 dark:bg-neutral-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-blue-600 h-full transition-all duration-1000 ease-linear rounded-full"
                style={{ width: `${(secondsRemaining / 15) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Security notice */}
      <div className="text-[11px] text-neutral-400 max-w-sm mx-auto space-y-1">
        <p className="flex items-center justify-center gap-1 font-medium text-neutral-600 dark:text-neutral-400">
          <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
          Token Dinamis Sekali Pakai • Langsung hangus setelah dipindai
        </p>
        <p>
          Penggunaan ulang foto QR otomatis diblokir dan dicatat sebagai pelanggaran keamanan.
        </p>
      </div>
    </div>
  );
}
