"use client";

import React, { useState, useEffect } from "react";
import { formatJakartaDateTime } from "@/lib/timezone";
import { ShieldCheck, Search, RefreshCw, Eye, X, Terminal, Filter } from "lucide-react";

interface AuditLogItem {
  id: string;
  timestamp: string;
  actorId: string | null;
  actorRole: string;
  actorName: string;
  action: string;
  targetEntity: string;
  targetId: string | null;
  previousValues: string | null;
  newValues: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  reason: string | null;
}

export default function OwnerAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);

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

  useEffect(() => {
    loadLogs();
  }, [actionFilter]);

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
              Audit Activity Log
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
              Zero-Trust Append-Only
            </span>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Authoritative append-only ledger tracking all administrative actions, wage revisions, and security events.
          </p>
        </div>

        {/* Search & Actions */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-neutral-400" />
            <input
              type="text"
              placeholder="Search audit trail..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadLogs()}
              className="apple-input text-xs pl-8 pr-3 py-1.5 w-48 sm:w-60"
            />
          </div>

          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="apple-input text-xs py-1.5 w-auto"
          >
            <option value="">All Actions</option>
            <option value="CHEATING_ALERTS">Flagged Cheating Attempts</option>
            <option value="EMPLOYEE_SALARY_CHANGED">Salary Revisions</option>
            <option value="ATTENDANCE_CHECK_IN_LATE">Late Check-ins</option>
            <option value="DEVICE_LOGIN_BLOCKED">Device Lockouts</option>
            <option value="DEVICE_UNLOCKED_AND_REBOUND">Device Unlocks</option>
            <option value="ATTENDANCE_MANUALLY_CORRECTED">Manual Corrections</option>
            <option value="PAYROLL_PERIOD_FINALIZED">Payroll Finalization</option>
          </select>

          <button onClick={loadLogs} className="apple-btn-secondary text-xs p-2" title="Reload Logs">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="apple-card overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-xs text-neutral-400">Loading audit records...</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-xs text-neutral-400">No audit records found matching criteria.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60 text-neutral-500">
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider">Timestamp (WIB)</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider">Actor</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider">Action</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider">Target Entity</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider">IP Address</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider">Reason / Note</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {logs.map((log) => {
                  let badgeClass = "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300";
                  if (log.action.startsWith("CHEATING_ALERT_")) badgeClass = "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200 border border-red-300 dark:border-red-800 font-semibold";
                  else if (log.action.includes("SALARY")) badgeClass = "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300";
                  else if (log.action.includes("BLOCKED")) badgeClass = "bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300";
                  else if (log.action.includes("UNLOCKED")) badgeClass = "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300";

                  return (
                    <tr key={log.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/40">
                      <td className="py-3 px-4 whitespace-nowrap text-neutral-500 font-mono text-[11px]">
                        {formatJakartaDateTime(log.timestamp)}
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-medium text-neutral-900 dark:text-neutral-100">{log.actorName}</div>
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

                      <td className="py-3 px-4 text-neutral-500 font-mono text-[11px]">{log.ipAddress || "--"}</td>

                      <td className="py-3 px-4 text-neutral-500 max-w-xs truncate" title={log.reason || ""}>
                        {log.reason || "--"}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="apple-btn-secondary text-[11px] px-2.5 py-1"
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          View
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

      {/* Detail Diff Modal Sheet */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="apple-card max-w-lg w-full p-6 animate-in fade-in zoom-in-95 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-neutral-500" />
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  Audit Event #{selectedLog.id.substring(0, 8)}
                </h2>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs pt-4">
              <div>
                <span className="text-[10px] uppercase font-semibold text-neutral-400 block mb-0.5">Action Event</span>
                <div className="font-mono font-medium text-neutral-900 dark:text-neutral-100">{selectedLog.action}</div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-neutral-600 dark:text-neutral-400">
                <div>
                  <span className="text-[10px] uppercase font-semibold text-neutral-400 block mb-0.5">Actor</span>
                  <span className="font-medium text-neutral-900 dark:text-neutral-100">{selectedLog.actorName}</span> ({selectedLog.actorRole})
                </div>
                <div>
                  <span className="text-[10px] uppercase font-semibold text-neutral-400 block mb-0.5">Recorded Time</span>
                  <span className="font-mono text-neutral-800 dark:text-neutral-200">{formatJakartaDateTime(selectedLog.timestamp)}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-semibold text-neutral-400 block mb-0.5">Network Origin</span>
                  <span className="font-mono text-neutral-800 dark:text-neutral-200">{selectedLog.ipAddress || "Internal"}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-semibold text-neutral-400 block mb-0.5">Target Entity</span>
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">{selectedLog.targetEntity}</span>
                </div>
              </div>

              {selectedLog.reason && (
                <div className="p-3 rounded-lg bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700">
                  <span className="text-[10px] font-semibold text-neutral-500 uppercase block mb-1">Administrative Reason:</span>
                  <p className="text-neutral-900 dark:text-neutral-100 leading-relaxed">{selectedLog.reason}</p>
                </div>
              )}

              {selectedLog.previousValues && (
                <div>
                  <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider block mb-1">
                    Previous State
                  </span>
                  <pre className="p-3 rounded-lg bg-neutral-950 text-red-300 font-mono text-[11px] overflow-x-auto border border-neutral-800">
                    {typeof selectedLog.previousValues === "string"
                      ? selectedLog.previousValues
                      : JSON.stringify(selectedLog.previousValues, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.newValues && (
                <div>
                  <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider block mb-1">
                    New State (Applied)
                  </span>
                  <pre className="p-3 rounded-lg bg-neutral-950 text-emerald-300 font-mono text-[11px] overflow-x-auto border border-neutral-800">
                    {typeof selectedLog.newValues === "string"
                      ? selectedLog.newValues
                      : JSON.stringify(selectedLog.newValues, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-4 border-t border-neutral-200 dark:border-neutral-800 mt-4">
              <button onClick={() => setSelectedLog(null)} className="apple-btn-secondary text-xs px-4 py-1.5">
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
