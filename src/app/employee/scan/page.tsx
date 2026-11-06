"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { QrCode, Camera, CheckCircle2, AlertCircle, ArrowLeft, Zap, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { formatIDR } from "@/lib/utils";
import { getClientDeviceIdentity } from "@/lib/device-client";

export default function EmployeeScanPage() {
  const router = useRouter();
  const [tokenInput, setTokenInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<any | null>(null);

  const handleQuickScanActiveQR = async () => {
    setError(null);
    setLoading(true);

    try {
      const qrRes = await fetch("/api/qr/active");
      const qrData = await qrRes.json();
      if (!qrData.token) throw new Error("Could not fetch active workplace QR. Please ensure the terminal is running.");

      await submitToken(qrData.token);
    } catch (err: any) {
      setError(err.message || "Failed to scan QR");
      setLoading(false);
    }
  };

  const submitToken = async (tokenToSubmit: string) => {
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
        <Link href="/employee" className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 flex items-center gap-1.5 font-medium">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Dashboard</span>
        </Link>
        <span className="text-[11px] font-semibold uppercase text-neutral-400 tracking-wider">
          Scanner
        </span>
      </div>

      {!scanResult ? (
        <div className="space-y-4">
          {/* Apple Style Viewfinder Frame */}
          <div className="apple-card p-6 text-center space-y-4">
            <div className="relative w-44 h-44 mx-auto rounded-3xl border-2 border-dashed border-neutral-300 dark:border-neutral-700 flex flex-col items-center justify-center p-4 bg-neutral-50 dark:bg-neutral-900/40">
              <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-2">
                <Camera className="w-6 h-6 stroke-[1.75]" />
              </div>
              <span className="text-[11px] font-medium text-neutral-500">
                Align QR Code
              </span>
            </div>

            <div>
              <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                Attendance Scanner
              </h2>
              <p className="text-xs text-neutral-500 max-w-xs mx-auto mt-1">
                Scan the dynamic 15-second QR on the workplace terminal to record your check-in or check-out.
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 text-xs flex items-center gap-2 text-left">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Quick 1-Tap Scan Action */}
            <button
              onClick={handleQuickScanActiveQR}
              disabled={loading}
              className="apple-btn-primary w-full py-3 text-sm font-medium flex items-center justify-center gap-2"
            >
              <Zap className="w-4 h-4 fill-white" />
              {loading ? "Validating Challenge..." : "1-Tap Scan Workplace QR Code"}
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
                className="apple-input text-xs font-mono"
              />
              <button
                onClick={() => submitToken(tokenInput)}
                disabled={loading || !tokenInput.trim()}
                className="apple-btn-secondary text-xs px-4"
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
                  <span className="font-mono font-medium text-neutral-900 dark:text-neutral-100">{scanResult.attendance.actualCheckIn}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-neutral-500">Base Daily Wage:</span>
                  <span className="font-medium text-neutral-900 dark:text-neutral-100 tabular-nums">{formatIDR(scanResult.attendance.dailySalary)}</span>
                </div>
                {scanResult.attendance.isLate && (
                  <div className="flex justify-between items-center text-red-600 dark:text-red-400 font-medium">
                    <span>Lateness Penalty:</span>
                    <span className="tabular-nums">-{formatIDR(scanResult.attendance.pendingDeduction)}</span>
                  </div>
                )}
              </div>

              <button
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
                      {scanResult.payslip.scheduledCheckIn.split(", ")[1] || scanResult.payslip.scheduledCheckIn}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-neutral-500">
                    <span>Actual Check-In</span>
                    <span className="font-mono text-neutral-700 dark:text-neutral-300">
                      {scanResult.payslip.actualCheckIn.split(", ")[1] || scanResult.payslip.actualCheckIn}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-neutral-500">Late Duration</span>
                    <span className={scanResult.payslip.lateDurationMinutes > 0 ? "font-medium text-red-600 dark:text-red-400" : "font-medium text-emerald-600 dark:text-emerald-400"}>
                      {scanResult.payslip.lateDurationMinutes > 0
                        ? `${scanResult.payslip.lateDurationMinutes} minutes`
                        : "0 mins (On Time)"}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-neutral-500">
                    <span>Deduction Policy</span>
                    <span className="text-neutral-800 dark:text-neutral-200">{scanResult.payslip.deductionPolicy}</span>
                  </div>

                  {scanResult.payslip.lateDeduction > 0 && (
                    <div className="flex justify-between items-center text-red-600 dark:text-red-400 font-medium pt-1.5 border-t border-neutral-100 dark:border-neutral-800">
                      <span>Late Deduction</span>
                      <span className="tabular-nums">-{formatIDR(scanResult.payslip.lateDeduction)}</span>
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
