"use client";

import React, { useState, useEffect } from "react";
import { Smartphone, KeyRound, CheckCircle2, AlertCircle, ShieldCheck, RefreshCw, Copy, Check, ShieldAlert } from "lucide-react";

interface DeviceItem {
  id: string;
  deviceFingerprint: string;
  deviceName: string;
  platform: string;
  registeredAt: string;
  lastSeenAt: string;
  isActive: boolean;
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

  const handleApprove = async (requestId: string) => {
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

  const handleResetDevice = async (userId: string, name: string) => {
    if (!confirm(`Are you sure you want to reset the authorized device for ${name}? The employee will be forced to register a new device.`)) return;

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
              Device Management & Unlock Authorization
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              Zero-Trust Binding
            </span>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Employees are cryptographically bound to a single authorized device. Unknown hardware is locked out until approved with a 6-digit Unlock Code.
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
          {message.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Pending Unlock Requests Section */}
      <div className="apple-card overflow-hidden">
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600" />
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Pending Device Unlock Requests
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
            No pending unlock requests. All active employees are operating from authorized terminals.
          </div>
        ) : (
          <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {pendingRequests.map((req) => (
              <div
                key={req.id}
                className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-5 bg-amber-50/30 dark:bg-amber-950/10"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-neutral-900 dark:text-neutral-100 text-sm">
                      {req.user.employeeProfile?.fullName || req.user.username}
                    </span>
                    <span className="font-mono text-[11px] bg-neutral-200 dark:bg-neutral-800 px-2 py-0.5 rounded text-neutral-700 dark:text-neutral-300 font-medium">
                      Request ID: {req.requestCode}
                    </span>
                  </div>
                  <div className="text-xs text-neutral-500 space-y-0.5 pt-1">
                    <div>
                      Registered Hardware: <span className="font-medium text-neutral-700 dark:text-neutral-300">{req.previousDeviceName || "None"}</span>
                    </div>
                    <div>
                      Attempted Terminal: <span className="font-medium text-red-600 dark:text-red-400">{req.requestedDeviceName}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {/* Apple 2FA 6-digit Unlock Code Box */}
                  <div className="bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-xl px-4 py-2.5 shadow-sm text-center">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 block mb-1">
                      One-Time Unlock Code
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

                  <button
                    onClick={() => handleApprove(req.id)}
                    className="apple-btn-primary text-xs px-4 py-2.5 whitespace-nowrap"
                  >
                    Direct Approve
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Currently Authorized Devices */}
      <div className="apple-card overflow-hidden">
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Registered Employee Terminals ({devices.length})
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60 text-neutral-500">
                <th className="py-3 px-4 font-semibold uppercase tracking-wider">Employee</th>
                <th className="py-3 px-4 font-semibold uppercase tracking-wider">Device Hardware Name</th>
                <th className="py-3 px-4 font-semibold uppercase tracking-wider">Fingerprint Hash</th>
                <th className="py-3 px-4 font-semibold uppercase tracking-wider">Platform</th>
                <th className="py-3 px-4 font-semibold uppercase tracking-wider">Registered</th>
                <th className="py-3 px-4 font-semibold uppercase tracking-wider text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {devices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-neutral-400">
                    No registered devices yet.
                  </td>
                </tr>
              ) : (
                devices.map((dev) => (
                  <tr key={dev.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/40">
                    <td className="py-3 px-4">
                      <div className="font-medium text-neutral-900 dark:text-neutral-100">
                        {dev.user.employeeProfile?.fullName || dev.user.username}
                      </div>
                      <div className="text-[10px] text-neutral-400 font-mono">{dev.user.email}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 font-medium text-neutral-800 dark:text-neutral-200">
                        <Smartphone className="w-3.5 h-3.5 text-neutral-400" />
                        {dev.deviceName}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-neutral-500">
                      {dev.deviceFingerprint.substring(0, 16)}...
                    </td>
                    <td className="py-3 px-4 text-neutral-600 dark:text-neutral-400">{dev.platform}</td>
                    <td className="py-3 px-4 text-neutral-500 font-mono text-[11px]">
                      {new Date(dev.registeredAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleResetDevice(dev.user.id, dev.user.employeeProfile?.fullName || dev.user.username)}
                        className="apple-btn-secondary text-[11px] text-red-600 hover:text-red-700 px-2.5 py-1"
                      >
                        Reset Binding
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
