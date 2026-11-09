"use client";

import React, { useState, useEffect } from "react";
import {
  Smartphone,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Copy,
  Check,
  ShieldAlert,
  Fingerprint,
  RotateCcw,
  Slash,
  Trash2,
} from "lucide-react";

interface DeviceItem {
  id: string;
  deviceFingerprint: string;
  deviceName: string;
  platform: string;
  registeredAt: string;
  lastSeenAt: string;
  isActive: boolean;
  status?: string;
  credentialId?: string | null;
  assuranceTier?: "HIGH_HARDWARE_BOUND" | "STANDARD_PASSKEY_SYNCED" | "LEGACY_FINGERPRINT" | null;
  credentialBackedUp?: boolean | null;
  credentialDeviceType?: string | null;
  user: {
    id: string;
    email: string;
    username: string;
    employeeProfile: {
      fullName: string;
      employeeId: string;
    } | null;
  };
}

interface UnlockRequestItem {
  id: string;
  requestCode: string;
  unlockCode: string;
  requestedDeviceName: string;
  previousDeviceName: string | null;
  reason?: string | null;
  previousAssuranceTier?: string | null;
  riskScore?: number | null;
  status: string;
  createdAt: string;
  expiresAt: string;
  user: {
    id: string;
    email: string;
    username: string;
    employeeProfile: {
      fullName: string;
      employeeId: string;
    } | null;
  };
}

export default function OwnerDevicesPage() {
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [requests, setRequests] = useState<UnlockRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Revoke Access Modal State
  const [revokeTarget, setRevokeTarget] = useState<{
    deviceId: string;
    userId: string;
    deviceName: string;
    employeeName: string;
    assuranceTier: string;
  } | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [revokeLoading, setRevokeLoading] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const handleConfirmRevoke = async () => {
    if (!revokeTarget) return;
    setRevokeLoading(true);
    setRevokeError(null);

    const targetDeviceId = revokeTarget.deviceId;
    const targetEmployeeName = revokeTarget.employeeName;

    try {
      // Optimistic UI update: mark row as REVOKED and inactive
      setDevices((prev) =>
        prev.map((d) =>
          d.id === targetDeviceId
            ? { ...d, status: "REVOKED", isActive: false }
            : d
        )
      );

      const res = await fetch("/api/owner/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "REVOKE_ACCESS",
          deviceId: targetDeviceId,
          reason: revokeReason.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mencabut akses perangkat");

      setMessage({
        text: `Akses perangkat untuk ${targetEmployeeName} berhasil dicabut. Sesi login telah dihentikan.`,
        type: "success",
      });

      setRevokeTarget(null);
      setRevokeReason("");
      loadData();
    } catch (err: any) {
      setRevokeError(err.message || "Gagal mencabut akses");
      loadData();
    } finally {
      setRevokeLoading(false);
    }
  };

  const loadData = async () => {
    try {
      const res = await fetch("/api/owner/devices");
      const data = await res.json();
      setDevices(data.devices || []);
      setRequests(data.unlockRequests || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleApproveUnlock = async (requestId: string) => {
    try {
      const res = await fetch("/api/owner/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "APPROVE_UNLOCK", requestId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setMessage({ text: data.message, type: "success" });
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    }
  };

  const handleApproveReplacement = async (requestId: string, employeeName: string) => {
    if (
      !confirm(
        `Approve device replacement for ${employeeName}? This will atomically revoke their previous passkey/device registration, invalidate active sessions, and permit a new enrollment.`
      )
    ) {
      return;
    }

    try {
      const res = await fetch("/api/owner/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "APPROVE_REPLACEMENT",
          requestId,
          reason: "Owner authorized replacement request",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setMessage({ text: data.message, type: "success" });
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    }
  };

  const handleResetDevice = async (userId: string, name: string) => {
    if (
      !confirm(
        `Reset the authorized device for ${name}? The employee will be forced to register a new device.`
      )
    )
      return;

    try {
      const res = await fetch("/api/owner/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "RESET_DEVICE", userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setMessage({ text: data.message, type: "success" });
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    }
  };

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  const pendingRequests = requests.filter((r) => r.status === "PENDING");

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
              Device Management & Passkey Binding
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              FIDO2 Passkeys & W3C WebAuthn
            </span>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Employees are cryptographically bound to a single registered passkey credential. Unrecognized terminals require owner authorization or passkey biometric assertion.
          </p>
        </div>

        <button onClick={loadData} className="apple-btn-secondary text-xs">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center gap-2.5 ${
            message.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/80"
              : "bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800/80"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Pending Unlock & Replacement Requests */}
      <div className="apple-card overflow-hidden">
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600" />
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Pending Unlock & Replacement Requests
            </h2>
            {pendingRequests.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500 text-white">
                {pendingRequests.length} pending
              </span>
            )}
          </div>
        </div>

        {pendingRequests.length === 0 ? (
          <div className="text-center py-8 text-xs text-neutral-400">
            No pending unlock or replacement requests. All active employees are operating from authorized terminals.
          </div>
        ) : (
          <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {pendingRequests.map((req) => {
              const isReplacementRequest = Boolean(req.reason);
              const employeeName = req.user.employeeProfile?.fullName || req.user.username;

              return (
                <div
                  key={req.id}
                  className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-5 bg-amber-50/30 dark:bg-amber-950/10"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-neutral-900 dark:text-neutral-100 text-sm">
                        {employeeName}
                      </span>
                      <span className="font-mono text-[11px] bg-neutral-200 dark:bg-neutral-800 px-2 py-0.5 rounded text-neutral-700 dark:text-neutral-300 font-medium">
                        Request ID: {req.requestCode}
                      </span>
                      {isReplacementRequest && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                          Replacement Request
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-neutral-500 space-y-0.5 pt-1">
                      <div>
                        Registered Hardware:{" "}
                        <span className="font-medium text-neutral-700 dark:text-neutral-300">
                          {req.previousDeviceName || "None"}
                        </span>
                      </div>
                      <div>
                        Attempted Terminal:{" "}
                        <span className="font-medium text-red-600 dark:text-red-400">
                          {req.requestedDeviceName}
                        </span>
                      </div>
                      {req.reason && (
                        <div className="pt-0.5 text-neutral-800 dark:text-neutral-200 font-medium">
                          Reason: <span className="italic">{req.reason}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* 6-digit Unlock Code Box */}
                    <div className="bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-xl px-4 py-2.5 shadow-sm text-center">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 block mb-1">
                        Unlock Code
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 font-mono text-xl font-bold tracking-widest text-blue-600 dark:text-blue-400">
                          {req.unlockCode.split("").map((digit, i) => (
                            <span
                              key={i}
                              className="w-6 h-8 flex items-center justify-center bg-neutral-100 dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700 text-sm font-semibold"
                            >
                              {digit}
                            </span>
                          ))}
                        </div>

                        <button
                          onClick={() => copyToClipboard(req.unlockCode)}
                          className="apple-btn-secondary p-1.5 text-xs ml-1"
                          title="Copy Unlock Code"
                        >
                          {copiedCode === req.unlockCode ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-1.5">
                      {isReplacementRequest ? (
                        <button
                          onClick={() => handleApproveReplacement(req.id, employeeName)}
                          className="apple-btn-primary text-xs px-3.5 py-2 whitespace-nowrap bg-purple-700 hover:bg-purple-800"
                        >
                          Approve Replacement
                        </button>
                      ) : (
                        <button
                          onClick={() => handleApproveUnlock(req.id)}
                          className="apple-btn-primary text-xs px-3.5 py-2 whitespace-nowrap"
                        >
                          Direct Approve
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Currently Registered Devices & Passkeys */}
      <div className="apple-card overflow-hidden">
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Registered Employee Terminals & Passkeys ({devices.length})
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60 text-neutral-500">
                <th className="py-3 px-4 font-semibold uppercase tracking-wider">Employee</th>
                <th className="py-3 px-4 font-semibold uppercase tracking-wider">Terminal Hardware</th>
                <th className="py-3 px-4 font-semibold uppercase tracking-wider">Assurance Tier</th>
                <th className="py-3 px-4 font-semibold uppercase tracking-wider">Status</th>
                <th className="py-3 px-4 font-semibold uppercase tracking-wider">Credential ID / Hash</th>
                <th className="py-3 px-4 font-semibold uppercase tracking-wider">Registered</th>
                <th className="py-3 px-4 font-semibold uppercase tracking-wider text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {devices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-neutral-400">
                    No registered devices or passkeys yet.
                  </td>
                </tr>
              ) : (
                devices.map((dev) => {
                  const hasPasskey = Boolean(dev.credentialId);
                  const isHardware = dev.assuranceTier === "HIGH_HARDWARE_BOUND";
                  const isSynced = dev.assuranceTier === "STANDARD_PASSKEY_SYNCED";
                  const isRevoked = dev.status === "REVOKED" || !dev.isActive;

                  return (
                    <tr key={dev.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/40">
                      <td className="py-3 px-4">
                        <div className="font-medium text-neutral-900 dark:text-neutral-100">
                          {dev.user.employeeProfile?.fullName || dev.user.username}
                        </div>
                        <div className="text-[10px] text-neutral-400 font-mono">{dev.user.email}</div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 font-medium text-neutral-800 dark:text-neutral-200">
                          <Smartphone className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                          <span>{dev.deviceName}</span>
                        </div>
                        <div className="text-[10px] text-neutral-400">{dev.platform}</div>
                      </td>

                      <td className="py-3 px-4">
                        {isHardware ? (
                          <div className="space-y-0.5">
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              HARDWARE BOUND
                            </span>
                            <div className="text-[10px] text-neutral-400">Device Bound</div>
                          </div>
                        ) : isSynced ? (
                          <div className="space-y-0.5">
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                              PASSKEY SYNCED
                            </span>
                            <div className="text-[10px] text-neutral-400">
                              {dev.credentialBackedUp ? "Keychain Synced" : "Platform Passkey"}
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-0.5">
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                              LEGACY FP
                            </span>
                            <div className="text-[10px] text-neutral-400">Web Crypto</div>
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        {isRevoked ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20">
                            [REVOKED]
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                            [ACTIVE]
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono text-[11px] text-neutral-500">
                        {hasPasskey ? (
                          <div>
                            <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                              Passkey:
                            </span>{" "}
                            {dev.credentialId?.substring(0, 14)}...
                          </div>
                        ) : (
                          <div>
                            <span className="text-neutral-400">FP:</span>{" "}
                            {dev.deviceFingerprint.substring(0, 14)}...
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 text-neutral-500 font-mono text-[11px]">
                        {new Date(dev.registeredAt).toLocaleDateString()}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isRevoked ? (
                            <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider px-2 py-1">
                              Akses Dicabut
                            </span>
                          ) : (
                            <button
                              onClick={() =>
                                setRevokeTarget({
                                  deviceId: dev.id,
                                  userId: dev.user.id,
                                  deviceName: dev.deviceName,
                                  employeeName: dev.user.employeeProfile?.fullName || dev.user.username,
                                  assuranceTier: dev.assuranceTier || "STANDARD_PASSKEY_SYNCED",
                                })
                              }
                              className="apple-btn-secondary text-[11px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 border-red-200 dark:border-red-900/60 px-2.5 py-1 flex items-center gap-1 font-medium transition-colors"
                              title="Cabut Akses Perangkat Ini"
                            >
                              <Slash className="w-3 h-3 stroke-[2.5]" />
                              <span>Cabut Akses</span>
                            </button>
                          )}
                          <button
                            onClick={() =>
                              handleResetDevice(
                                dev.user.id,
                                dev.user.employeeProfile?.fullName || dev.user.username
                              )
                            }
                            className="apple-btn-secondary text-[11px] text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 px-2 py-1"
                            title="Reset Device Binding"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ======================================================== */}
      {/* APPLE HIG CONFIRMATION MODAL: CABUT AKSES PERANGKAT      */}
      {/* ======================================================== */}
      {revokeTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="hig-card-elevated max-w-sm w-full p-6 text-center animate-in fade-in zoom-in-95 duration-100 space-y-4">
            <div className="w-11 h-11 rounded-full bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-5 h-5 stroke-[2]" />
            </div>

            <div className="space-y-1">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Cabut Akses Perangkat
              </h2>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Karyawan <span className="font-semibold text-[var(--text-primary)]">{revokeTarget.employeeName}</span> akan langsung dikeluarkan dari sesi aktif dan harus mendaftarkan perangkat kembali atas persetujuan Owner.
              </p>
            </div>

            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-left text-xs space-y-1.5">
              <div className="flex justify-between items-center text-neutral-600 dark:text-neutral-300">
                <span className="text-[11px]">Perangkat:</span>
                <span className="font-medium text-neutral-900 dark:text-neutral-100 truncate max-w-[170px]">{revokeTarget.deviceName}</span>
              </div>
              <div className="flex justify-between items-center text-neutral-600 dark:text-neutral-300">
                <span className="text-[11px]">Assurance Tier:</span>
                <span className="font-mono text-[10px] uppercase font-bold text-neutral-800 dark:text-neutral-200">
                  {revokeTarget.assuranceTier}
                </span>
              </div>
              <div className="flex justify-between items-center text-neutral-600 dark:text-neutral-300 pt-1 border-t border-red-500/10">
                <span className="text-[11px]">Dampak Sesi:</span>
                <span className="font-semibold text-red-600 dark:text-red-400 text-[11px]">
                  Sesi Dihentikan Seketika
                </span>
              </div>
            </div>

            <div className="text-left space-y-1">
              <label className="block text-[11px] font-medium text-[var(--text-secondary)]">
                Alasan Pencabutan (Opsional)
              </label>
              <input
                type="text"
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                placeholder="Misal: Perangkat hilang / pergantian unit"
                className="hig-input text-xs"
              />
            </div>

            {revokeError && (
              <div className="p-2.5 rounded-lg bg-[var(--system-red-tint)] text-[var(--system-red)] text-xs text-left flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{revokeError}</span>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setRevokeTarget(null);
                  setRevokeReason("");
                  setRevokeError(null);
                }}
                disabled={revokeLoading}
                className="hig-button-secondary flex-1 py-2 text-xs font-medium"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmRevoke}
                disabled={revokeLoading}
                className="hig-button-destructive flex-1 py-2 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center justify-center gap-1.5 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{revokeLoading ? "Mencabut..." : "Ya, Cabut Akses"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
