"use client";

import React, { useState, useEffect } from "react";
import { QrCode, Clock, ShieldCheck, RefreshCw } from "lucide-react";

export default function OwnerQRDisplayPage() {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string>("");
  const [secondsRemaining, setSecondsRemaining] = useState<number>(15);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchActiveQR = async () => {
    try {
      const res = await fetch("/api/qr/active", { cache: "no-store" });
      const data = await res.json();
      setQrDataUrl(data.qrDataUrl);
      setToken(data.token);
      setSecondsRemaining(data.secondsRemaining || 15);
    } catch (e) {
      console.error("Failed to fetch QR challenge:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveQR();

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          fetchActiveQR();
          return 15;
        }
        return prev - 1;
      });
    }, 1000);

    // Fast-poll every 2s to detect when an employee scans and burns the token
    const pollInterval = setInterval(() => {
      fetchActiveQR();
    }, 2000);

    return () => {
      clearInterval(timer);
      clearInterval(pollInterval);
    };
  }, []);

  return (
    <div className="max-w-md mx-auto text-center space-y-6 py-6">
      <div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 mb-3">
          <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
          Dynamic Cryptographic Attendance
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
          Workplace Terminal
        </h1>
        <p className="text-xs text-neutral-500 mt-1 max-w-sm mx-auto">
          Display this screen at the office entrance. Employees scan using their registered device for Check-in and Check-out.
        </p>
      </div>

      {/* QR Code Container */}
      <div className="apple-card p-8 inline-block shadow-sm">
        {loading || !qrDataUrl ? (
          <div className="w-64 h-64 flex items-center justify-center text-xs text-neutral-400">
            Generating cryptographic challenge...
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3 bg-white rounded-2xl border border-neutral-200 shadow-sm inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt="Workplace Dynamic Attendance QR"
                className="w-64 h-64 object-contain rounded-xl"
              />
            </div>

            {/* Countdown Timer */}
            <div className="flex items-center justify-between text-xs text-neutral-500 font-medium px-1">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-600" />
                Rotates every 15s
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
          Single-Use Dynamic Token • Consumes & burns immediately upon scan
        </p>
        <p>
          Re-using or sharing photographed QR codes is blocked and flagged as a security incident to the Owner.
        </p>
      </div>
    </div>
  );
}
