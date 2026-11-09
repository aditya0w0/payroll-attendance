"use client";

import React, { useState, useEffect } from "react";
import {
  Shield,
  Smartphone,
  Lock,
  AlertCircle,
  Fingerprint,
  KeyRound,
  CheckCircle2,
  X,
  Copy,
  Check,
  ExternalLink,
} from "lucide-react";
import { getClientDeviceIdentity } from "@/lib/device-client";
import { startAuthentication } from "@simplewebauthn/browser";
import { detectInAppWebView, type WebViewDetectionResult } from "@/lib/webview-detect";

type ProfileMode = "owner" | "employee" | "rogue";

export default function LoginPage() {
  const [mode, setMode] = useState<ProfileMode>("owner");
  const [identifier, setIdentifier] = useState("owner@company.com");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Device Identity
  const [deviceInfo, setDeviceInfo] = useState<{
    deviceFingerprint: string;
    deviceName: string;
    publicKey: string;
  } | null>(null);

  // WebAuthn Biometric State
  const [webAuthnPrompt, setWebAuthnPrompt] = useState<{
    identifier: string;
    message: string;
  } | null>(null);
  const [webAuthnLoading, setWebAuthnLoading] = useState(false);
  const [webAuthnError, setWebAuthnError] = useState<string | null>(null);

  // Lockout Modal State (HTTP 423)
  const [lockoutData, setLockoutData] = useState<{
    requestCode: string;
    boundDeviceName: string;
    attemptedDeviceName: string;
    deviceFingerprint?: string;
    deviceName?: string;
  } | null>(null);
  const [unlockCodeInput, setUnlockCodeInput] = useState("");
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  // Replacement Request Modal State
  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [replaceIdentifier, setReplaceIdentifier] = useState("");
  const [replacePassword, setReplacePassword] = useState("");
  const [replaceReason, setReplaceReason] = useState("");
  const [replaceLoading, setReplaceLoading] = useState(false);
  const [replaceSuccess, setReplaceSuccess] = useState<string | null>(null);
  const [replaceError, setReplaceError] = useState<string | null>(null);

  // In-App WebView Detection State
  const [webViewInfo, setWebViewInfo] = useState<WebViewDetectionResult | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    getClientDeviceIdentity().then(setDeviceInfo);
    setWebViewInfo(detectInAppWebView());
  }, []);

  const handleModeChange = (newMode: ProfileMode) => {
    setMode(newMode);
    setError(null);
    setWebAuthnPrompt(null);
    if (newMode === "owner") {
      setIdentifier("owner@company.com");
      setPassword("admin123");
    } else if (newMode === "employee") {
      setIdentifier("siti@company.com");
      setPassword("employee123");
    } else if (newMode === "rogue") {
      setIdentifier("budi@company.com");
      setPassword("employee123");
    }
  };

  const executePasskeyAuth = async (userIdentifier: string) => {
    setWebAuthnLoading(true);
    setWebAuthnError(null);

    // In-app browser detection check
    const detection = detectInAppWebView();
    if (!detection.canUsePasskey) {
      setWebAuthnLoading(false);
      setWebAuthnError(
        detection.isInApp
          ? `Sensor biometrik dibatasi oleh ${detection.appName || "browser internal"}. Buka di Browser Utama (Safari / Chrome) untuk autentikasi sidik jari atau Face ID.`
          : "Browser ini tidak mendukung sensor biometrik WebAuthn. Gunakan Safari atau Chrome."
      );
      return;
    }

    try {
      // 1. Request authentication options from server
      const optRes = await fetch(
        `/api/auth/webauthn/login-options?identifier=${encodeURIComponent(userIdentifier)}`
      );
      const optData = await optRes.json();
      if (!optRes.ok) {
        if (optData.error === "NO_WEBAUTHN_CREDENTIAL") {
          throw new Error("Akun ini belum memiliki Passkey terdaftar. Silakan login menggunakan password untuk mendaftarkan perangkat Anda.");
        }
        throw new Error(optData.error || "Failed to retrieve Passkey challenge");
      }

      // 2. Prompt user verification (Touch ID / Face ID / Windows Hello)
      const authOptions = optData.options || optData;
      if (!authOptions || !authOptions.challenge) {
        throw new Error("Invalid authentication challenge received from server");
      }

      // Avoid triggering cross-device discoverable passkey QR prompt when allowCredentials is empty
      if (
        !authOptions.allowCredentials ||
        !Array.isArray(authOptions.allowCredentials) ||
        authOptions.allowCredentials.length === 0
      ) {
        throw new Error(
          "Tidak ada kredensial biometrik yang terdaftar untuk akun ini. Silakan login dengan password."
        );
      }

      const assertion = await startAuthentication({ optionsJSON: authOptions });

      // 3. Verify assertion with server
      const dev = deviceInfo || (await getClientDeviceIdentity());
      const verifyRes = await fetch("/api/auth/webauthn/login-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: optData.userId,
          identifier: userIdentifier,
          response: assertion,
          deviceFingerprint: dev.deviceFingerprint,
          deviceName: dev.deviceName,
        }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        throw new Error(verifyData.error || "Passkey verification failed");
      }

      // 4. Session re-hydrated without manual owner unlock
      window.location.href = verifyData.redirectUrl || "/employee";
    } catch (err: any) {
      setWebAuthnError(err.message || "Biometric authentication was cancelled or failed");
      setWebAuthnLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const dev = deviceInfo || (await getClientDeviceIdentity());

      // If rogue mode is selected, simulate an unrecognized hardware fingerprint
      const isRogue = mode === "rogue";
      const fp = isRogue
        ? `fp_rogue_unregistered_${Date.now()}`
        : dev.deviceFingerprint;

      const dName = isRogue
        ? "Unregistered External Terminal"
        : dev.deviceName;

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: identifier.trim(),
          password: password.trim(),
          deviceFingerprint: fp,
          deviceName: dName,
          publicKey: dev.publicKey || "demo_key",
        }),
      });

      const data = await res.json();

      // Zero-lockout: passkey assertion required
      if (res.ok && data.requiresWebAuthn) {
        setLoading(false);
        setWebAuthnPrompt({
          identifier: data.identifier || identifier.trim(),
          message: data.message || "Biometric verification required to confirm authorized device.",
        });
        // Automatically invoke biometric passkey authentication prompt
        executePasskeyAuth(data.identifier || identifier.trim());
        return;
      }

      // Rogue / unauthorized device lockout
      if (res.status === 423) {
        setLockoutData({
          requestCode: data.requestCode,
          boundDeviceName: data.boundDeviceName || "Authorized Hardware",
          attemptedDeviceName: data.attemptedDeviceName || dName,
          deviceFingerprint: fp,
          deviceName: dName,
        });
        setLoading(false);
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || "Authentication failed");
      }

      // Authoritative page load sends the newly stored session cookie
      window.location.href = data.redirectUrl;
    } catch (err: any) {
      setError(err.message || "Login failed");
      setLoading(false);
    }
  };

  const handleUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlockCodeInput.trim() || !lockoutData) return;
    setUnlockError(null);
    setUnlockLoading(true);

    try {
      const dev = deviceInfo || (await getClientDeviceIdentity());
      const res = await fetch("/api/auth/verify-device-unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestCode: lockoutData.requestCode,
          unlockCode: unlockCodeInput.trim(),
          deviceFingerprint: lockoutData.deviceFingerprint || dev.deviceFingerprint,
          deviceName: lockoutData.deviceName || dev.deviceName,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Unlock verification failed");
      }

      window.location.href = data.redirectUrl || "/employee";
    } catch (err: any) {
      setUnlockError(err.message || "Failed to unlock device. Please check the code.");
      setUnlockLoading(false);
    }
  };

  const handleReplaceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setReplaceError(null);
    setReplaceSuccess(null);
    setReplaceLoading(true);

    try {
      const dev = deviceInfo || (await getClientDeviceIdentity());
      const res = await fetch("/api/auth/webauthn/replace-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: replaceIdentifier.trim(),
          password: replacePassword.trim(),
          reason: replaceReason.trim(),
          requestedDeviceName: dev.deviceName,
          deviceFingerprint: dev.deviceFingerprint,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Replacement request failed");
      }

      setReplaceSuccess(
        `Replacement request submitted (Reference #${data.requestId.substring(0, 8)}). The owner has been notified to authorize your new terminal.`
      );
    } catch (err: any) {
      setReplaceError(err.message || "Failed to submit replacement request");
    } finally {
      setReplaceLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[var(--system-bg)]">
      <div className="w-full max-w-[340px] space-y-5">
        {/* Apple Style Monogram Header */}
        <div className="text-center space-y-1.5">
          <div className="w-10 h-10 rounded-xl bg-[var(--text-primary)] text-[var(--system-bg)] flex items-center justify-center mx-auto shadow-sm">
            <Shield className="w-5 h-5 stroke-[2]" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
            Sign In
          </h1>
          <p className="text-xs text-[var(--text-secondary)]">
            Use your Workplace ID to continue
          </p>
        </div>

        {/* In-App Browser (WebView) Warning Banner */}
        {webViewInfo && (webViewInfo.isInApp || !webViewInfo.isWebAuthnSupported) && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-2.5 animate-in fade-in duration-200">
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

        {/* Apple HIG Form Card */}
        <form onSubmit={handleLogin} className="hig-card p-5 space-y-4">
          {/* Segmented Control */}
          <div className="flex bg-neutral-200/60 dark:bg-neutral-800 p-0.5 rounded-lg text-xs font-medium">
            <button
              type="button"
              onClick={() => handleModeChange("owner")}
              className={`flex-1 py-1 rounded-md transition-all ${
                mode === "owner"
                  ? "bg-white dark:bg-neutral-900 shadow-sm text-neutral-900 dark:text-neutral-100 font-semibold"
                  : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
              }`}
            >
              Owner
            </button>
            <button
              type="button"
              onClick={() => handleModeChange("employee")}
              className={`flex-1 py-1 rounded-md transition-all ${
                mode === "employee"
                  ? "bg-white dark:bg-neutral-900 shadow-sm text-neutral-900 dark:text-neutral-100 font-semibold"
                  : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
              }`}
            >
              Employee
            </button>
            <button
              type="button"
              onClick={() => handleModeChange("rogue")}
              className={`flex-1 py-1 rounded-md transition-all ${
                mode === "rogue"
                  ? "bg-white dark:bg-neutral-900 shadow-sm text-red-600 dark:text-red-400 font-semibold"
                  : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
              }`}
            >
              Rogue Test
            </button>
          </div>

          {error && (
            <div className="p-2.5 rounded-lg bg-[var(--system-red-tint)] text-[var(--system-red)] text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-[var(--text-secondary)]">
              Account
            </label>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Username or email"
              required
              className="hig-input text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-[var(--text-secondary)]">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              className="hig-input text-xs"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="hig-button-primary w-full py-2.5 text-xs font-medium"
          >
            {loading
              ? "Authenticating..."
              : mode === "rogue"
              ? "Test Rogue Login (Lockout)"
              : "Sign In"}
          </button>

          {/* Replacement Request Trigger */}
          <div className="text-center pt-1">
            <button
              type="button"
              onClick={() => {
                setReplaceIdentifier(identifier);
                setShowReplaceModal(true);
              }}
              className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors underline"
            >
              Lost or replaced your device? Request re-enrollment
            </button>
          </div>

          {/* Terminal Fingerprint Status */}
          <div className="pt-2 border-t border-[var(--separator-subtle)] flex items-center justify-between text-[11px] text-[var(--text-tertiary)]">
            <span className="flex items-center gap-1.5 truncate max-w-[180px]">
              <Smartphone className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{deviceInfo?.deviceName || "Detecting hardware..."}</span>
            </span>
            <span className="font-mono text-[10px] tabular-numbers">
              {deviceInfo?.deviceFingerprint.substring(0, 10)}...
            </span>
          </div>
        </form>
      </div>

      {/* ======================================================== */}
      {/* BIOMETRIC WEBAUTHN ZERO-LOCKOUT DIALOG                   */}
      {/* ======================================================== */}
      {webAuthnPrompt && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="hig-card-elevated max-w-sm w-full p-6 text-center animate-in fade-in zoom-in-95 duration-100 space-y-4">
            <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
              <Fingerprint className="w-6 h-6 stroke-[2]" />
            </div>

            <div className="space-y-1">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Biometric Passkey Required
              </h2>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Browser storage was cleared. Verify your identity with Touch ID, Face ID, or your device Passkey to restore your session without manual lockout.
              </p>
            </div>

            {webAuthnError && (
              <div className="space-y-2 text-left">
                <div className="text-xs text-[var(--system-red)] bg-[var(--system-red-tint)] p-2.5 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{webAuthnError}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        navigator.clipboard.writeText(window.location.href);
                        setLinkCopied(true);
                        setTimeout(() => setLinkCopied(false), 2500);
                      }
                    }}
                    className="apple-btn-secondary flex-1 py-1.5 text-[11px] flex items-center justify-center gap-1.5"
                  >
                    {linkCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Link Tersalin</span>
                      </>
                    ) : (
                      <>
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Buka di Safari / Chrome</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setWebAuthnPrompt(null);
                      setShowReplaceModal(true);
                    }}
                    className="apple-btn-secondary py-1.5 px-2.5 text-[11px] text-[var(--text-secondary)]"
                  >
                    Minta Kode
                  </button>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setWebAuthnPrompt(null)}
                className="hig-button-secondary flex-1 py-2 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executePasskeyAuth(webAuthnPrompt.identifier)}
                disabled={webAuthnLoading}
                className="hig-button-primary flex-1 py-2 text-xs flex items-center justify-center gap-1.5"
              >
                <Fingerprint className="w-3.5 h-3.5" />
                {webAuthnLoading ? "Verifying..." : "Verify Biometric"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SINGLE-DEVICE LOCKOUT MODAL (Apple HIG Alert Sheet Style) */}
      {/* ======================================================== */}
      {lockoutData && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="hig-card-elevated max-w-sm w-full p-6 text-center animate-in fade-in zoom-in-95 duration-100">
            <div className="w-10 h-10 rounded-full bg-[var(--system-red-tint)] text-[var(--system-red)] flex items-center justify-center mx-auto mb-3">
              <Lock className="w-5 h-5 stroke-[2]" />
            </div>

            <h2 className="text-base font-semibold text-[var(--text-primary)] mb-1">
              Device Not Authorized
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mb-4 leading-relaxed">
              This account is bound to another registered device. Provide your Request ID to the owner to obtain an Unlock Code.
            </p>

            <div className="bg-neutral-100 dark:bg-neutral-800/60 rounded-xl p-3 text-left text-xs space-y-1.5 mb-4 border border-[var(--separator)]">
              <div className="flex justify-between items-center">
                <span className="text-[var(--text-secondary)]">Registered:</span>
                <span className="font-medium text-[var(--text-primary)]">{lockoutData.boundDeviceName}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[var(--text-secondary)]">Attempted:</span>
                <span className="font-medium text-[var(--system-red)] truncate max-w-[170px]">
                  {lockoutData.attemptedDeviceName}
                </span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-[var(--separator)]">
                <span className="text-[var(--text-secondary)] font-medium">Request ID:</span>
                <span className="font-mono font-bold text-[var(--accent)] tabular-numbers">
                  {lockoutData.requestCode}
                </span>
              </div>
            </div>

            <form onSubmit={handleUnlockSubmit} className="space-y-3">
              {unlockError && (
                <div className="text-xs text-[var(--system-red)] bg-[var(--system-red-tint)] p-2 rounded-lg text-left">
                  {unlockError}
                </div>
              )}

              <div>
                <label className="block text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5">
                  Enter 6-Digit Owner Unlock Code
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={unlockCodeInput}
                  onChange={(e) => setUnlockCodeInput(e.target.value.replace(/\D/g, ""))}
                  placeholder="------"
                  autoFocus
                  required
                  className="hig-input text-center text-xl tracking-[0.3em] font-mono font-bold py-2 tabular-numbers"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setLockoutData(null)}
                  className="hig-button-secondary flex-1 py-2 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={unlockLoading || unlockCodeInput.length !== 6}
                  className="hig-button-primary flex-1 py-2 text-xs"
                >
                  {unlockLoading ? "Verifying..." : "Authorize"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* DEVICE REPLACEMENT REQUEST SHEET                         */}
      {/* ======================================================== */}
      {showReplaceModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="hig-card-elevated max-w-sm w-full p-6 text-left animate-in fade-in zoom-in-95 duration-100 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--separator)]">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-neutral-700 dark:text-neutral-300" />
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  Request Device Replacement
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowReplaceModal(false);
                  setReplaceSuccess(null);
                  setReplaceError(null);
                }}
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {replaceSuccess ? (
              <div className="space-y-4 text-center py-2">
                <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-5 h-5 stroke-[2]" />
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {replaceSuccess}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowReplaceModal(false);
                    setReplaceSuccess(null);
                  }}
                  className="hig-button-primary w-full py-2 text-xs"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleReplaceSubmit} className="space-y-3">
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Lost or upgraded your phone? Submit a replacement request for owner authorization to enroll your new device.
                </p>

                {replaceError && (
                  <div className="text-xs text-[var(--system-red)] bg-[var(--system-red-tint)] p-2 rounded-lg">
                    {replaceError}
                  </div>
                )}

                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-[var(--text-secondary)]">
                    Workplace ID / Email
                  </label>
                  <input
                    type="text"
                    value={replaceIdentifier}
                    onChange={(e) => setReplaceIdentifier(e.target.value)}
                    required
                    className="hig-input text-xs"
                    placeholder="siti@company.com"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-[var(--text-secondary)]">
                    Account Password
                  </label>
                  <input
                    type="password"
                    value={replacePassword}
                    onChange={(e) => setReplacePassword(e.target.value)}
                    required
                    className="hig-input text-xs"
                    placeholder="Password"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-[var(--text-secondary)]">
                    Reason for Replacement
                  </label>
                  <input
                    type="text"
                    value={replaceReason}
                    onChange={(e) => setReplaceReason(e.target.value)}
                    required
                    className="hig-input text-xs"
                    placeholder="e.g. Lost phone, new phone purchase"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowReplaceModal(false)}
                    className="hig-button-secondary flex-1 py-2 text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={replaceLoading}
                    className="hig-button-primary flex-1 py-2 text-xs"
                  >
                    {replaceLoading ? "Submitting..." : "Submit Request"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
