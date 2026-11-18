"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { formatIDR } from "@/lib/utils";
import {
  QrCode,
  Clock,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  ShieldCheck,
  Check,
  FileText,
  Fingerprint,
  Copy,
  ExternalLink,
} from "lucide-react";
import { startRegistration } from "@simplewebauthn/browser";
import { detectInAppWebView, type WebViewDetectionResult } from "@/lib/webview-detect";

interface DashboardData {
  employee: {
    id: string;
    fullName: string;
    employeeId: string;
    dailySalary: number;
    shift: {
      name: string;
      startTime: string;
      endTime: string;
      isOvernight: boolean;
      gracePeriodMinutes: number;
      policy: {
        name: string;
        mode: string;
        rate: number;
      };
    };
    device: {
      deviceName: string;
      registeredAt: string;
      credentialId?: string | null;
      assuranceTier?: string | null;
      credentialBackedUp?: boolean | null;
    } | null;
  };
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
      dailySalarySnapshot: number;
    } | null;
  };
  latestCompletedPayslip: {
    shiftDate: string;
    shiftName: string;
    dailySalary: number;
    scheduledCheckIn: string;
    actualCheckIn: string;
    scheduledCheckOut: string;
    actualCheckOut: string;
    lateDurationMinutes: number;
    lateDeduction: number;
    netDailyEarnings: number;
    status: string;
  } | null;
}

export default function EmployeeDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = sessionStorage.getItem("cg_employee_dashboard_cache");
        if (cached) return JSON.parse(cached);
      } catch {}
    }
    return null;
  });
  const [loading, setLoading] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        return !sessionStorage.getItem("cg_employee_dashboard_cache");
      } catch {}
    }
    return true;
  });
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeyMessage, setPasskeyMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);
  const [webViewInfo, setWebViewInfo] = useState<WebViewDetectionResult | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [isOnboarding, setIsOnboarding] = useState(false);

  const loadDashboard = async () => {
    try {
      const res = await fetch("/api/employee/dashboard", { cache: "no-store" });
      if (res.ok) {
        const d = await res.json();
        setData(d);
        if (typeof window !== "undefined") {
          try {
            sessionStorage.setItem("cg_employee_dashboard_cache", JSON.stringify(d));
          } catch {}
        }
        if (d?.employee?.device?.credentialId) {
          setIsOnboarding(false);
          if (typeof window !== "undefined" && window.history.replaceState) {
            window.history.replaceState({}, "", "/employee");
          }
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
    setWebViewInfo(detectInAppWebView());
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("onboarding") === "passkey") {
        setIsOnboarding(true);
      }
    }
  }, []);

  const handleEnrollPasskey = async () => {
    const detection = detectInAppWebView();
    if (!detection.canUsePasskey) {
      setPasskeyMessage({
        text: detection.isInApp
          ? `Pendaftaran biometrik dibatasi oleh ${detection.appName || "browser internal"}. Buka di Browser Utama (Safari / Chrome) untuk mendaftarkan sidik jari atau Face ID.`
          : "Browser ini tidak mendukung sensor biometrik WebAuthn. Gunakan Safari atau Chrome.",
        type: "error",
      });
      return;
    }

    setPasskeyLoading(true);
    setPasskeyMessage(null);

    try {
      // 1. Get WebAuthn registration options
      const optRes = await fetch("/api/auth/webauthn/register-options");
      const optData = await optRes.json();
      if (!optRes.ok) {
        throw new Error(optData.error || "Failed to initialize Passkey registration");
      }

      // 2. Request user credential creation (Touch ID / Face ID / Windows Hello)
      const regOptions = optData.options || optData;
      if (!regOptions || !regOptions.challenge) {
        throw new Error("Invalid registration challenge received from server");
      }

      const attestation = await startRegistration({ optionsJSON: regOptions });

      // 3. Send verified attestation to server (dynamic device name resolved from User-Agent)
      const verifyRes = await fetch("/api/auth/webauthn/register-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          response: attestation,
        }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        throw new Error(verifyData.error || "Failed to verify Passkey attestation");
      }

      setPasskeyMessage({
        text: "Biometric Passkey registered successfully! This physical hardware device is now bound to your account.",
        type: "success",
      });
      setIsOnboarding(false);
      if (typeof window !== "undefined" && window.history.replaceState) {
        window.history.replaceState({}, "", "/employee");
      }
      await loadDashboard();
    } catch (err: any) {
      setPasskeyMessage({
        text: err.message || "Passkey registration was cancelled or not supported by this browser.",
        type: "error",
      });
    } finally {
      setPasskeyLoading(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-24 text-xs text-neutral-400">
        Loading attendance status...
      </div>
    );
  }

  const { employee, today, latestCompletedPayslip } = data;
  const isCheckedIn = today.state === "CHECKED_IN";
  const isCompleted = today.state === "COMPLETED";
  const isNotCheckedIn = today.state === "NOT_CHECKED_IN";
  const hasPasskey = Boolean(employee.device?.credentialId);

  return (
    <div className="space-y-4">
      {/* In-App Browser (WebView) Warning Banner */}
      {webViewInfo && (webViewInfo.isInApp || !webViewInfo.isWebAuthnSupported) && (
        <div className="apple-card p-3.5 bg-amber-500/10 border border-amber-500/30 text-xs space-y-2.5 animate-in fade-in duration-200">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1 flex-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-neutral-900 dark:text-neutral-100 text-[11px]">
                  Buka di Browser Utama (Safari / Chrome)
                </span>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold tracking-wider uppercase bg-amber-500/20 text-amber-800 dark:text-amber-200">
                  {webViewInfo.appName ? `[${webViewInfo.appName.toUpperCase()}]` : "[WEBVIEW]"}
                </span>
              </div>
              <p className="text-[11px] text-neutral-600 dark:text-neutral-400 leading-relaxed">
                Buka di Browser Utama (Safari / Chrome) untuk autentikasi sidik jari atau Face ID. Browser internal aplikasi ini membatasi sensor keamanan biometrik.
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-amber-500/20 flex items-center justify-between">
            <span className="text-[10px] text-neutral-400 font-mono truncate max-w-[170px]">
              {typeof window !== "undefined" ? window.location.host : ""}
            </span>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") {
                  navigator.clipboard.writeText(window.location.href);
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 2500);
                }
              }}
              className="apple-btn-secondary px-2.5 py-1 text-[11px] font-medium flex items-center gap-1.5"
            >
              {linkCopied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Tersalin</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Salin Link</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Biometric Passkey Enrollment Banner / Onboarding Card */}
      {!hasPasskey && (
        <div className="liquid-glass p-4 rounded-3xl bg-blue-500/10 dark:bg-blue-950/40 border border-blue-400/30 dark:border-blue-600/30 space-y-3 animate-in fade-in duration-200">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-2xl bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/30">
              <Fingerprint className="w-5 h-5" />
            </div>
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                  {isOnboarding ? "Pendaftaran Perangkat Pertama Kali" : "Daftarkan Biometrik Passkey"}
                </h3>
                {isOnboarding && (
                  <span className="liquid-glass-pill text-[9px] px-2 py-0.5 bg-blue-500/20 text-blue-700 dark:text-blue-300 font-medium border border-blue-500/30">
                    Wajib Daftar Perangkat
                  </span>
                )}
              </div>
              <p className="text-[11px] text-neutral-600 dark:text-neutral-400 leading-normal">
                {isOnboarding
                  ? "Untuk mengaktifkan sistem kehadiran, daftarkan sensor biometrik (Touch ID / Face ID / PIN Perangkat) ini sebagai identitas fisik resmi Anda."
                  : "Daftarkan Touch ID, Face ID, atau PIN perangkat ini untuk mempermudah login tanpa terblokir saat data penjelajah dihapus."}
              </p>
            </div>
          </div>

          {passkeyMessage && (
            <div
              className={`p-2.5 rounded-xl text-[11px] border ${
                passkeyMessage.type === "success"
                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                  : "bg-red-500/15 border-red-500/30 text-red-800 dark:text-red-300"
              }`}
            >
              {passkeyMessage.text}
            </div>
          )}

          <div className="pt-2 flex items-center justify-between border-t border-blue-500/20">
            <span className="text-[10px] text-neutral-500 font-medium">
              Sensor Biometrik Platform
            </span>
            <button
              onClick={handleEnrollPasskey}
              disabled={passkeyLoading}
              className="liquid-glass-btn-primary text-xs px-3.5 py-2 flex items-center gap-1.5 rounded-xl"
            >
              <Fingerprint className="w-3.5 h-3.5" />
              <span>{passkeyLoading ? "Memproses Biometrik..." : isOnboarding ? "Daftarkan Perangkat Ini" : "Enroll Passkey"}</span>
            </button>
          </div>
        </div>
      )}

      {/* Apple Wallet / Obsidian Liquid Glass Daily Wage Card */}
      <div className="p-5 rounded-3xl liquid-glass-obsidian text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-12 -mt-12 w-32 h-32 rounded-full bg-blue-500/20 blur-2xl pointer-events-none" />
        <div className="flex items-center justify-between relative z-10">
          <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-300">
            Daily Wage Rate
          </span>
          <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-white/15 backdrop-blur-md text-neutral-200 border border-white/10">
            Per Completed Shift
          </span>
        </div>

        <div className="text-3xl font-semibold tracking-tight mt-2.5 tabular-nums relative z-10">
          {formatIDR(employee.dailySalary)}
        </div>

        <div className="text-xs text-neutral-300 mt-4 flex items-center justify-between pt-3 border-t border-white/15 relative z-10">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            <span>{employee.shift.name}</span>
          </div>
          <span className="font-mono text-neutral-300">
            {employee.shift.startTime} – {employee.shift.endTime}
          </span>
        </div>
      </div>

      {/* Today's Attendance State Card */}
      <div className="liquid-glass p-5 rounded-3xl space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
            Shift Status
          </span>
          {isNotCheckedIn && (
            <span className="liquid-glass-pill px-2.5 py-0.5 text-[10px] font-medium text-neutral-600 dark:text-neutral-400">
              Not Checked In
            </span>
          )}
          {isCheckedIn && (
            <span className="liquid-glass-pill px-2.5 py-0.5 text-[10px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
              Shift in Progress
            </span>
          )}
          {isCompleted && (
            <span className="liquid-glass-pill px-2.5 py-0.5 text-[10px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
              Completed
            </span>
          )}
        </div>

        {/* State Detail */}
        {isNotCheckedIn && (
          <div className="space-y-1">
            <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 text-sm">
              Ready to Check In
            </h3>
            <p className="text-xs text-neutral-500 leading-normal">
              Scheduled start is {employee.shift.startTime} with {employee.shift.gracePeriodMinutes} mins grace window. Scan the terminal QR upon arrival.
            </p>
          </div>
        )}

        {isCheckedIn && (
          <div className="space-y-2">
            <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 text-sm">
              Currently Working
            </h3>
            <div className="flex items-center justify-between text-xs bg-white/40 dark:bg-black/20 backdrop-blur-md p-2.5 rounded-xl border border-white/50 dark:border-white/5">
              <span className="text-neutral-500">Check-In Time:</span>
              <span className="font-mono font-medium text-neutral-800 dark:text-neutral-200">
                {today.activeRecord?.checkInTime}
              </span>
            </div>
            {today.activeRecord && today.activeRecord.lateMinutes > 0 && (
              <div className="flex items-center justify-between text-xs bg-red-50/70 dark:bg-red-950/30 p-2.5 rounded-xl border border-red-200/50 dark:border-red-900/40 text-red-700 dark:text-red-300">
                <span>Late Duration:</span>
                <span className="font-medium">
                  {today.activeRecord.lateMinutes} mins (-{formatIDR(today.activeRecord.lateDeduction)})
                </span>
              </div>
            )}
          </div>
        )}

        {isCompleted && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              <h3 className="font-semibold text-sm">Shift Successfully Concluded</h3>
            </div>
            <p className="text-xs text-neutral-500">
              Your attendance and daily salary snapshot have been authoritatively computed and recorded.
            </p>
          </div>
        )}

        {/* Action Link to Scanner */}
        {!isCompleted ? (
          <Link
            href="/employee/scan"
            className="liquid-glass-btn-primary w-full py-3 text-xs font-semibold flex items-center justify-center gap-2 rounded-xl"
          >
            <QrCode className="w-4 h-4" />
            <span>{isNotCheckedIn ? "Scan QR to Check In" : "Scan QR to Check Out"}</span>
          </Link>
        ) : (
          <div className="pt-2 border-t border-white/40 dark:border-white/5 flex justify-between items-center text-xs text-neutral-500">
            <span>Shift completed for {today.shiftDate}</span>
            <span className="font-medium text-emerald-600 dark:text-emerald-400">Authoritative</span>
          </div>
        )}
      </div>

      {/* Immediate Daily Salary Receipt */}
      {latestCompletedPayslip && (
        <div className="liquid-glass p-5 rounded-3xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/40 dark:border-white/10">
            <div>
              <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider block">
                Daily Salary Receipt
              </span>
              <h3 className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
                {latestCompletedPayslip.shiftName}
              </h3>
            </div>
            <span className="liquid-glass-pill px-2.5 py-0.5 text-[10px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
              {latestCompletedPayslip.status}
            </span>
          </div>

          <div className="text-xs space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-neutral-500">Base Daily Salary</span>
              <span className="font-medium text-neutral-900 dark:text-neutral-100 tabular-nums">
                {formatIDR(latestCompletedPayslip.dailySalary)}
              </span>
            </div>

            <div className="flex justify-between items-center text-neutral-500">
              <span>Scheduled Check-In</span>
              <span className="font-mono text-neutral-700 dark:text-neutral-300">
                {latestCompletedPayslip.scheduledCheckIn.split(", ")[1] ||
                  latestCompletedPayslip.scheduledCheckIn}
              </span>
            </div>

            <div className="flex justify-between items-center text-neutral-500">
              <span>Actual Check-In</span>
              <span className="font-mono text-neutral-700 dark:text-neutral-300">
                {latestCompletedPayslip.actualCheckIn.split(", ")[1] ||
                  latestCompletedPayslip.actualCheckIn}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-neutral-500">Late Duration</span>
              <span
                className={
                  latestCompletedPayslip.lateDurationMinutes > 0
                    ? "font-medium text-red-600 dark:text-red-400"
                    : "font-medium text-emerald-600 dark:text-emerald-400"
                }
              >
                {latestCompletedPayslip.lateDurationMinutes > 0
                  ? `${latestCompletedPayslip.lateDurationMinutes} minutes`
                  : "0 mins (On Time)"}
              </span>
            </div>

            {latestCompletedPayslip.lateDeduction > 0 && (
              <div className="flex justify-between items-center text-red-600 dark:text-red-400 font-medium pt-1.5 border-t border-white/40 dark:border-white/10">
                <span>Late Deduction</span>
                <span className="tabular-nums">
                  -{formatIDR(latestCompletedPayslip.lateDeduction)}
                </span>
              </div>
            )}

            <div className="flex justify-between items-baseline pt-3 border-t border-white/60 dark:border-white/10">
              <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
                Net Daily Earnings
              </span>
              <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {formatIDR(latestCompletedPayslip.netDailyEarnings)}
              </span>
            </div>
          </div>

          <div className="text-[10px] text-neutral-400 text-center pt-2 border-t border-white/40 dark:border-white/10">
            Session Date: {latestCompletedPayslip.shiftDate} • Authoritative Server Snapshot
          </div>
        </div>
      )}

      {/* Device & Passkey Verification Status */}
      <div className="liquid-glass p-3.5 rounded-2xl flex items-center justify-between text-xs text-neutral-500">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>Authorized Device:</span>
        </div>
        <div className="flex items-center gap-2 font-medium text-neutral-800 dark:text-neutral-200">
          {hasPasskey && (
            <span className="liquid-glass-pill px-2.5 py-0.5 text-[10px] font-bold tracking-wider uppercase bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 shrink-0">
              [ACTIVE PASSKEY]
            </span>
          )}
          <span className="truncate max-w-[180px]">{employee.device?.deviceName || "This Terminal"}</span>
        </div>
      </div>
    </div>
  );
}
