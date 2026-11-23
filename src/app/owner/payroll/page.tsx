"use client";

import React, { useState, useEffect } from "react";
import { formatIDR, angkaKeTerbilang } from "@/lib/utils";
import { Lock, Download, CheckCircle2, AlertCircle, FileText, Printer, X, ShieldCheck } from "lucide-react";

const MONTH_NAMES_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

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
  const [selectedSlipEmployee, setSelectedSlipEmployee] = useState<PayrollSummaryItem | null>(null);
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
    if (!showPdfModal && !selectedSlipEmployee) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowPdfModal(false);
        setSelectedSlipEmployee(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showPdfModal, selectedSlipEmployee]);

  const handleFinalize = async () => {
    if (!confirm(`Kunci dan finalisasi periode penggajian ${year}-${String(month).padStart(2, "0")}? Rekapitulasi akan disimpan permanen sebagai snapshot historis.`)) {
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
      `"Laporan Rekapitulasi Presensi & Penggajian - CyberGuard"`,
      `"Periode Penggajian:","${periodStr}"`,
      `"Waktu Ekspor (WIB):","${generatedAt}"`,
      `"Jumlah Karyawan:",${summaries.length}`,
      `"Total Gaji Kotor (IDR):",${totalGrossPayroll}`,
      `"Total Potongan Keterlambatan (IDR):",${totalDeductionsAll}`,
      `"Total Gaji Bersih (IDR):",${totalNetPayroll}`,
      `"Status Periode:","${isFinalized ? "Final (Snapshot Terkunci)" : "Berjalan (Draft)"}"`,
      `""`,
      `"Rincian Gaji Karyawan"`
    ];

    const headers = [
      "ID Karyawan",
      "Nama Lengkap",
      "Gaji Pokok Harian (IDR)",
      "Hari Kerja Selesai",
      "Gaji Kotor (IDR)",
      "Frekuensi Terlambat",
      "Total Keterlambatan (Menit)",
      "Potongan Denda (IDR)",
      "Gaji Bersih Diterima (IDR)",
      "Status"
    ];

    const sanitizeCsvCell = (value: string | number) => {
      const str = String(value ?? "");
      const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
      return `"${safe.replace(/"/g, '""')}"`;
    };

    const rows = summaries.map((s) => [
      sanitizeCsvCell(s.code),
      sanitizeCsvCell(s.fullName),
      s.dailySalary,
      s.completedDays,
      s.grossEarnings,
      s.lateArrivalCount,
      s.totalLateMinutes,
      s.totalLateDeductions,
      s.netEarnings,
      sanitizeCsvCell(isFinalized ? "FINALIZED" : "DRAFT"),
    ]);

    const csvContent = [
      ...metadataLines,
      headers.join(","),
      ...rows.map((r) => r.join(","))
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `payroll_finance_statement_${year}_${String(month).padStart(2, "0")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const totalGrossPayroll = summaries.reduce((sum, s) => sum + s.grossEarnings, 0);
  const totalDeductionsAll = summaries.reduce((sum, s) => sum + s.totalLateDeductions, 0);
  const totalNetPayroll = summaries.reduce((sum, s) => sum + s.netEarnings, 0);

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
              Penggajian Bulanan
            </h1>
            <span className="hig-badge hig-badge-neutral text-xs font-semibold px-2.5 py-0.5">
              {summaries.length} karyawan
            </span>
          </div>
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

          <button onClick={exportCSV} className="hig-button-secondary text-xs" title="Ekspor laporan CSV">
            <Download className="w-3.5 h-3.5 stroke-[2]" />
            Ekspor CSV
          </button>

          <button
            onClick={() => setShowPdfModal(true)}
            className="hig-button-secondary text-xs flex items-center gap-1.5"
            title="Cetak lembar rekapitulasi penggajian seluruh karyawan"
          >
            <Printer className="w-3.5 h-3.5 stroke-[2]" />
            <span>Cetak Rekap Gaji (PDF)</span>
          </button>

          {!isFinalized ? (
            <button onClick={handleFinalize} className="hig-button-primary text-xs">
              <Lock className="w-3.5 h-3.5 stroke-[2]" />
              Kunci Periode
            </button>
          ) : (
            <span className="hig-badge hig-badge-green text-xs">
              <Lock className="w-3 h-3 stroke-[2]" />
              Periode Terkunci
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
          <span className="text-[11px] font-medium text-[var(--text-secondary)]">Total Gaji Kotor</span>
          <div className="text-xl font-semibold text-[var(--text-primary)] mt-1 tabular-numbers">
            {formatIDR(totalGrossPayroll)}
          </div>
        </div>

        <div className="hig-card p-4">
          <span className="text-[11px] font-medium text-[var(--system-red)]">Total Potongan Denda</span>
          <div className="text-xl font-semibold text-[var(--system-red)] mt-1 tabular-numbers">
            -{formatIDR(totalDeductionsAll)}
          </div>
        </div>

        <div className="hig-card p-4">
          <span className="text-[11px] font-medium text-[var(--system-green)]">Total Gaji Bersih</span>
          <div className="text-xl font-bold text-[var(--system-green)] mt-1 tabular-numbers">
            {formatIDR(totalNetPayroll)}
          </div>
        </div>
      </div>

      {/* Payroll Table */}
      <div className="hig-card overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-xs text-[var(--text-tertiary)]">Memuat rekapitulasi penggajian...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="hig-table">
              <thead>
                <tr>
                  <th>Karyawan</th>
                  <th>Gaji Harian</th>
                  <th>Hari Kerja</th>
                  <th>Terlambat</th>
                  <th>Total Menit</th>
                  <th>Potongan</th>
                  <th className="font-semibold text-right">Gaji Bersih</th>
                  <th className="text-right">Slip Gaji</th>
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
                      {s.completedDays}
                    </td>
                    <td>
                      {s.lateArrivalCount > 0 ? (
                        <span className="text-[var(--system-red)] font-medium">{s.lateArrivalCount}x</span>
                      ) : (
                        <span className="text-[var(--system-green)]">0</span>
                      )}
                    </td>
                    <td className="font-mono">{s.totalLateMinutes}m</td>
                    <td className="text-[var(--system-red)] font-medium">
                      {s.totalLateDeductions > 0 ? `-${formatIDR(s.totalLateDeductions)}` : "Rp0"}
                    </td>
                    <td className="font-semibold text-sm text-[var(--system-green)] text-right">
                      {formatIDR(s.netEarnings)}
                    </td>
                    <td className="text-right">
                      <button
                        onClick={() => setSelectedSlipEmployee(s)}
                        className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline py-1 px-1.5 transition-colors inline-flex items-center gap-1"
                        title={`Lihat Slip Gaji Resmi untuk ${s.fullName}`}
                      >
                        <FileText className="w-3 h-3 stroke-[2]" />
                        <span>Slip Gaji</span>
                      </button>
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
                <span className="text-sm font-semibold">Lembar Rekapitulasi Penggajian Resmi</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="hig-button-primary text-xs flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Cetak / Simpan PDF
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
                  <h2 className="text-lg font-semibold tracking-tight text-neutral-900">
                    Laporan Rekapitulasi Penggajian &amp; Upah
                  </h2>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Periode: {year}-{String(month).padStart(2, "0")} • Diterbitkan: {new Date().toLocaleDateString("id-ID")}
                  </p>
                </div>
                <div className="text-right text-xs">
                  <span className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-medium border ${
                    isFinalized
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-neutral-100 text-neutral-700 border-neutral-200"
                  }`}>
                    {isFinalized ? "Final (Snapshot Terkunci)" : "Draf Sementara"}
                  </span>
                </div>
              </div>

              {/* Formal Accounting Ledger Summary */}
              <div className="border border-neutral-300 rounded-lg p-4 bg-neutral-50/70 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 divide-y sm:divide-y-0 sm:divide-x divide-neutral-200">
                  <div className="sm:pr-3">
                    <span className="text-[11px] text-neutral-500 block">Total Gaji Pokok Kotor</span>
                    <span className="text-sm font-semibold text-neutral-900 font-mono mt-0.5 block">
                      {formatIDR(totalGrossPayroll)}
                    </span>
                  </div>
                  <div className="pt-2 sm:pt-0 sm:px-3">
                    <span className="text-[11px] text-neutral-500 block">Total Potongan Keterlambatan</span>
                    <span className="text-sm font-semibold text-neutral-900 font-mono mt-0.5 block">
                      {totalDeductionsAll > 0 ? `-${formatIDR(totalDeductionsAll)}` : "Rp0"}
                    </span>
                  </div>
                  <div className="pt-2 sm:pt-0 sm:pl-3">
                    <span className="text-[11px] text-neutral-700 font-medium block">Total Pembayaran Gaji Bersih</span>
                    <span className="text-sm font-bold text-neutral-900 font-mono mt-0.5 block">
                      {formatIDR(totalNetPayroll)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Line Items Table */}
              <div className="border border-neutral-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-neutral-100/70 border-b border-neutral-200 text-neutral-600 font-semibold text-[10px]">
                      <th className="py-2.5 px-3">ID Karyawan</th>
                      <th className="py-2.5 px-3">Nama Lengkap</th>
                      <th className="py-2.5 px-3">Gaji Harian</th>
                      <th className="py-2.5 px-3 text-center">Hari Kerja</th>
                      <th className="py-2.5 px-3 text-center">Keterlambatan</th>
                      <th className="py-2.5 px-3 text-right">Potongan</th>
                      <th className="py-2.5 px-3 text-right">Gaji Bersih</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 tabular-nums">
                    {summaries.map((s) => (
                      <tr key={s.employeeId} className="hover:bg-neutral-50">
                        <td className="py-2.5 px-3 font-mono font-medium text-neutral-500">{s.code}</td>
                        <td className="py-2.5 px-3 font-medium text-neutral-900">{s.fullName}</td>
                        <td className="py-2.5 px-3">{formatIDR(s.dailySalary)}</td>
                        <td className="py-2.5 px-3 text-center text-neutral-700">
                          {s.completedDays > 0 ? `${s.completedDays} hari` : "–"}
                        </td>
                        <td className="py-2.5 px-3 text-center text-neutral-700">
                          {s.totalLateMinutes > 0 ? `${s.totalLateMinutes} menit` : "–"}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {s.totalLateDeductions > 0 ? (
                            <span className="text-red-600 font-semibold">-{formatIDR(s.totalLateDeductions)}</span>
                          ) : (
                            <span className="text-neutral-400">Rp0</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-neutral-900">
                          {s.netEarnings > 0 ? formatIDR(s.netEarnings) : "Rp0"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Authorization & Signoff Block */}
              <div className="pt-6 border-t border-neutral-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs text-neutral-500">
                <div>
                  <span className="font-medium text-neutral-800">CyberGuard Payroll Ledger</span>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    Data dihitung otomatis berdasarkan akumulasi catatan presensi harian karyawan.
                  </p>
                </div>
                <div className="text-right text-[11px] text-neutral-400 font-mono">
                  ID Laporan: PAY-{year}{String(month).padStart(2, "0")}-{summaries.length}
                </div>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* AUTHENTIC INDONESIAN SLIP GAJI KARYAWAN MODAL & PRINT VIEW */}
      {/* ======================================================== */}
      {selectedSlipEmployee && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white text-neutral-900 rounded-2xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl my-8 space-y-6 print:m-0 print:p-0 print:shadow-none print:max-w-none">
            
            {/* Modal Actions (Hidden on Print) */}
            <div className="flex items-center justify-between border-b pb-4 print:hidden">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-neutral-700" />
                <span className="text-sm font-semibold text-neutral-900">
                  Slip Gaji Karyawan — {selectedSlipEmployee.fullName}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="hig-button-primary text-xs flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5 stroke-[2]" />
                  <span>Cetak Slip Gaji (PDF)</span>
                </button>
                <button
                  onClick={() => setSelectedSlipEmployee(null)}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 transition-colors"
                  aria-label="Tutup"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Printable Slip Gaji Document */}
            <div className="border border-neutral-300 rounded-xl p-6 sm:p-8 space-y-6 bg-white text-neutral-900 print:border-none print:p-0">
              
              {/* Document Letterhead */}
              <div className="border-b-2 border-neutral-800 pb-4 flex justify-between items-start">
                <div>
                  <h2 className="text-base font-bold tracking-tight text-neutral-900 uppercase">
                    CyberGuard Attendance Systems
                  </h2>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Sistem Manajemen Presensi &amp; Rekapitulasi Penggajian
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold uppercase tracking-wider text-neutral-900 block">
                    SLIP GAJI KARYAWAN
                  </span>
                  <span className="text-xs text-neutral-600 font-medium">
                    Periode: {MONTH_NAMES_ID[month - 1]} {year}
                  </span>
                </div>
              </div>

              {/* Employee Metadata Grid */}
              <div className="grid grid-cols-2 gap-4 text-xs bg-neutral-50 border border-neutral-200 rounded-lg p-3.5">
                <div className="space-y-1.5">
                  <div className="flex">
                    <span className="w-28 text-neutral-500">Nama Karyawan</span>
                    <span className="font-semibold text-neutral-900">: {selectedSlipEmployee.fullName}</span>
                  </div>
                  <div className="flex">
                    <span className="w-28 text-neutral-500">ID / NIK</span>
                    <span className="font-mono font-medium text-neutral-900">: {selectedSlipEmployee.code}</span>
                  </div>
                  <div className="flex">
                    <span className="w-28 text-neutral-500">Gaji Pokok / Hari</span>
                    <span className="font-medium text-neutral-900">: {formatIDR(selectedSlipEmployee.dailySalary)}</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex">
                    <span className="w-28 text-neutral-500">Hari Kerja Selesai</span>
                    <span className="font-medium text-neutral-900">: {selectedSlipEmployee.completedDays} hari</span>
                  </div>
                  <div className="flex">
                    <span className="w-28 text-neutral-500">Total Terlambat</span>
                    <span className="font-medium text-neutral-900">: {selectedSlipEmployee.totalLateMinutes} menit</span>
                  </div>
                  <div className="flex">
                    <span className="w-28 text-neutral-500">Tanggal Terbit</span>
                    <span className="font-medium text-neutral-900">: {new Date().toLocaleDateString("id-ID")}</span>
                  </div>
                </div>
              </div>

              {/* Breakdown Table: Penerimaan vs Potongan */}
              <div className="border border-neutral-300 rounded-lg overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-neutral-100 border-b border-neutral-300 font-semibold text-neutral-800">
                      <th className="py-2 px-3 border-r border-neutral-300 w-1/2">PENERIMAAN (HAK)</th>
                      <th className="py-2 px-3 w-1/2">POTONGAN</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    <tr>
                      <td className="py-2.5 px-3 border-r border-neutral-300 align-top">
                        <div className="flex justify-between items-center py-1">
                          <span>Gaji Pokok ({selectedSlipEmployee.completedDays} hari x {formatIDR(selectedSlipEmployee.dailySalary)})</span>
                          <span className="font-mono font-medium">{formatIDR(selectedSlipEmployee.grossEarnings)}</span>
                        </div>
                        <div className="flex justify-between items-center py-1 text-neutral-500">
                          <span>Tunjangan Operasional</span>
                          <span className="font-mono">–</span>
                        </div>
                      </td>

                      <td className="py-2.5 px-3 align-top">
                        <div className="flex justify-between items-center py-1">
                          <span>Denda Keterlambatan ({selectedSlipEmployee.totalLateMinutes} menit)</span>
                          <span className="font-mono font-medium">
                            {selectedSlipEmployee.totalLateDeductions > 0
                              ? `-${formatIDR(selectedSlipEmployee.totalLateDeductions)}`
                              : "Rp0"}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-1 text-neutral-500">
                          <span>Potongan Lain / PPh</span>
                          <span className="font-mono">–</span>
                        </div>
                      </td>
                    </tr>

                    {/* Subtotals */}
                    <tr className="bg-neutral-50 font-semibold">
                      <td className="py-2 px-3 border-r border-neutral-300">
                        <div className="flex justify-between items-center">
                          <span>Total Penerimaan Kotor (A)</span>
                          <span className="font-mono">{formatIDR(selectedSlipEmployee.grossEarnings)}</span>
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex justify-between items-center">
                          <span>Total Potongan (B)</span>
                          <span className="font-mono">
                            {selectedSlipEmployee.totalLateDeductions > 0
                              ? formatIDR(selectedSlipEmployee.totalLateDeductions)
                              : "Rp0"}
                          </span>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Take Home Pay & Terbilang Box */}
              <div className="border-2 border-neutral-800 rounded-lg p-4 bg-neutral-50 space-y-2">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-bold uppercase tracking-wider text-neutral-700">
                    Gaji Bersih Diterima (Take Home Pay = A - B)
                  </span>
                  <span className="font-mono text-lg font-bold text-neutral-900">
                    {formatIDR(selectedSlipEmployee.netEarnings)}
                  </span>
                </div>
                <div className="text-xs text-neutral-600 italic border-t border-neutral-300 pt-2">
                  Terbilang: <span className="font-medium text-neutral-800 not-italic">{angkaKeTerbilang(selectedSlipEmployee.netEarnings)}</span>
                </div>
              </div>

              {/* Signoff Section */}
              <div className="pt-8 grid grid-cols-2 text-center text-xs text-neutral-700">
                <div className="space-y-16">
                  <span>Diterima Oleh Karyawan,</span>
                  <div className="border-t border-neutral-400 mx-auto w-44 pt-1 font-medium text-neutral-900">
                    ( {selectedSlipEmployee.fullName} )
                  </div>
                </div>

                <div className="space-y-16">
                  <span>Dibuat Oleh Keuangan / Manajemen,</span>
                  <div className="border-t border-neutral-400 mx-auto w-44 pt-1 font-medium text-neutral-900">
                    ( Manajemen CyberGuard )
                  </div>
                </div>
              </div>

              {/* Verification Microprint */}
              <div className="pt-4 border-t border-neutral-200 text-center text-[10px] text-neutral-400">
                Dokumen resmi ini dihitung otomatis berdasarkan akumulasi catatan presensi digital terverifikasi.
              </div>

            </div>

          </div>
        </div>
      )}
    </div>
  );
}
