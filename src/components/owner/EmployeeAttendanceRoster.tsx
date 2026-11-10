"use client";

import React, { useState, useEffect } from "react";
import {
  Users,
  Search,
  Filter,
  Eye,
  X,
  Clock,
  MapPin,
  Wifi,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { formatIDR } from "@/lib/utils";
import { formatJakartaDateTime } from "@/lib/timezone";
import type {
  AttendanceAnalyticsResult,
  EmployeeRosterItem,
} from "@/lib/attendance-analytics";

export default function EmployeeAttendanceRoster() {
  const [range, setRange] = useState<"7d" | "14d" | "current_period">("7d");
  const [data, setData] = useState<AttendanceAnalyticsResult | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | "FREQUENT_LATE" | "HAS_ABSENT">("ALL");

  // Detail Modal
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRosterItem | null>(null);

  const fetchRoster = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/owner/analytics/attendance?range=${range}`);
      const json = await res.json();
      if (res.ok && json.success) {
        setData(json);
      }
    } catch (e) {
      console.error("Failed to load employee roster analytics:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoster();
  }, [range]);

  const roster = data?.employeeRoster || [];

  // Filtered Roster
  const filteredRoster = roster.filter((emp) => {
    // Search match
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      emp.name.toLowerCase().includes(q) ||
      emp.employeeCode.toLowerCase().includes(q) ||
      emp.shiftName.toLowerCase().includes(q);

    if (!matchesSearch) return false;

    // Category filter
    if (categoryFilter === "FREQUENT_LATE") {
      return emp.lateCount >= 2;
    }
    if (categoryFilter === "HAS_ABSENT") {
      return emp.absentCount > 0;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="liquid-glass p-4 rounded-2xl shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 tracking-tight">
                Rekap Kehadiran, Keterlambatan &amp; Alpa Karyawan
              </h2>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Evaluasi kinerja presensi berdasarkan shift terjadwal dan estimasi akumulasi gaji berjalan.
            </p>
          </div>

          {/* Range Selector */}
          <div className="inline-flex liquid-glass-pill p-1 text-xs shrink-0 self-start sm:self-auto border border-white/30 dark:border-white/10">
            <button
              type="button"
              onClick={() => setRange("7d")}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                range === "7d"
                  ? "bg-white/90 dark:bg-white/15 text-neutral-900 dark:text-neutral-50 shadow-sm border border-white/50 dark:border-white/15 font-semibold"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
              }`}
            >
              7 Hari
            </button>
            <button
              type="button"
              onClick={() => setRange("14d")}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                range === "14d"
                  ? "bg-white/90 dark:bg-white/15 text-neutral-900 dark:text-neutral-50 shadow-sm border border-white/50 dark:border-white/15 font-semibold"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
              }`}
            >
              14 Hari
            </button>
            <button
              type="button"
              onClick={() => setRange("current_period")}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                range === "current_period"
                  ? "bg-white/90 dark:bg-white/15 text-neutral-900 dark:text-neutral-50 shadow-sm border border-white/50 dark:border-white/15 font-semibold"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
              }`}
            >
              Bulan Ini
            </button>
          </div>
        </div>

        {/* Search & Quick Filter Dropdown */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-2 border-t border-neutral-100 dark:border-neutral-800">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari nama karyawan atau kode ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-neutral-50 dark:bg-[#2C2C2E] text-neutral-900 dark:text-neutral-100 border border-neutral-300 dark:border-neutral-700 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as any)}
              className="bg-neutral-50 dark:bg-[#2C2C2E] text-neutral-900 dark:text-neutral-100 border border-neutral-300 dark:border-neutral-700 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="ALL">Semua Karyawan ({roster.length})</option>
              <option value="FREQUENT_LATE">Sering Terlambat (&gt;= 2x)</option>
              <option value="HAS_ABSENT">Ada Alpa / Tidak Masuk</option>
            </select>

            <button
              type="button"
              onClick={fetchRoster}
              disabled={loading}
              className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-[#2C2C2E] text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-[#3A3A3C] transition-colors"
              title="Refresh Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Roster Table Card */}
      <div className="liquid-glass rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="text-center py-12 text-xs text-neutral-400 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
            <span>Memuat data rekap presensi...</span>
          </div>
        ) : filteredRoster.length === 0 ? (
          <div className="text-center py-12 text-xs text-neutral-400">
            Tidak ada karyawan yang cocok dengan kriteria filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/75 dark:bg-neutral-800/40 text-neutral-500 dark:text-neutral-400 text-[11px] uppercase font-semibold">
                  <th className="py-3 px-4">Karyawan</th>
                  <th className="py-3 px-4">Hadir</th>
                  <th className="py-3 px-4">Terlambat</th>
                  <th className="py-3 px-4">Alpa / Tidak Masuk</th>
                  <th className="py-3 px-4">Tingkat Kehadiran</th>
                  <th className="py-3 px-4">Estimasi Gaji Berjalan</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/80 tabular-numbers">
                {filteredRoster.map((emp) => {
                  const rateColor =
                    emp.attendanceRate >= 90
                      ? "text-emerald-600 dark:text-emerald-400"
                      : emp.attendanceRate >= 75
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-rose-600 dark:text-rose-400";

                  const barBgColor =
                    emp.attendanceRate >= 90
                      ? "bg-emerald-500"
                      : emp.attendanceRate >= 75
                      ? "bg-amber-500"
                      : "bg-rose-500";

                  return (
                    <tr
                      key={emp.id}
                      className="hover:bg-neutral-50/80 dark:hover:bg-neutral-800/30 transition-colors"
                    >
                      {/* 1. Karyawan */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-neutral-900 dark:text-neutral-100 text-xs">
                          {emp.name}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-[10px] text-neutral-400">
                            {emp.employeeCode}
                          </span>
                          <span className="text-neutral-300 dark:text-neutral-600">•</span>
                          <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                            {emp.shiftName}
                          </span>
                        </div>
                      </td>

                      {/* 2. Hadir (Tepat Waktu) */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-neutral-900 dark:text-neutral-100">
                            {emp.onTimeCount}
                          </span>
                          <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            [ON-TIME]
                          </span>
                        </div>
                        <span className="text-[10px] text-neutral-400 block mt-0.5">
                          dari {emp.assignedShiftCount} shift
                        </span>
                      </td>

                      {/* 3. Terlambat */}
                      <td className="py-3 px-4">
                        {emp.lateCount > 0 ? (
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-amber-600 dark:text-amber-400">
                                {emp.lateCount}x
                              </span>
                              <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                [LATE]
                              </span>
                            </div>
                            <span className="text-[10px] text-neutral-400 block mt-0.5">
                              Total {emp.totalLateMinutes}m telat
                            </span>
                          </div>
                        ) : (
                          <span className="text-neutral-400 text-xs font-mono">0</span>
                        )}
                      </td>

                      {/* 4. Alpa / Tidak Masuk */}
                      <td className="py-3 px-4">
                        {emp.absentCount > 0 ? (
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-rose-600 dark:text-rose-400">
                                {emp.absentCount}
                              </span>
                              <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                                [ALPA]
                              </span>
                            </div>
                            <span className="text-[10px] text-rose-500/80 block mt-0.5">
                              Shift dilewati
                            </span>
                          </div>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                            Nihil (0)
                          </span>
                        )}
                      </td>

                      {/* 5. Tingkat Kehadiran */}
                      <td className="py-3 px-4 min-w-[130px]">
                        <div className="flex items-center justify-between text-xs font-semibold mb-1">
                          <span className={rateColor}>{emp.attendanceRate}%</span>
                          <span className="text-[10px] text-neutral-400">
                            {emp.presentCount}/{emp.assignedShiftCount}
                          </span>
                        </div>
                        <div className="w-full bg-neutral-100 dark:bg-neutral-800 h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${barBgColor}`}
                            style={{ width: `${Math.min(100, emp.attendanceRate)}%` }}
                          />
                        </div>
                      </td>

                      {/* 6. Estimasi Gaji Berjalan */}
                      <td className="py-3 px-4">
                        <div className="font-bold font-mono text-neutral-900 dark:text-neutral-100">
                          {formatIDR(emp.accumulatedWage)}
                        </div>
                        <span className="text-[10px] text-neutral-400 block mt-0.5">
                          Tarif: {formatIDR(emp.dailySalary)}/hari
                        </span>
                      </td>

                      {/* 7. Aksi */}
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedEmployee(emp)}
                          className="bg-neutral-100 dark:bg-[#2C2C2E] text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-200 dark:hover:bg-[#3A3A3C] rounded-lg px-2.5 py-1 text-xs font-medium inline-flex items-center gap-1 transition-colors"
                        >
                          <Eye className="w-3 h-3 text-neutral-500" />
                          <span>Lihat Detail</span>
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

      {/* Employee Detail Modal */}
      {selectedEmployee && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="liquid-glass-elevated max-w-2xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-neutral-200 dark:border-neutral-800">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
                    {selectedEmployee.name}
                  </h3>
                  <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
                    {selectedEmployee.employeeCode}
                  </span>
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  Shift: <strong className="text-neutral-800 dark:text-neutral-200">{selectedEmployee.shiftName}</strong> • Gaji Pokok Harian:{" "}
                  <strong className="text-neutral-800 dark:text-neutral-200 font-mono">{formatIDR(selectedEmployee.dailySalary)}</strong>
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedEmployee(null)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-neutral-50 dark:bg-[#2C2C2E] p-3 rounded-xl border border-neutral-200 dark:border-neutral-700">
                <span className="text-[10px] uppercase font-semibold text-neutral-500 dark:text-neutral-400 block">
                  Kehadiran
                </span>
                <span className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                  {selectedEmployee.attendanceRate}%
                </span>
                <span className="text-[10px] text-neutral-400 block">
                  {selectedEmployee.presentCount}/{selectedEmployee.assignedShiftCount} shift
                </span>
              </div>

              <div className="bg-neutral-50 dark:bg-[#2C2C2E] p-3 rounded-xl border border-neutral-200 dark:border-neutral-700">
                <span className="text-[10px] uppercase font-semibold text-neutral-500 dark:text-neutral-400 block">
                  Tepat Waktu
                </span>
                <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                  {selectedEmployee.onTimeCount}
                </span>
                <span className="text-[10px] text-neutral-400 block">Shift on-time</span>
              </div>

              <div className="bg-neutral-50 dark:bg-[#2C2C2E] p-3 rounded-xl border border-neutral-200 dark:border-neutral-700">
                <span className="text-[10px] uppercase font-semibold text-neutral-500 dark:text-neutral-400 block">
                  Terlambat
                </span>
                <span className="text-base font-bold text-amber-600 dark:text-amber-400">
                  {selectedEmployee.lateCount}x
                </span>
                <span className="text-[10px] text-neutral-400 block">
                  {selectedEmployee.totalLateMinutes} menit telat
                </span>
              </div>

              <div className="bg-neutral-50 dark:bg-[#2C2C2E] p-3 rounded-xl border border-neutral-200 dark:border-neutral-700">
                <span className="text-[10px] uppercase font-semibold text-neutral-500 dark:text-neutral-400 block">
                  Alpa / Absen
                </span>
                <span className="text-base font-bold text-rose-600 dark:text-rose-400">
                  {selectedEmployee.absentCount}
                </span>
                <span className="text-[10px] text-neutral-400 block">Shift terlewat</span>
              </div>
            </div>

            {/* Historical Punch Records List */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <span>Riwayat Presensi &amp; Verifikasi Lokasi ({selectedEmployee.records.length})</span>
              </h4>

              {selectedEmployee.records.length === 0 ? (
                <div className="text-center py-8 text-xs text-neutral-400 border border-dashed border-neutral-200 dark:border-neutral-800 rounded-xl">
                  Tidak ada catatan presensi pada rentang waktu ini.
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedEmployee.records.map((rec) => (
                    <div
                      key={rec.id}
                      className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30 text-xs space-y-2"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-1.5 border-b border-neutral-100 dark:border-neutral-700/60">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-neutral-900 dark:text-neutral-100">
                            {rec.shiftDate}
                          </span>
                          {rec.lateMinutes > 0 ? (
                            <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                              TERLAMBAT {rec.lateMinutes}M (-{formatIDR(rec.lateDeduction)})
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                              TEPAT WAKTU
                            </span>
                          )}
                        </div>

                        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {formatIDR(rec.netDailyEarnings)}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-neutral-600 dark:text-neutral-400">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-neutral-400" />
                          <span>
                            Masuk: <strong>{formatJakartaDateTime(rec.checkInTime).split(", ")[1] || formatJakartaDateTime(rec.checkInTime)}</strong>
                            {" • "}
                            Pulang:{" "}
                            <strong>
                              {rec.checkOutTime
                                ? formatJakartaDateTime(rec.checkOutTime).split(", ")[1] || formatJakartaDateTime(rec.checkOutTime)
                                : "Belum Check-Out"}
                            </strong>
                          </span>
                        </div>

                        {rec.checkInLatitude !== null && rec.checkInLongitude !== null && (
                          <div className="flex items-center gap-1.5 font-mono text-[10px]">
                            <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span className="truncate">
                              {rec.checkInLatitude.toFixed(6)}, {rec.checkInLongitude.toFixed(6)}{" "}
                              {rec.checkInDistanceMeters !== null && `(Jarak: ${rec.checkInDistanceMeters}m)`}
                            </span>
                          </div>
                        )}
                      </div>

                      {rec.checkInClientIp && (
                        <div className="flex items-center gap-1.5 text-[10px] font-mono text-neutral-500">
                          <Wifi className="w-3 h-3 text-purple-500" />
                          <span>IP Presensi: {rec.checkInClientIp}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end pt-2 border-t border-neutral-200 dark:border-neutral-800">
              <button
                type="button"
                onClick={() => setSelectedEmployee(null)}
                className="bg-neutral-100 dark:bg-[#2C2C2E] text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-200 dark:hover:bg-[#3A3A3C] rounded-lg px-4 py-2 text-xs font-medium transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
