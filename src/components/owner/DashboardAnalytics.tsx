"use client";

import React, { useState, useEffect } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  TrendingUp,
  UserCheck,
  Clock,
  UserX,
  BarChart3,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { formatIDR } from "@/lib/utils";
import type { AttendanceAnalyticsResult } from "@/lib/attendance-analytics";

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const hadir = payload.find((p: any) => p.dataKey === "hadir")?.value || 0;
    const terlambat = payload.find((p: any) => p.dataKey === "terlambat")?.value || 0;
    const alpa = payload.find((p: any) => p.dataKey === "alpa")?.value || 0;
    const total = hadir + terlambat + alpa;

    return (
      <div className="liquid-glass-elevated border border-white/40 dark:border-white/10 text-neutral-900 dark:text-neutral-100 p-3.5 text-xs space-y-1.5 min-w-[170px] shadow-xl">
        <div className="font-semibold text-neutral-800 dark:text-neutral-200 border-b border-white/20 dark:border-white/10 pb-1 flex items-center justify-between">
          <span>{label}</span>
          <span className="font-mono text-[10px] text-neutral-400">Total: {total}</span>
        </div>
        <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
          <span className="flex items-center gap-1.5 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
            Hadir Tepat Waktu:
          </span>
          <span className="font-mono font-bold">{hadir}</span>
        </div>
        <div className="flex items-center justify-between text-amber-600 dark:text-amber-400">
          <span className="flex items-center gap-1.5 font-medium">
            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
            Terlambat:
          </span>
          <span className="font-mono font-bold">{terlambat}</span>
        </div>
        <div className="flex items-center justify-between text-rose-600 dark:text-rose-400">
          <span className="flex items-center gap-1.5 font-medium">
            <span className="w-2 h-2 rounded-full bg-rose-500 inline-block"></span>
            Alpa / Tidak Masuk:
          </span>
          <span className="font-mono font-bold">{alpa}</span>
        </div>
      </div>
    );
  }
  return null;
};

export default function DashboardAnalytics() {
  const [range, setRange] = useState<"7d" | "14d" | "current_period">("7d");
  const [data, setData] = useState<AttendanceAnalyticsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const checkDark = () => {
      setIsDark(document.documentElement.classList.contains("dark"));
    };
    checkDark();

    const observer = new MutationObserver(checkDark);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/owner/analytics/attendance?range=${range}`);
      const json = await res.json();
      if (res.ok && json.success) {
        setData(json);
      }
    } catch (e) {
      console.error("Failed to load attendance analytics:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [range]);

  const kpi = data?.kpi || {
    totalScheduledShifts: 0,
    totalPresentOnTime: 0,
    totalPresentLate: 0,
    totalPresent: 0,
    totalAbsent: 0,
    attendanceRatePercentage: 0,
    totalLateMinutes: 0,
    totalLateDeductions: 0,
    totalAccumulatedWages: 0,
  };

  const gridColor = isDark ? "#2C2C2E" : "#f0f0f2";
  const axisColor = isDark ? "#a3a3a3" : "#737373";

  return (
    <div className="space-y-5">
      {/* Date Range Selector Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 tracking-tight">
            Attendance Performance &amp; Absence Trends
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex hig-segmented p-1 text-xs">
            <button
              type="button"
              onClick={() => setRange("7d")}
              className={`min-h-[44px] px-3.5 py-2 rounded-md font-medium transition-colors flex items-center justify-center ${
                range === "7d"
                  ? "bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-50 shadow-xs font-semibold"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
              }`}
            >
              7 Hari
            </button>
            <button
              type="button"
              onClick={() => setRange("14d")}
              className={`min-h-[44px] px-3.5 py-2 rounded-md font-medium transition-colors flex items-center justify-center ${
                range === "14d"
                  ? "bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-50 shadow-xs font-semibold"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
              }`}
            >
              14 Hari
            </button>
            <button
              type="button"
              onClick={() => setRange("current_period")}
              className={`min-h-[44px] px-3.5 py-2 rounded-md font-medium transition-colors flex items-center justify-center ${
                range === "current_period"
                  ? "bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-50 shadow-xs font-semibold"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
              }`}
            >
              Bulan Ini
            </button>
          </div>

          <button
            type="button"
            onClick={fetchAnalytics}
            disabled={loading}
            className="min-h-[44px] min-w-[44px] p-2 rounded-lg hig-button-secondary text-neutral-600 dark:text-neutral-300 transition-colors flex items-center justify-center"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* KPI Metric Row (Liquid Glass) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* 1. Tingkat Kehadiran */}
        <div className="liquid-glass p-5 rounded-2xl">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 mb-1.5">
            <span className="text-[11px] font-semibold tracking-wider uppercase">
              Tingkat Kehadiran
            </span>
            <TrendingUp className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 tabular-numbers">
            {kpi.attendanceRatePercentage}%
          </div>
          <span className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1 block tabular-numbers">
            {kpi.totalPresent} dari {kpi.totalScheduledShifts} jadwal shift
          </span>
        </div>

        {/* 2. Total Hadir Tepat Waktu */}
        <div className="liquid-glass p-5 rounded-2xl">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 mb-1.5">
            <span className="text-[11px] font-semibold tracking-wider uppercase">
              Total Hadir
            </span>
            <UserCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 tabular-numbers">
            {kpi.totalPresentOnTime}
          </div>
          <span className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1 block tabular-numbers">
            Tepat waktu (on-time punch)
          </span>
        </div>

        {/* 3. Terlambat */}
        <div className="liquid-glass p-5 rounded-2xl">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 mb-1.5">
            <span className="text-[11px] font-semibold tracking-wider uppercase">
              Terlambat
            </span>
            <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400 tabular-numbers">
            {kpi.totalPresentLate}
          </div>
          <span className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1 block tabular-numbers">
            Total {kpi.totalLateMinutes} menit terlambat
          </span>
        </div>

        {/* 4. Tidak Masuk / Alpa */}
        <div className="liquid-glass p-5 rounded-2xl">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 mb-1.5">
            <span className="text-[11px] font-semibold tracking-wider uppercase">
              Tidak Masuk / Alpa
            </span>
            <UserX className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
          </div>
          <div className="text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400 tabular-numbers">
            {kpi.totalAbsent}
          </div>
          <span className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1 block tabular-numbers">
            Shift terjadwal tanpa presensi
          </span>
        </div>
      </div>

      {/* Attendance Trend Chart Card */}
      <div className="liquid-glass p-5 rounded-3xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-neutral-100 dark:border-neutral-800">
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
              Grafik Tren Kehadiran &amp; Absensi Harian
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Komposisi kehadiran tepat waktu, keterlambatan, dan ketidakhadiran (alpa) harian.
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block"></span>
              <span>Hadir Tepat</span>
            </div>
            <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block"></span>
              <span>Terlambat</span>
            </div>
            <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-medium">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block"></span>
              <span>Alpa</span>
            </div>
          </div>
        </div>

        {/* Chart Canvas */}
        <div className="h-64 sm:h-72 w-full pt-2">
          {!mounted || loading ? (
            <div className="w-full h-full flex items-center justify-center text-xs text-neutral-400">
              <RefreshCw className="w-4 h-4 animate-spin mr-2" />
              Memuat grafik analitik...
            </div>
          ) : !data || data.dailyTrends.length === 0 ? (
            <div className="w-full h-full flex items-center justify-center text-xs text-neutral-400">
              Belum ada data analitik untuk rentang waktu ini.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.dailyTrends}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: axisColor, fontSize: 11 }}
                  axisLine={{ stroke: gridColor }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: axisColor, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar
                  dataKey="hadir"
                  name="Hadir Tepat Waktu"
                  stackId="attendance"
                  fill="#10b981"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="terlambat"
                  name="Terlambat"
                  stackId="attendance"
                  fill="#f59e0b"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="alpa"
                  name="Alpa / Tidak Masuk"
                  stackId="attendance"
                  fill="#f43f5e"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Footer Note with Link to Detailed Roster */}
        <div className="flex items-center justify-between pt-2 border-t border-neutral-100 dark:border-neutral-800 text-xs">
          <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
            Estimasi total akumulasi gaji berjalan periode ini:{" "}
            <strong className="text-neutral-900 dark:text-neutral-100 font-mono">
              {formatIDR(kpi.totalAccumulatedWages)}
            </strong>
          </span>
          <Link
            href="/owner/attendance"
            className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center font-medium"
          >
            Lihat Rincian Per Karyawan
          </Link>
        </div>
      </div>
    </div>
  );
}
