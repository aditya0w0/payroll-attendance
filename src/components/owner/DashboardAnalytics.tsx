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
} from "recharts";
import {
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
      <div className="hig-card p-3 text-xs space-y-1.5 min-w-[160px] shadow-lg rounded-xl border border-[var(--separator-subtle)] bg-[var(--surface-primary)]">
        <div className="font-semibold text-[var(--text-primary)] border-b border-[var(--separator-subtle)] pb-1 flex items-center justify-between">
          <span>{label}</span>
          <span className="font-mono text-[10px] text-[var(--text-tertiary)] tabular-numbers">Total: {total}</span>
        </div>
        <div className="flex items-center justify-between text-[var(--text-secondary)]">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-500 inline-block"></span>
            Tepat Waktu:
          </span>
          <span className="font-mono font-medium text-[var(--text-primary)] tabular-numbers">{hadir}</span>
        </div>
        <div className="flex items-center justify-between text-[var(--text-secondary)]">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 inline-block"></span>
            Terlambat:
          </span>
          <span className="font-mono font-medium text-[var(--text-primary)] tabular-numbers">{terlambat}</span>
        </div>
        <div className="flex items-center justify-between text-[var(--text-secondary)]">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 dark:bg-rose-400 inline-block"></span>
            Alpa:
          </span>
          <span className="font-mono font-medium text-[var(--text-primary)] tabular-numbers">{alpa}</span>
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

  const gridColor = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)";
  const axisColor = isDark ? "#8e8e93" : "#6c6c70";
  const colorHadir = isDark ? "#3b82f6" : "#2563eb";
  const colorTerlambat = isDark ? "#f59e0b" : "#d97706";
  const colorAlpa = isDark ? "#f43f5e" : "#e11d48";

  return (
    <div className="space-y-4">
      {/* Date Range Selector Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-[var(--accent)]" />
          <h2 className="text-sm font-semibold text-[var(--text-primary)] tracking-tight">
            Performa Kehadiran &amp; Tren Absensi
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex hig-segmented p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setRange("7d")}
              className={`h-7 px-3 rounded-md font-medium text-[11px] transition-colors flex items-center justify-center ${
                range === "7d"
                  ? "bg-white dark:bg-neutral-800 text-[var(--text-primary)] shadow-xs font-semibold"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              7 Hari
            </button>
            <button
              type="button"
              onClick={() => setRange("14d")}
              className={`h-7 px-3 rounded-md font-medium text-[11px] transition-colors flex items-center justify-center ${
                range === "14d"
                  ? "bg-white dark:bg-neutral-800 text-[var(--text-primary)] shadow-xs font-semibold"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              14 Hari
            </button>
            <button
              type="button"
              onClick={() => setRange("current_period")}
              className={`h-7 px-3 rounded-md font-medium text-[11px] transition-colors flex items-center justify-center ${
                range === "current_period"
                  ? "bg-white dark:bg-neutral-800 text-[var(--text-primary)] shadow-xs font-semibold"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              Bulan Ini
            </button>
          </div>

          <button
            type="button"
            onClick={fetchAnalytics}
            disabled={loading}
            className="h-7 w-7 rounded-md hig-button-secondary text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center justify-center"
            title="Muat Ulang Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Attendance Trend Chart Card */}
      <div className="hig-card p-5 rounded-2xl border border-[var(--separator-subtle)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[var(--separator-subtle)]">
          <div>
            <h3 className="text-xs font-semibold text-[var(--text-primary)]">
              Grafik Tren Kehadiran &amp; Absensi Harian
            </h3>
            <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
              Komposisi kehadiran tepat waktu, keterlambatan, dan ketidakhadiran (alpa) harian.
            </p>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-[var(--text-secondary)]">
            <div className="flex items-center gap-1.5 font-medium">
              <span className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-500 inline-block"></span>
              <span>Tepat Waktu</span>
            </div>
            <div className="flex items-center gap-1.5 font-medium">
              <span className="w-2 h-2 rounded-full bg-amber-500 dark:bg-amber-400 inline-block"></span>
              <span>Terlambat</span>
            </div>
            <div className="flex items-center gap-1.5 font-medium">
              <span className="w-2 h-2 rounded-full bg-rose-500 dark:bg-rose-400 inline-block"></span>
              <span>Alpa</span>
            </div>
          </div>
        </div>

        {/* Chart Canvas */}
        <div className="h-64 sm:h-72 w-full pt-1">
          {!mounted || loading ? (
            <div className="w-full h-full flex items-center justify-center text-xs text-[var(--text-tertiary)]">
              <RefreshCw className="w-4 h-4 animate-spin mr-2" />
              Memuat grafik analitik...
            </div>
          ) : !data || data.dailyTrends.length === 0 ? (
            <div className="w-full h-full flex items-center justify-center text-xs text-[var(--text-tertiary)]">
              Belum ada data analitik untuk rentang waktu ini.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.dailyTrends}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                barSize={16}
              >
                <CartesianGrid strokeDasharray="2 4" vertical={false} stroke={gridColor} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: axisColor, fontSize: 10 }}
                  axisLine={{ stroke: gridColor }}
                  tickLine={false}
                  dy={4}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: axisColor, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  dx={-2}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar
                  dataKey="hadir"
                  name="Hadir Tepat Waktu"
                  stackId="attendance"
                  fill={colorHadir}
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="terlambat"
                  name="Terlambat"
                  stackId="attendance"
                  fill={colorTerlambat}
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="alpa"
                  name="Alpa / Tidak Masuk"
                  stackId="attendance"
                  fill={colorAlpa}
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Footer Note with Link to Detailed Roster */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2.5 border-t border-[var(--separator-subtle)] text-xs">
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
            <span>Estimasi total akumulasi gaji berjalan periode ini:</span>
            <strong className="text-[var(--text-primary)] font-mono tabular-numbers">
              {formatIDR(kpi.totalAccumulatedWages)}
            </strong>
          </div>
          <Link
            href="/owner/attendance"
            className="text-[11px] text-[var(--accent)] hover:underline inline-flex items-center font-medium"
          >
            Lihat Rincian Per Karyawan
          </Link>
        </div>
      </div>
    </div>
  );
}