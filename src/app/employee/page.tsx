"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { formatIDR } from "@/lib/utils";
import { QrCode, Clock, CheckCircle2, AlertCircle, Smartphone, ArrowRight, ShieldCheck, Check, FileText } from "lucide-react";

interface DashboardData {
  employee: {
    id: string;
    fullName: string;
    employeeId: string;
    dailySalary: number;
    shift: {
      name: string;
      startTime: string;
      endTime: string;
      isOvernight: boolean;
      gracePeriodMinutes: number;
      policy: {
        name: string;
        mode: string;
        rate: number;
      };
    };
    device: {
      deviceName: string;
      registeredAt: string;
    } | null;
  };
  today: {
    shiftDate: string;
    scheduledStart: string;
    scheduledEnd: string;
    state: "NOT_CHECKED_IN" | "CHECKED_IN" | "COMPLETED";
    activeRecord: {
      checkInTime: string;
      checkOutTime: string | null;
      status: string;
      lateMinutes: number;
      lateDeduction: number;
      netDailyEarnings: number;
      dailySalarySnapshot: number;
    } | null;
  };
  latestCompletedPayslip: {
    shiftDate: string;
    shiftName: string;
    dailySalary: number;
    scheduledCheckIn: string;
    actualCheckIn: string;
    scheduledCheckOut: string;
    actualCheckOut: string;
    lateDurationMinutes: number;
    lateDeduction: number;
    netDailyEarnings: number;
    status: string;
  } | null;
}

export default function EmployeeDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = async () => {
    try {
      const res = await fetch("/api/employee/dashboard", { cache: "no-store" });
      const d = await res.json();
      setData(d);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-24 text-xs text-neutral-400">
        Loading attendance status...
      </div>
    );
  }

  const { employee, today, latestCompletedPayslip } = data;
  const isCheckedIn = today.state === "CHECKED_IN";
  const isCompleted = today.state === "COMPLETED";
  const isNotCheckedIn = today.state === "NOT_CHECKED_IN";

  return (
    <div className="space-y-4">
      {/* Apple Wallet / Apple Cash Style Daily Wage Card */}
      <div className="apple-card p-5 bg-gradient-to-br from-neutral-900 to-neutral-800 text-white shadow-sm border border-neutral-700/60">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">
            Daily Wage Rate
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 text-neutral-300">
            Per Completed Shift
          </span>
        </div>

        <div className="text-3xl font-semibold tracking-tight mt-2 tabular-nums">
          {formatIDR(employee.dailySalary)}
        </div>

        <div className="text-xs text-neutral-300 mt-4 flex items-center justify-between pt-3 border-t border-white/10">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-neutral-400" />
            <span>{employee.shift.name}</span>
          </div>
          <span className="font-mono text-neutral-300">{employee.shift.startTime} – {employee.shift.endTime}</span>
        </div>
      </div>

      {/* Today's Attendance State Card */}
      <div className="apple-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
            Shift Status
          </span>
          {isNotCheckedIn && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
              Not Checked In
            </span>
          )}
          {isCheckedIn && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/60">
              Shift in Progress
            </span>
          )}
          {isCompleted && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/60">
              Completed
            </span>
          )}
        </div>

        {/* State Detail */}
        {isNotCheckedIn && (
          <div className="space-y-1">
            <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 text-sm">
              Ready to Check In
            </h3>
            <p className="text-xs text-neutral-500 leading-normal">
              Scheduled start is {employee.shift.startTime} with {employee.shift.gracePeriodMinutes} mins grace window. Scan the terminal QR upon arrival.
            </p>
          </div>
        )}

        {isCheckedIn && today.activeRecord && (
          <div className="space-y-2.5 bg-neutral-50 dark:bg-neutral-900/60 p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-neutral-500">Check-In Recorded:</span>
              <span className="font-mono font-medium text-neutral-900 dark:text-neutral-100">
                {today.activeRecord.checkInTime.split(", ")[1] || today.activeRecord.checkInTime}
              </span>
            </div>
            {today.activeRecord.lateMinutes > 0 ? (
              <div className="flex justify-between items-center text-red-600 dark:text-red-400 font-medium">
                <span>Lateness:</span>
                <span>{today.activeRecord.lateMinutes} mins late (-{formatIDR(today.activeRecord.lateDeduction)})</span>
              </div>
            ) : (
              <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400 font-medium">
                <span>Lateness:</span>
                <span>On Time (0 deduction)</span>
              </div>
            )}
            <p className="text-[11px] text-neutral-400 pt-2 border-t border-neutral-200 dark:border-neutral-800">
              When leaving your shift, scan the workplace QR again to finalize your net daily earnings.
            </p>
          </div>
        )}

        {isCompleted && today.activeRecord && (
          <div className="space-y-2 bg-emerald-50/40 dark:bg-emerald-950/20 p-3.5 rounded-xl border border-emerald-200/80 dark:border-emerald-900/40 text-xs">
            <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Check-out recorded. Shift completed for this session.
            </div>
            <div className="flex justify-between items-baseline pt-1">
              <span className="text-neutral-500">Net Daily Earnings:</span>
              <span className="font-semibold text-base text-emerald-600 dark:text-emerald-400 tabular-nums">
                {formatIDR(today.activeRecord.netDailyEarnings)}
              </span>
            </div>
          </div>
        )}

        {/* Primary Scan Action */}
        {!isCompleted ? (
          <Link
            href="/employee/scan"
            className="apple-btn-primary w-full py-3 text-sm font-medium flex items-center justify-center gap-2"
          >
            <QrCode className="w-4 h-4" />
            {isNotCheckedIn ? "Scan QR to Check In" : "Scan QR to Check Out"}
          </Link>
        ) : (
          <div className="text-center py-1 text-xs text-neutral-400">
            Attendance complete. See your daily earnings receipt below.
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* AUTOMATIC DAILY SALARY BREAKDOWN AFTER CHECK-OUT */}
      {/* Apple Pay Style Digital Receipt */}
      {/* ======================================================== */}
      {latestCompletedPayslip && (
        <div className="apple-card p-5 space-y-3.5 shadow-sm border border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-neutral-800">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 block">
                Daily Salary Receipt
              </span>
              <h3 className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
                {latestCompletedPayslip.shiftName}
              </h3>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              {latestCompletedPayslip.status}
            </span>
          </div>

          <div className="text-xs space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-neutral-500">Base Daily Salary</span>
              <span className="font-medium text-neutral-900 dark:text-neutral-100 tabular-nums">
                {formatIDR(latestCompletedPayslip.dailySalary)}
              </span>
            </div>

            <div className="flex justify-between items-center text-neutral-500">
              <span>Scheduled Check-In</span>
              <span className="font-mono text-neutral-700 dark:text-neutral-300">
                {latestCompletedPayslip.scheduledCheckIn.split(", ")[1] || latestCompletedPayslip.scheduledCheckIn}
              </span>
            </div>

            <div className="flex justify-between items-center text-neutral-500">
              <span>Actual Check-In</span>
              <span className="font-mono text-neutral-700 dark:text-neutral-300">
                {latestCompletedPayslip.actualCheckIn.split(", ")[1] || latestCompletedPayslip.actualCheckIn}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-neutral-500">Late Duration</span>
              <span className={latestCompletedPayslip.lateDurationMinutes > 0 ? "font-medium text-red-600 dark:text-red-400" : "font-medium text-emerald-600 dark:text-emerald-400"}>
                {latestCompletedPayslip.lateDurationMinutes > 0
                  ? `${latestCompletedPayslip.lateDurationMinutes} minutes`
                  : "0 mins (On Time)"}
              </span>
            </div>

            {latestCompletedPayslip.lateDeduction > 0 && (
              <div className="flex justify-between items-center text-red-600 dark:text-red-400 font-medium pt-1.5 border-t border-neutral-100 dark:border-neutral-800">
                <span>Late Deduction</span>
                <span className="tabular-nums">-{formatIDR(latestCompletedPayslip.lateDeduction)}</span>
              </div>
            )}

            <div className="flex justify-between items-baseline pt-3 border-t border-neutral-200 dark:border-neutral-800">
              <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
                Net Daily Earnings
              </span>
              <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {formatIDR(latestCompletedPayslip.netDailyEarnings)}
              </span>
            </div>
          </div>

          <div className="text-[10px] text-neutral-400 text-center pt-2 border-t border-neutral-100 dark:border-neutral-800">
            Session Date: {latestCompletedPayslip.shiftDate} • Authoritative Server Snapshot
          </div>
        </div>
      )}

      {/* Device Verification Status */}
      <div className="apple-card p-3 flex items-center justify-between text-xs text-neutral-500">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Authorized Device:</span>
        </div>
        <span className="font-medium text-neutral-800 dark:text-neutral-200 truncate max-w-[180px]">
          {employee.device?.deviceName || "This Terminal"}
        </span>
      </div>
    </div>
  );
}
