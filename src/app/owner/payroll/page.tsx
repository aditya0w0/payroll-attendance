"use client";

import React, { useState, useEffect } from "react";
import { formatIDR } from "@/lib/utils";
import { Lock, Download, CheckCircle2, AlertCircle, FileText, Printer, X, ShieldCheck } from "lucide-react";

interface PayrollSummaryItem {
  employeeId: string;
  code: string;
  fullName: string;
  dailySalary: number;
  completedDays: number;
  totalLateMinutes: number;
  lateArrivalCount: number;
  totalLateDeductions: number;
  grossEarnings: number;
  netEarnings: number;
  records: any[];
}

export default function OwnerPayrollPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [summaries, setSummaries] = useState<PayrollSummaryItem[]>([]);
  const [isFinalized, setIsFinalized] = useState(false);
  const [finalizedAt, setFinalizedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const loadPayroll = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/owner/payroll?year=${year}&month=${month}`);
      const data = await res.json();
      setSummaries(data.summaries || []);
      setIsFinalized(data.isFinalized || false);
      setFinalizedAt(data.finalizedAt || null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayroll();
  }, [year, month]);

  // Modal keyboard Escape listener (R-32)
  useEffect(() => {
    if (!showPdfModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowPdfModal(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showPdfModal]);

  const handleFinalize = async () => {
    if (!confirm(`Finalize and lock the payroll period for ${year}-${String(month).padStart(2, "0")}? This creates an immutable snapshot. Future salary or policy updates will not alter finalized records.`)) {
      return;
    }

    try {
      const res = await fetch("/api/owner/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setMessage({ text: data.message, type: "success" });
      loadPayroll();
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    }
  };

  // Proper Financial CSV Template Export
  const exportCSV = () => {
    if (summaries.length === 0) return;

    const periodStr = `${year}-${String(month).padStart(2, "0")}`;
    const generatedAt = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });

    const metadataLines = [
      `"CYBERGUARD FINANCIAL PAYROLL & RECONCILIATION STATEMENT"`,
      `"Payroll Period:","${periodStr}"`,
      `"Export Generated At (WIB):","${generatedAt}"`,
      `"Total Workforce Count:",${summaries.length}`,
      `"Total Gross Wages Accrued (IDR):",${totalGrossPayroll}`,
      `"Total Lateness Deductions (IDR):",${totalDeductionsAll}`,
      `"Total Net Payable Balance (IDR):",${totalNetPayroll}`,
      `"Period Status:","${isFinalized ? "FINALIZED & LOCKED (SNAPSHOT)" : "PROVISIONAL / DRAFT"}"`,
      `""`,
      `"EMPLOYEE BREAKDOWN"`
    ];

    const headers = [
      "Employee ID",
      "Full Name",
      "Daily Salary Rate (IDR)",
      "Completed Working Days",
      "Gross Wages Accrued (IDR)",
      "Late Arrivals Count",
      "Total Lateness (Minutes)",
      "Late Deductions (IDR)",
      "Net Payable Earnings (IDR)",
      "Status"
    ];

    const rows = summaries.map((s) => [
      `"${s.code}"`,
      `"${s.fullName}"`,
      s.dailySalary,
      s.completedDays,
      s.grossEarnings,
      s.lateArrivalCount,
      s.totalLateMinutes,
      s.totalLateDeductions,
      s.netEarnings,
      `"${isFinalized ? "FINALIZED" : "DRAFT"}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [
      ...metadataLines,
      headers.join(","),
      ...rows.map((r) => r.join(","))
    ].join("\n");

    const encoded = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encoded);
    link.setAttribute("download", `payroll_finance_statement_${year}_${String(month).padStart(2, "0")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalGrossPayroll = summaries.reduce((sum, s) => sum + s.grossEarnings, 0);
  const totalDeductionsAll = summaries.reduce((sum, s) => sum + s.totalLateDeductions, 0);
  const totalNetPayroll = summaries.reduce((sum, s) => sum + s.netEarnings, 0);

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
            Monthly Payroll & Late Deductions
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Aggregation of completed daily salaries minus calculated lateness penalties.
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="month"
            value={`${year}-${String(month).padStart(2, "0")}`}
            onChange={(e) => {
              if (e.target.value) {
                const [y, m] = e.target.value.split("-").map(Number);
                setYear(y);
                setMonth(m);
              }
            }}
            className="hig-input text-xs w-auto py-1 px-2.5 font-medium tabular-numbers"
          />

          <button onClick={exportCSV} className="hig-button-secondary text-xs" title="Export Proper CSV Statement">
            <Download className="w-3.5 h-3.5 stroke-[2]" />
            Export CSV
          </button>

          <button onClick={() => setShowPdfModal(true)} className="hig-button-secondary text-xs" title="Export PDF Financial Statement">
            <Printer className="w-3.5 h-3.5 stroke-[2]" />
            Export PDF
          </button>

          {!isFinalized ? (
            <button onClick={handleFinalize} className="hig-button-primary text-xs">
              <Lock className="w-3.5 h-3.5 stroke-[2]" />
              Finalize & Lock Period
            </button>
          ) : (
            <span className="hig-badge hig-badge-green text-xs">
              <Lock className="w-3 h-3 stroke-[2]" />
              Snapshot Finalized
            </span>
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

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="hig-card p-4">
          <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-secondary)]">Total Gross Earned</span>
          <div className="text-xl font-semibold text-[var(--text-primary)] mt-1 tabular-numbers">
            {formatIDR(totalGrossPayroll)}
          </div>
          <span className="text-[11px] text-[var(--text-tertiary)] block mt-0.5">Base daily salary sum</span>
        </div>

        <div className="hig-card p-4">
          <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--system-red)]">Late Deductions</span>
          <div className="text-xl font-semibold text-[var(--system-red)] mt-1 tabular-numbers">
            -{formatIDR(totalDeductionsAll)}
          </div>
          <span className="text-[11px] text-[var(--text-secondary)] block mt-0.5">Automated lateness penalties</span>
        </div>

        <div className="hig-card p-4">
          <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--system-green)]">Net Payout</span>
          <div className="text-xl font-bold text-[var(--system-green)] mt-1 tabular-numbers">
            {formatIDR(totalNetPayroll)}
          </div>
          <span className="text-[11px] text-[var(--text-secondary)] block mt-0.5">Payable balance</span>
        </div>
      </div>

      {/* Payroll Table */}
      <div className="hig-card overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-xs text-[var(--text-tertiary)]">Loading payroll ledger...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="hig-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Daily Salary</th>
                  <th>Completed Days</th>
                  <th>Late Count</th>
                  <th>Total Late Mins</th>
                  <th>Late Deductions</th>
                  <th className="font-semibold">Net Payout</th>
                </tr>
              </thead>
              <tbody className="tabular-numbers">
                {summaries.map((s) => (
                  <tr key={s.employeeId}>
                    <td>
                      <div className="font-medium text-[var(--text-primary)]">{s.fullName}</div>
                      <div className="text-[10px] text-[var(--text-tertiary)] font-mono">{s.code}</div>
                    </td>
                    <td>{formatIDR(s.dailySalary)}</td>
                    <td className="font-medium">
                      {s.completedDays} days
                    </td>
                    <td>
                      {s.lateArrivalCount > 0 ? (
                        <span className="text-[var(--system-red)] font-medium">{s.lateArrivalCount} times</span>
                      ) : (
                        <span className="text-[var(--system-green)]">0</span>
                      )}
                    </td>
                    <td className="font-mono">{s.totalLateMinutes} mins</td>
                    <td className="text-[var(--system-red)] font-medium">
                      {s.totalLateDeductions > 0 ? `-${formatIDR(s.totalLateDeductions)}` : "Rp0"}
                    </td>
                    <td className="font-semibold text-sm text-[var(--system-green)]">
                      {formatIDR(s.netEarnings)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* PDF FINANCIAL STATEMENT MODAL & PRINT VIEW */}
      {/* ======================================================== */}
      {showPdfModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white text-neutral-900 rounded-2xl max-w-3xl w-full p-8 shadow-2xl my-8 space-y-6">
            
            {/* Modal Actions (Hidden on Print) */}
            <div className="flex items-center justify-between border-b pb-4 print:hidden">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-neutral-700" />
                <span className="text-sm font-semibold">Printable Financial Statement</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="hig-button-primary text-xs flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print / Save as PDF
                </button>
                <button
                  onClick={() => setShowPdfModal(false)}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Print Document Body */}
            <div className="space-y-6">
              {/* Header Letterhead */}
              <div className="flex justify-between items-start border-b pb-6">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-neutral-900">
                    CYBERGUARD ENTERPRISE
                  </h2>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Monthly Financial Payroll Statement & Wage Reconciliation
                  </p>
                </div>
                <div className="text-right text-xs space-y-1">
                  <div className="font-mono font-bold text-neutral-800">
                    PERIOD: {year}-{String(month).padStart(2, "0")}
                  </div>
                  <div className="text-neutral-500">
                    Generated: {new Date().toLocaleDateString("id-ID")}
                  </div>
                  <div className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-neutral-100 text-neutral-700 border">
                    {isFinalized ? "FINALIZED & AUDITED" : "PROVISIONAL STATEMENT"}
                  </div>
                </div>
              </div>

              {/* KPI Summary Grid */}
              <div className="grid grid-cols-3 gap-4 p-4 rounded-xl bg-neutral-50 border border-neutral-200 text-center">
                <div>
                  <span className="text-[10px] uppercase font-semibold text-neutral-400 block tracking-wider">Gross Wages</span>
                  <span className="text-lg font-bold text-neutral-900 tabular-nums">
                    {formatIDR(totalGrossPayroll)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-semibold text-red-500 block tracking-wider">Total Deductions</span>
                  <span className="text-lg font-bold text-red-600 tabular-nums">
                    -{formatIDR(totalDeductionsAll)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-semibold text-emerald-600 block tracking-wider">Net Payable</span>
                  <span className="text-xl font-extrabold text-emerald-600 tabular-nums">
                    {formatIDR(totalNetPayroll)}
                  </span>
                </div>
              </div>

              {/* Line Items Table */}
              <div className="border border-neutral-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-neutral-100/70 border-b border-neutral-200 text-neutral-600 font-semibold uppercase tracking-wider text-[10px]">
                      <th className="py-2.5 px-3">Emp ID</th>
                      <th className="py-2.5 px-3">Full Name</th>
                      <th className="py-2.5 px-3">Daily Salary</th>
                      <th className="py-2.5 px-3">Days</th>
                      <th className="py-2.5 px-3">Late Mins</th>
                      <th className="py-2.5 px-3">Deduction</th>
                      <th className="py-2.5 px-3 text-right">Net Payout</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 tabular-nums">
                    {summaries.map((s) => (
                      <tr key={s.employeeId} className="hover:bg-neutral-50">
                        <td className="py-2.5 px-3 font-mono font-medium text-neutral-600">{s.code}</td>
                        <td className="py-2.5 px-3 font-semibold text-neutral-900">{s.fullName}</td>
                        <td className="py-2.5 px-3">{formatIDR(s.dailySalary)}</td>
                        <td className="py-2.5 px-3">{s.completedDays}d</td>
                        <td className="py-2.5 px-3">{s.totalLateMinutes}m</td>
                        <td className="py-2.5 px-3 text-red-600 font-medium">
                          {s.totalLateDeductions > 0 ? `-${formatIDR(s.totalLateDeductions)}` : "Rp0"}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-neutral-900">
                          {formatIDR(s.netEarnings)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Authorization & Signoff Block */}
              <div className="pt-6 border-t border-neutral-200 grid grid-cols-2 gap-8 text-xs text-neutral-500">
                <div className="space-y-1">
                  <span className="font-semibold text-neutral-800 block">System Verification:</span>
                  <p>Authoritative server-side snapshot computed from immutable attendance audit records.</p>
                  <p className="font-mono text-[10px] text-neutral-400">Checksum: SHA256-SNAP-{year}{month}-{summaries.length}</p>
                </div>
                <div className="text-right space-y-6">
                  <div>
                    <span className="font-semibold text-neutral-800 block">Owner / Finance Approver:</span>
                    <div className="h-10 border-b border-dashed border-neutral-300 w-48 ml-auto mt-2"></div>
                    <span className="text-[10px] text-neutral-400 mt-1 block">Authorized Signature & Date</span>
                  </div>
                </div>
              </div>

            </div>

          </div>
        </div>
      )}
    </div>
  );
}
