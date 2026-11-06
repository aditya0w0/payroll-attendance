"use client";

import React, { useState, useEffect } from "react";
import { formatIDR } from "@/lib/utils";
import { formatJakartaDateTime } from "@/lib/timezone";
import { History, Calendar, CheckCircle2, AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface HistoryRecord {
  id: string;
  shiftDate: string;
  checkInTime: string;
  checkOutTime: string | null;
  status: string;
  lateMinutes: number;
  dailySalarySnapshot: number;
  lateDeduction: number;
  netDailyEarnings: number;
  shift: {
    name: string;
    startTime: string;
    endTime: string;
  };
}

export default function EmployeeHistoryPage() {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [summary, setSummary] = useState({
    totalCompletedDays: 0,
    totalEarned: 0,
    totalDeducted: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/employee/history")
      .then((r) => r.json())
      .then((data) => {
        setRecords(data.records || []);
        if (data.summary) setSummary(data.summary);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
            Attendance & Earnings
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Transparent ledger of your daily wages and deductions.
          </p>
        </div>
      </div>

      {/* Aggregate KPI Summary Cards */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="apple-card p-3">
          <span className="text-[10px] text-neutral-400 uppercase font-semibold block tracking-wider">Completed</span>
          <span className="text-base font-semibold text-neutral-900 dark:text-neutral-100 tabular-nums">
            {summary.totalCompletedDays}d
          </span>
        </div>
        <div className="apple-card p-3">
          <span className="text-[10px] text-neutral-400 uppercase font-semibold block tracking-wider">Deductions</span>
          <span className="text-base font-semibold text-red-600 dark:text-red-400 tabular-nums">
            -{formatIDR(summary.totalDeducted)}
          </span>
        </div>
        <div className="apple-card p-3">
          <span className="text-[10px] text-neutral-400 uppercase font-semibold block tracking-wider">Net Earned</span>
          <span className="text-base font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {formatIDR(summary.totalEarned)}
          </span>
        </div>
      </div>

      {/* Attendance Records List */}
      <div className="space-y-2.5">
        {loading ? (
          <div className="text-center py-16 text-xs text-neutral-400">Loading attendance records...</div>
        ) : records.length === 0 ? (
          <div className="apple-card p-8 text-center text-xs text-neutral-400">
            No completed attendance records found.
          </div>
        ) : (
          records.map((r) => {
            const isCompleted = r.status === "COMPLETED" || r.status === "LATE_COMPLETED";
            return (
              <div key={r.id} className="apple-card p-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-neutral-900 dark:text-neutral-100">
                    <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                    <span>{r.shiftDate}</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                      r.status === "COMPLETED"
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                        : r.status === "LATE_COMPLETED"
                        ? "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300 border border-red-200 dark:border-red-800"
                        : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                    }`}
                  >
                    {r.status}
                  </span>
                </div>

                <div className="text-neutral-500 text-[11px]">
                  {r.shift.name} ({r.shift.startTime} – {r.shift.endTime})
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 text-[11px]">
                  <div>
                    Check-In: <span className="font-mono font-medium text-neutral-800 dark:text-neutral-200">{r.checkInTime.split("T")[1]?.substring(0, 5) || "--"}</span>
                  </div>
                  <div>
                    Check-Out: <span className="font-mono font-medium text-neutral-800 dark:text-neutral-200">{r.checkOutTime ? r.checkOutTime.split("T")[1]?.substring(0, 5) : "--"}</span>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-neutral-100 dark:border-neutral-800">
                  <span className="text-neutral-500 text-[11px]">
                    {r.lateMinutes > 0 ? (
                      <span className="text-red-600 dark:text-red-400 font-medium">{r.lateMinutes}m late (-{formatIDR(r.lateDeduction)})</span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">On Time</span>
                    )}
                  </span>
                  <span className="font-semibold text-sm text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {isCompleted ? formatIDR(r.netDailyEarnings) : "In Progress"}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
