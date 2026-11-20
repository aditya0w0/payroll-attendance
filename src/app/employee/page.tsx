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
        text: "Biometrik perangkat berhasil didaftarkan ke akun Anda.",
        type: "success",
      });
      setIsOnboarding(false);
      if (typeof window !== "undefined" && window.history.replaceState) {
        window.history.replaceState({}, "", "/employee");
      }
      await loadDashboard();
    } catch (err: any) {
      setPasskeyMessage({
        text: err.message || "Pendaftaran dibatalkan atau peramban tidak mendukung biometrik.",
        type: "error",
      });
    } finally {
      setPasskeyLoading(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-24 text-xs text-neutral-400">
        Memuat status presensi...
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
        <div className="hig-card p-3 rounded-2xl flex flex-col gap-2 border border-blue-500/20 bg-blue-500/5 dark:bg-blue-950/30 animate-in fade-in duration-200">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <Fingerprint className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-semibold text-[var(--text-primary)] block truncate">
                  {isOnboarding ? "Daftarkan Identitas Perangkat" : "Identitas Biometrik"}
                </span>
                <span className="text-[11px] text-[var(--text-secondary)] block truncate">
                  {isOnboarding ? "Wajib untuk memulai presensi" : "Touch ID / Face ID / PIN"}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleEnrollPasskey}
              disabled={passkeyLoading}
              className="hig-button-primary shrink-0 text-xs px-3 py-1.5 font-medium"
            >
              {passkeyLoading ? "Memproses..." : "Daftarkan"}
            </button>
          </div>

          {passkeyMessage && (
            <div
              className={`px-2.5 py-1.5 rounded-lg text-[11px] border ${
                passkeyMessage.type === "success"
                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                  : "bg-red-500/15 border-red-500/30 text-red-800 dark:text-red-300"
              }`}
            >
              {passkeyMessage.text}
            </div>
          )}
        </div>
      )}

      {/* Daily Wage Card */}
      <div className="p-4 rounded-2xl bg-neutral-900 text-white relative overflow-hidden shadow-sm dark:border dark:border-white/10">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">
            Tarif Upah Harian
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/10 text-neutral-300">
            Per Shift Selesai
          </span>
        </div>

        <div className="text-2xl font-semibold tracking-tight mt-2 tabular-nums">
          {formatIDR(employee.dailySalary)}
        </div>

        <div className="text-xs text-neutral-400 mt-3 flex items-center justify-between pt-2.5 border-t border-white/10">
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
      <div className="hig-card p-4 rounded-2xl space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
            Status Shift
          </span>
          {isNotCheckedIn && (
            <span className="hig-badge px-2.5 py-0.5 text-[10px] font-medium text-neutral-600 dark:text-neutral-400">
              Belum Masuk
            </span>
          )}
          {isCheckedIn && (
            <span className="hig-badge px-2.5 py-0.5 text-[10px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
              Sedang Bekerja
            </span>
          )}
          {isCompleted && (
            <span className="hig-badge px-2.5 py-0.5 text-[10px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
              Selesai
            </span>
          )}
        </div>

        {/* State Detail */}
        {isNotCheckedIn && (
          <div className="space-y-1">
            <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 text-sm">
              Siap Presensi Masuk
            </h3>
            <p className="text-xs text-neutral-500 leading-normal">
              Jadwal mulai {employee.shift.startTime} (toleransi {employee.shift.gracePeriodMinutes} menit). Arahkan kamera ke layar terminal QR kantor.
            </p>
          </div>
        )}

        {isCheckedIn && (
          <div className="space-y-2">
            <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 text-sm">
              Sedang Bekerja
            </h3>
            <div className="flex items-center justify-between text-xs bg-neutral-100/70 dark:bg-neutral-900/70 p-2.5 rounded-xl border border-neutral-200/60 dark:border-neutral-800">
              <span className="text-neutral-500">Waktu Masuk:</span>
              <span className="font-mono font-medium text-neutral-800 dark:text-neutral-200">
                {today.activeRecord?.checkInTime}
              </span>
            </div>
            {today.activeRecord && today.activeRecord.lateMinutes > 0 && (
              <div className="flex items-center justify-between text-xs bg-red-50/70 dark:bg-red-950/30 p-2.5 rounded-xl border border-red-200/50 dark:border-red-900/40 text-red-700 dark:text-red-300">
                <span>Keterlambatan:</span>
                <span className="font-medium">
                  {today.activeRecord.lateMinutes} menit (-{formatIDR(today.activeRecord.lateDeduction)})
                </span>
              </div>
            )}
          </div>
        )}

        {isCompleted && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              <h3 className="font-semibold text-sm">Shift Hari Ini Selesai</h3>
            </div>
            <p className="text-xs text-neutral-500">
              Presensi dan rincian gaji harian Anda telah tercatat rapi dalam sistem.
            </p>
          </div>
        )}

        {/* Action Link to Scanner */}
        {!isCompleted ? (
          <Link
            href="/employee/scan"
            className="hig-button-primary w-full py-2.5 text-xs font-semibold flex items-center justify-center gap-2 rounded-xl"
          >
            <QrCode className="w-4 h-4" />
            <span>{isNotCheckedIn ? "Pindai QR Masuk" : "Pindai QR Pulang"}</span>
          </Link>
        ) : (
          <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 flex justify-between items-center text-xs text-neutral-500">
            <span>Shift selesai untuk {today.shiftDate}</span>
            <span className="hig-badge text-[10px] font-medium text-emerald-600 dark:text-emerald-400">Tervalidasi</span>
          </div>
        )}
      </div>

      {/* Immediate Daily Salary Receipt */}
      {latestCompletedPayslip && (
        <div className="hig-card p-4 rounded-2xl space-y-3">
          <div className="flex items-center justify-between pb-2.5 border-b border-neutral-200 dark:border-neutral-800">
            <div>
              <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider block">
                Rincian Gaji Harian
              </span>
              <h3 className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
                {latestCompletedPayslip.shiftName}
              </h3>
            </div>
            <span className="hig-badge px-2.5 py-0.5 text-[10px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
              {latestCompletedPayslip.status === "COMPLETED" ? "Selesai" : latestCompletedPayslip.status}
            </span>
          </div>

          <div className="text-xs space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-neutral-500">Gaji Pokok Harian</span>
              <span className="font-medium text-neutral-900 dark:text-neutral-100 tabular-nums">
                {formatIDR(latestCompletedPayslip.dailySalary)}
              </span>
            </div>

            <div className="flex justify-between items-center text-neutral-500">
              <span>Jadwal Masuk</span>
              <span className="font-mono text-neutral-700 dark:text-neutral-300">
                {latestCompletedPayslip.scheduledCheckIn.split(", ")[1] ||
                  latestCompletedPayslip.scheduledCheckIn}
              </span>
            </div>

            <div className="flex justify-between items-center text-neutral-500">
              <span>Jam Masuk Aktual</span>
              <span className="font-mono text-neutral-700 dark:text-neutral-300">
                {latestCompletedPayslip.actualCheckIn.split(", ")[1] ||
                  latestCompletedPayslip.actualCheckIn}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-neutral-500">Keterlambatan</span>
              <span
                className={
                  latestCompletedPayslip.lateDurationMinutes > 0
                    ? "font-medium text-red-600 dark:text-red-400"
                    : "font-medium text-emerald-600 dark:text-emerald-400"
                }
              >
                {latestCompletedPayslip.lateDurationMinutes > 0
                  ? `${latestCompletedPayslip.lateDurationMinutes} menit`
                  : "Tepat Waktu"}
              </span>
            </div>

            {latestCompletedPayslip.lateDeduction > 0 && (
              <div className="flex justify-between items-center text-red-600 dark:text-red-400 font-medium pt-1.5 border-t border-neutral-200 dark:border-neutral-800">
                <span>Potongan Denda</span>
                <span className="tabular-nums">
                  -{formatIDR(latestCompletedPayslip.lateDeduction)}
                </span>
              </div>
            )}

            <div className="flex justify-between items-baseline pt-2.5 border-t border-neutral-200 dark:border-neutral-800">
              <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
                Gaji Bersih Harian
              </span>
              <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {formatIDR(latestCompletedPayslip.netDailyEarnings)}
              </span>
            </div>
          </div>

          <div className="text-[10px] text-neutral-400 text-center pt-2 border-t border-neutral-200 dark:border-neutral-800">
            Tanggal Shift: {latestCompletedPayslip.shiftDate} • Catatan Terverifikasi Sistem
          </div>
        </div>
      )}

      {/* Device & Passkey Verification Status */}
      <div className="hig-card p-3 rounded-2xl flex items-center justify-between text-xs text-neutral-500">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>Perangkat Terotorisasi:</span>
        </div>
        <div className="flex items-center gap-2 font-medium text-neutral-800 dark:text-neutral-200">
          {hasPasskey && (
            <span className="hig-badge px-2 py-0.5 text-[10px] font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 shrink-0">
              Passkey Aktif
            </span>
          )}
          <span className="truncate max-w-[180px]">{employee.device?.deviceName || "Perangkat Ini"}</span>
        </div>
      </div>
    </div>
  );
}
