"use client";

import React, { useState, useEffect } from "react";
import { formatJakartaDateTime } from "@/lib/timezone";
import {
  ShieldCheck,
  Search,
  RefreshCw,
  Eye,
  X,
  Terminal,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Download,
  Send,
  Database,
  Lock,
} from "lucide-react";

interface AuditLogItem {
  id: string;
  sequenceNumber: number;
  schemaVersion: number;
  timestamp: string;
  actorId: string | null;
  actorRole: string;
  actorName: string;
  action: string;
  targetEntity: string;
  targetId: string | null;
  previousHash: string;
  currentHash: string;
  signature: string;
  previousValues: string | null;
  newValues: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  reason: string | null;
}

interface AuditHealthData {
  chainIntegrity: {
    valid: boolean;
    totalRecordsChecked: number;
    genesisSequence: number;
    latestSequence: number;
    brokenSequence?: number;
    brokenEntityId?: string;
    error?: string;
    checkedAt: string;
  };
  outbox: {
    pendingCount: number;
    deliveredCount: number;
    failedCount: number;
    totalQueue: number;
  };
  sink: {
    providerType: "S3_R2_WORM" | "LOCAL_FALLBACK" | "NOT_CONFIGURED";
    isWormConfigured: boolean;
    bucket: string;
    objectLockEnabled: boolean;
  };
  security: {
    signingAlgorithm: string;
    hashAlgorithm: string;
    publicKey: string;
  };
  checkedAt: string;
}

export default function OwnerAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);

  // Health and verification state
  const [health, setHealth] = useState<AuditHealthData | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [flushing, setFlushing] = useState(false);
  const [flushMessage, setFlushMessage] = useState<string | null>(null);

  const loadLogs = async () => {
    setLoading(true);
    try {
      let url = "/api/owner/audit-logs?limit=150&";
      if (searchQuery) url += `query=${encodeURIComponent(searchQuery)}&`;
      if (actionFilter) url += `action=${encodeURIComponent(actionFilter)}&`;
      const res = await fetch(url);
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const checkHealth = async () => {
    setVerifying(true);
    try {
      const res = await fetch("/api/owner/audit-logs/health");
      const data = await res.json();
      if (res.ok) {
        setHealth(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setVerifying(false);
    }
  };

  const handleManualFlush = async () => {
    setFlushing(true);
    setFlushMessage(null);
    try {
      const res = await fetch("/api/owner/audit-logs/flush", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setFlushMessage(`Outbox flushed: ${data.processedCount} records dispatched.`);
        checkHealth();
        loadLogs();
      } else {
        setFlushMessage(`Flush failed: ${data.error}`);
      }
    } catch (err: any) {
      setFlushMessage(`Flush error: ${err.message}`);
    } finally {
      setFlushing(false);
    }
  };

  useEffect(() => {
    loadLogs();
    checkHealth();
  }, [actionFilter]);

  // Modal keyboard Escape listener (R-32)
  useEffect(() => {
    if (!selectedLog) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedLog(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedLog]);

  const isChainValid = health?.chainIntegrity.valid ?? true;

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
            Log Aktivitas Audit & Integritas Sistem
          </h1>
          <p className="text-xs text-neutral-500 mt-1">
            Catatan riwayat seluruh aktivitas operasional, penyesuaian gaji, dan pemantauan keamanan sistem.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <a
            href="/api/owner/audit-logs/export-signed"
            download
            className="apple-btn-secondary text-xs flex items-center gap-1.5"
            title="Unduh log audit bertanda tangan digital"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Ekspor Log Audit (.jsonl)</span>
          </a>

          <button
            onClick={checkHealth}
            disabled={verifying}
            className="apple-btn-secondary text-xs flex items-center gap-1.5"
            title="Verifikasi ulang rantai hash dan integritas data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${verifying ? "animate-spin" : ""}`} />
            <span>{verifying ? "Memverifikasi..." : "Verifikasi Integritas"}</span>
          </button>
        </div>
      </div>

      {/* Audit & Security Health Status Panel */}
      <div className="apple-card p-5 space-y-4 border border-neutral-200 dark:border-neutral-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
          <div className="flex items-center gap-2.5">
            {isChainValid ? (
              <div className="w-7 h-7 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4 stroke-[2]" />
              </div>
            ) : (
              <div className="w-7 h-7 rounded-full bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 stroke-[2]" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  Cryptographic Ledger Integrity:
                </h2>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase ${
                    isChainValid
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                      : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border border-red-300 dark:border-red-800"
                  }`}
                >
                  {isChainValid ? "VERIFIED INTACT" : "CHAIN BROKEN / TAMPERED"}
                </span>
              </div>
              <p className="text-[11px] text-neutral-500">
                {health?.chainIntegrity
                  ? `${health.chainIntegrity.totalRecordsChecked} records verified (Sequence #${health.chainIntegrity.genesisSequence} to #${health.chainIntegrity.latestSequence})`
                  : "Checking ledger continuity..."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleManualFlush}
              disabled={flushing || (health?.outbox.pendingCount ?? 0) === 0}
              className="apple-btn-primary text-xs flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{flushing ? "Flushing..." : "Flush Outbox Now"}</span>
            </button>
          </div>
        </div>

        {flushMessage && (
          <div className="p-2.5 rounded text-xs bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200">
            {flushMessage}
          </div>
        )}

        {/* 3-Column Health Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {/* Col 1: Hash Chain Continuity */}
          <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 space-y-1">
            <div className="text-[10px] uppercase font-semibold text-neutral-400 tracking-wider">
              Ledger Cryptography
            </div>
            <div className="font-medium text-neutral-800 dark:text-neutral-200">
              Ed25519 Signatures + SHA-256
            </div>
            <div className="text-[10px] text-neutral-500 font-mono truncate">
              Public Key: {health?.security.publicKey ? `${health.security.publicKey.slice(0, 24)}...` : "Loading..."}
            </div>
          </div>

          {/* Col 2: Transactional Outbox */}
          <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 space-y-1">
            <div className="text-[10px] uppercase font-semibold text-neutral-400 tracking-wider">
              Outbox Dispatch Queue
            </div>
            <div className="flex items-center gap-2 font-medium text-neutral-800 dark:text-neutral-200">
              <span>{health?.outbox.pendingCount ?? 0} Pending</span>
              <span className="text-neutral-400">•</span>
              <span className="text-emerald-600 dark:text-emerald-400">
                {health?.outbox.deliveredCount ?? 0} Delivered
              </span>
            </div>
            <div className="text-[10px] text-neutral-500">
              Scheduled via Vercel Cron (`*/10 * * * *`)
            </div>
          </div>

          {/* Col 3: External WORM Storage */}
          <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 space-y-1">
            <div className="text-[10px] uppercase font-semibold text-neutral-400 tracking-wider">
              Archive Storage Sink
            </div>
            <div className="font-medium text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-neutral-500" />
              <span>
                {health?.sink.providerType === "S3_R2_WORM"
                  ? "Cloudflare R2 / AWS S3"
                  : "Local Outbox Archive"}
              </span>
            </div>
            <div className="text-[10px] text-neutral-500">
              {health?.sink.isWormConfigured
                ? `WORM Lock: ${health.sink.objectLockEnabled ? "COMPLIANCE" : "Standard"}`
                : "Zero-cost local directory storage"}
            </div>
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-neutral-400" />
            <input
              type="text"
              placeholder="Search actor, reason, action..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadLogs()}
              className="apple-input text-xs pl-8 pr-3 py-1.5 w-full"
            />
          </div>

          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="apple-input text-xs py-1.5 w-auto"
          >
            <option value="">All Actions</option>
            <option value="CHEATING_ALERTS">Cheating Flags</option>
            <option value="WEBAUTHN_AUTHENTICATED">WebAuthn Logins</option>
            <option value="EMPLOYEE_DEVICE_REPLACEMENT_APPROVED">Device Replacements</option>
            <option value="EMPLOYEE_SALARY_CHANGED">Salary Revisions</option>
            <option value="DEVICE_LOGIN_BLOCKED">Device Lockouts</option>
            <option value="ATTENDANCE_CHECK_IN">Check-Ins</option>
          </select>
        </div>

        <button onClick={loadLogs} className="apple-btn-secondary text-xs py-1.5" title="Muat ulang log audit">
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Muat Ulang</span>
        </button>
      </div>

      {/* Logs Table */}
      <div className="apple-card overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-xs text-neutral-400">Memuat log audit...</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-xs text-neutral-400">
            Tidak ada catatan audit yang sesuai dengan kriteria pencarian.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60 text-neutral-500 font-medium">
                  <th className="py-3 px-3">No. Urut</th>
                  <th className="py-3 px-4">Waktu (WIB)</th>
                  <th className="py-3 px-4">Aktor</th>
                  <th className="py-3 px-4">Tindakan</th>
                  <th className="py-3 px-4">Target Entitas</th>
                  <th className="py-3 px-4">Hash Buku Besar</th>
                  <th className="py-3 px-4">Alasan / Rincian</th>
                  <th className="py-3 px-3 text-right">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {logs.map((log) => {
                  let badgeClass =
                    "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300";
                  if (log.action.startsWith("CHEATING_ALERT_"))
                    badgeClass =
                      "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200 border border-red-300 dark:border-red-800 font-semibold";
                  else if (log.action.includes("SALARY"))
                    badgeClass = "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300";
                  else if (log.action.includes("BLOCKED"))
                    badgeClass = "bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300";
                  else if (log.action.includes("WEBAUTHN") || log.action.includes("UNLOCKED"))
                    badgeClass =
                      "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300";

                  return (
                    <tr key={log.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/40">
                      <td className="py-3 px-3 font-mono font-bold text-neutral-700 dark:text-neutral-300">
                        #{log.sequenceNumber}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap text-neutral-500 font-mono text-[11px]">
                        {formatJakartaDateTime(log.timestamp)}
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-medium text-neutral-900 dark:text-neutral-100">
                          {log.actorName}
                        </div>
                        <div className="text-[10px] text-neutral-400">{log.actorRole}</div>
                      </td>

                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium font-mono ${badgeClass}`}>
                          {log.action}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-neutral-600 dark:text-neutral-400 font-mono text-[11px]">
                        {log.targetEntity} {log.targetId ? `(${log.targetId.substring(0, 8)})` : ""}
                      </td>

                      <td className="py-3 px-4 font-mono text-[10px] text-neutral-400 truncate max-w-[100px]">
                        {log.currentHash ? log.currentHash.substring(0, 10) : "N/A"}...
                      </td>

                      <td className="py-3 px-4 text-neutral-600 dark:text-neutral-400 max-w-[200px] truncate">
                        {log.reason || (log.newValues ? log.newValues.substring(0, 60) : "-")}
                      </td>

                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="apple-btn-secondary p-1.5 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
                          title="Inspect Cryptographic Entry"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Log Detail Drawer Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="apple-card max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-neutral-500" />
                <h3 className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
                  Audit Record #{selectedLog.sequenceNumber} (v{selectedLog.schemaVersion})
                </h3>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 p-3 bg-neutral-50 dark:bg-neutral-900/60 rounded-xl">
                <div>
                  <span className="text-neutral-400 block text-[10px] uppercase font-semibold">
                    Action
                  </span>
                  <span className="font-mono font-medium text-neutral-800 dark:text-neutral-200">
                    {selectedLog.action}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[10px] uppercase font-semibold">
                    Timestamp
                  </span>
                  <span className="font-mono text-neutral-800 dark:text-neutral-200">
                    {formatJakartaDateTime(selectedLog.timestamp)}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[10px] uppercase font-semibold">
                    Actor
                  </span>
                  <span className="text-neutral-800 dark:text-neutral-200">
                    {selectedLog.actorName} ({selectedLog.actorRole})
                  </span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[10px] uppercase font-semibold">
                    Target
                  </span>
                  <span className="font-mono text-neutral-800 dark:text-neutral-200">
                    {selectedLog.targetEntity} : {selectedLog.targetId || "N/A"}
                  </span>
                </div>
              </div>

              {/* Cryptographic Linkages */}
              <div className="p-3 bg-neutral-900 text-neutral-200 rounded-xl font-mono text-[11px] space-y-1.5 border border-neutral-700">
                <div className="text-[10px] uppercase font-semibold text-neutral-400 tracking-wider">
                  Cryptographic Hash Link & Digital Signature
                </div>
                <div className="truncate">
                  <span className="text-neutral-400">Previous Hash:</span> {selectedLog.previousHash}
                </div>
                <div className="truncate">
                  <span className="text-emerald-400">Current Hash:</span> {selectedLog.currentHash}
                </div>
                <div className="truncate">
                  <span className="text-blue-400">Ed25519 Sig:</span> {selectedLog.signature}
                </div>
              </div>

              {selectedLog.reason && (
                <div>
                  <span className="text-neutral-400 block text-[10px] uppercase font-semibold mb-1">
                    Reason / Note
                  </span>
                  <div className="p-2.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-medium">
                    {selectedLog.reason}
                  </div>
                </div>
              )}

              {selectedLog.previousValues && (
                <div>
                  <span className="text-neutral-400 block text-[10px] uppercase font-semibold mb-1">
                    Previous Values Snapshot
                  </span>
                  <pre className="p-2.5 rounded-lg bg-neutral-100 dark:bg-neutral-900 font-mono text-[11px] text-neutral-700 dark:text-neutral-300 overflow-x-auto">
                    {JSON.stringify(JSON.parse(selectedLog.previousValues), null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.newValues && (
                <div>
                  <span className="text-neutral-400 block text-[10px] uppercase font-semibold mb-1">
                    New Values Snapshot
                  </span>
                  <pre className="p-2.5 rounded-lg bg-neutral-100 dark:bg-neutral-900 font-mono text-[11px] text-neutral-700 dark:text-neutral-300 overflow-x-auto">
                    {JSON.stringify(JSON.parse(selectedLog.newValues), null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button onClick={() => setSelectedLog(null)} className="apple-btn-secondary text-xs">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
