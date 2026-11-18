"use client";

import React, { useState, useEffect } from "react";
import { formatIDR } from "@/lib/utils";
import { formatJakartaDateTime } from "@/lib/timezone";
import { Edit2, CheckCircle2, AlertCircle, Users, FileText } from "lucide-react";
import EmployeeAttendanceRoster from "@/components/owner/EmployeeAttendanceRoster";

interface AttendanceItem {
  id: string;
  shiftDate: string;
  checkInTime: string;
  checkOutTime: string | null;
  scheduledStartTime: string;
  scheduledEndTime: string;
  status: string;
  lateMinutes: number;
  dailySalarySnapshot: number;
  lateDeduction: number;
  netDailyEarnings: number;
  manualCorrectionNote: string | null;
  employee: {
    fullName: string;
    employeeId: string;
    dailySalary: number;
  };
  shift: {
    name: string;
    startTime: string;
    endTime: string;
    gracePeriodMinutes: number;
  };
}

export default function OwnerAttendancePage() {
  const [activeTab, setActiveTab] = useState<"ROSTER" | "LOGS">("ROSTER");
  const [records, setRecords] = useState<AttendanceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Filters
  const [filterDate, setFilterDate] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // Correction Modal
  const [correctingRecord, setCorrectingRecord] = useState<AttendanceItem | null>(null);
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctedStatus, setCorrectedStatus] = useState("COMPLETED");

  const loadAttendance = async () => {
    try {
      let url = "/api/owner/attendance?";
      if (filterDate) url += `shiftDate=${filterDate}&`;
      if (filterStatus) url += `status=${filterStatus}&`;
      const res = await fetch(url);
      const data = await res.json();
      setRecords(data.records || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAttendance();
  }, [filterDate, filterStatus]);

  // Modal keyboard Escape listener (R-32)
  useEffect(() => {
    if (!correctingRecord) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setCorrectingRecord(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [correctingRecord]);

  const handleManualCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctingRecord || !correctionReason.trim()) return;

    try {
      const res = await fetch("/api/owner/attendance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId: correctingRecord.id,
          status: correctedStatus,
          correctionReason: correctionReason.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setMessage({ text: data.message, type: "success" });
      setCorrectingRecord(null);
      setCorrectionReason("");
      loadAttendance();
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Title & Tab Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
            Attendance &amp; Absence Management
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Breakdown performa kehadiran per karyawan, keterlambatan, alpa, dan log presensi mentah.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="inline-flex hig-segmented p-1 text-xs font-medium self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab("ROSTER")}
            className={`min-h-[44px] flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-md transition-colors ${
              activeTab === "ROSTER"
                ? "bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-50 shadow-xs font-semibold"
                : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Rekap &amp; Alpa Karyawan</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("LOGS")}
            className={`min-h-[44px] flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-md transition-colors ${
              activeTab === "LOGS"
                ? "bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-50 shadow-xs font-semibold"
                : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Log Presensi Mentah</span>
          </button>
        </div>
      </div>

      {activeTab === "ROSTER" ? (
        <EmployeeAttendanceRoster />
      ) : (
        <>
          {/* Filters for Raw Logs */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs liquid-glass p-3 rounded-2xl">
            <span className="text-neutral-500 dark:text-neutral-400 font-medium">Filter Log Presensi:</span>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="hig-input py-1 px-2.5 w-auto"
              />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="hig-input py-1 px-2.5 w-auto"
              >
                <option value="">All Statuses</option>
                <option value="CHECKED_IN">In Progress (Checked In)</option>
                <option value="COMPLETED">Completed (On-Time)</option>
                <option value="LATE_COMPLETED">Completed (Late)</option>
                <option value="EXCEPTION">Exception</option>
              </select>
              {(filterDate || filterStatus) && (
                <button
                  onClick={() => {
                    setFilterDate("");
                    setFilterStatus("");
                  }}
                  className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline text-xs"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

      {message && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
            message.type === "success"
              ? "bg-[var(--system-green-tint)] text-[var(--system-green)]"
              : "bg-[var(--system-red-tint)] text-[var(--system-red)]"
          }`}
        >
          {message.type === "success" ? <CheckCircle2 className="w-4 h-4 stroke-[2]" /> : <AlertCircle className="w-4 h-4 stroke-[2]" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Attendance Table */}
      <div className="hig-card overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-xs text-[var(--text-tertiary)]">Loading attendance ledger...</div>
        ) : records.length === 0 ? (
          <div className="text-center py-12 text-xs text-[var(--text-tertiary)]">No attendance records found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="hig-table">
              <thead>
                <tr>
                  <th>Shift Date</th>
                  <th>Employee</th>
                  <th>Shift</th>
                  <th>Check-In</th>
                  <th>Check-Out</th>
                  <th>Lateness</th>
                  <th>Daily Salary</th>
                  <th>Deduction</th>
                  <th>Net Earned</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody className="tabular-numbers">
                {records.map((r) => {
                  const isCompleted = r.status === "COMPLETED" || r.status === "LATE_COMPLETED";
                  return (
                    <tr key={r.id}>
                      <td className="font-mono text-xs">{r.shiftDate}</td>
                      <td>
                        <div className="font-medium text-[var(--text-primary)]">{r.employee.fullName}</div>
                        <div className="text-[10px] text-[var(--text-tertiary)] font-mono">{r.employee.employeeId}</div>
                      </td>
                      <td className="text-[var(--text-secondary)]">
                        {r.shift.name}
                      </td>
                      <td className="font-mono text-xs">
                        {formatJakartaDateTime(r.checkInTime).split(", ")[1] || formatJakartaDateTime(r.checkInTime)}
                      </td>
                      <td className="font-mono text-xs">
                        {r.checkOutTime ? (
                          formatJakartaDateTime(r.checkOutTime).split(", ")[1] || formatJakartaDateTime(r.checkOutTime)
                        ) : (
                          <span className="text-[var(--system-orange)] font-medium">In Progress</span>
                        )}
                      </td>
                      <td>
                        {r.lateMinutes > 0 ? (
                          <span className="hig-badge hig-badge-red">{r.lateMinutes}m late</span>
                        ) : (
                          <span className="hig-badge hig-badge-green">On Time</span>
                        )}
                      </td>
                      <td>{formatIDR(r.dailySalarySnapshot)}</td>
                      <td className="text-[var(--system-red)] font-medium">
                        {r.lateDeduction > 0 ? `-${formatIDR(r.lateDeduction)}` : "Rp0"}
                      </td>
                      <td className="font-semibold text-[var(--system-green)]">
                        {isCompleted ? formatIDR(r.netDailyEarnings) : "--"}
                      </td>
                      <td className="text-right">
                        <button
                          onClick={() => {
                            setCorrectingRecord(r);
                            setCorrectedStatus(r.status);
                            setCorrectionReason("");
                          }}
                          className="hig-button-secondary text-[11px] py-1 px-2.5"
                          title="Manual attendance correction with mandatory audit reason"
                        >
                          <Edit2 className="w-3 h-3 stroke-[2]" />
                          Correct
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
        </>
      )}

      {/* Manual Correction Modal */}
      {correctingRecord && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="hig-card-elevated max-w-sm w-full p-6 animate-in fade-in zoom-in-95">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Manual Correction</h2>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              Owner override. Requires a mandatory audit reason.
            </p>

            <form onSubmit={handleManualCorrection} className="space-y-3">
              <div className="bg-[var(--separator-subtle)] p-2.5 rounded-lg text-xs">
                <span className="text-[var(--text-secondary)]">Employee:</span>
                <div className="font-semibold text-[var(--text-primary)]">
                  {correctingRecord.employee.fullName} ({correctingRecord.shiftDate})
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Status Override</label>
                <select
                  value={correctedStatus}
                  onChange={(e) => setCorrectedStatus(e.target.value)}
                  className="hig-input"
                >
                  <option value="COMPLETED">COMPLETED (Pardon / Waive Lateness)</option>
                  <option value="LATE_COMPLETED">LATE_COMPLETED (Keep Deduction)</option>
                  <option value="EXCEPTION">EXCEPTION</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  Mandatory Correction Reason
                </label>
                <textarea
                  required
                  rows={3}
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  placeholder="Reason for manual adjustment..."
                  className="hig-input"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--separator-subtle)]">
                <button
                  type="button"
                  onClick={() => setCorrectingRecord(null)}
                  className="hig-button-secondary text-xs"
                >
                  Cancel
                </button>
                <button type="submit" className="hig-button-primary text-xs">
                  Save Correction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
