"use client";

import React, { useState, useEffect } from "react";
import { Shield, Smartphone, Lock, AlertCircle } from "lucide-react";
import { getClientDeviceIdentity } from "@/lib/device-client";

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

  // Lockout Modal State
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

  useEffect(() => {
    getClientDeviceIdentity().then(setDeviceInfo);
  }, []);

  const handleModeChange = (newMode: ProfileMode) => {
    setMode(newMode);
    setError(null);
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
        : mode === "employee"
        ? "fp_siti_iphone_auth"
        : dev.deviceFingerprint;

      const dName = isRogue
        ? "Unregistered External Terminal"
        : mode === "employee"
        ? "Siti's iPhone 15 Pro"
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

        {/* Apple HIG Form Card */}
        <form onSubmit={handleLogin} className="hig-card p-5 space-y-4">
          
          {/* macOS Style Segmented Control */}
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
            {loading ? "Authenticating..." : mode === "rogue" ? "Test Rogue Login (Lockout)" : "Sign In"}
          </button>

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
                <span className="font-medium text-[var(--system-red)] truncate max-w-[170px]">{lockoutData.attemptedDeviceName}</span>
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
    </div>
  );
}
