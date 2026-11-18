import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatIDR } from "@/lib/utils";
import { getJakartaDateString, formatJakartaDateTime } from "@/lib/timezone";
import { Users, ClipboardList, AlertCircle, Smartphone, QrCode, ShieldAlert } from "lucide-react";
import DashboardAnalytics from "@/components/owner/DashboardAnalytics";

export const dynamic = "force-dynamic";

export default async function OwnerOverviewPage() {
  const todayStr = getJakartaDateString();

  const [
    totalEmployees,
    todayAttendance,
    pendingUnlockRequests,
    recentAuditLogs,
    recentCheatingAlerts,
  ] = await Promise.all([
    prisma.employeeProfile.count(),
    prisma.attendanceRecord.findMany({
      where: { shiftDate: todayStr },
      include: { employee: true },
    }),
    prisma.deviceUnlockRequest.count({
      where: { status: "PENDING", expiresAt: { gt: new Date() } },
    }),
    prisma.auditLog.findMany({
      orderBy: { timestamp: "desc" },
      take: 6,
    }),
    prisma.auditLog.findMany({
      where: { action: { startsWith: "CHEATING_ALERT_" } },
      orderBy: { timestamp: "desc" },
      take: 4,
    }),
  ]);

  const presentCount = todayAttendance.length;
  const lateCount = todayAttendance.filter((r) => r.lateMinutes > 0).length;
  const totalLateDeductions = todayAttendance.reduce((sum, r) => sum + r.lateDeduction, 0);

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
            Ringkasan Presensi &amp; Penggajian
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Tanggal operasional aktif: <span className="font-mono tabular-numbers text-[var(--text-primary)]">{todayStr}</span>
          </p>
        </div>

        <Link href="/owner/qr" className="liquid-glass-btn-primary text-xs px-4 py-2 rounded-xl inline-flex items-center gap-2 font-medium shadow-sm">
          <QrCode className="w-3.5 h-3.5 stroke-[2]" />
          Buka Terminal Presensi QR
        </Link>
      </div>

      {/* High-Priority Cheating & Security Alerts Banner */}
      {recentCheatingAlerts.length > 0 && (
        <div className="p-4 rounded-2xl liquid-glass border border-red-500/30 bg-red-500/10 dark:bg-red-950/30 space-y-2.5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-600 dark:text-red-400" />
              <h2 className="text-xs font-semibold text-red-700 dark:text-red-300">
                Peringatan Keamanan &amp; Upaya Kecurangan ({recentCheatingAlerts.length})
              </h2>
            </div>
            <Link
              href="/owner/audit-logs?action=CHEATING_ALERTS"
              className="text-xs text-red-700 dark:text-red-300 font-medium hover:underline flex items-center"
            >
              Tinjau Insiden
            </Link>
          </div>

          <div className="divide-y divide-red-200/60 dark:divide-red-900/40 text-xs">
            {recentCheatingAlerts.map((alert) => (
              <div key={alert.id} className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <div>
                  <span className="font-semibold text-neutral-900 dark:text-neutral-100">{alert.actorName}:</span>{" "}
                  <span className="text-neutral-700 dark:text-neutral-300">{alert.reason}</span>
                </div>
                <span className="font-mono text-[10px] text-neutral-500 whitespace-nowrap">
                  {formatJakartaDateTime(alert.timestamp)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metric Cards (Apple HIG Style) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="hig-card p-4 rounded-2xl">
          <div className="flex items-center justify-between text-[var(--text-secondary)] mb-1">
            <span className="text-[11px] font-medium">Total Karyawan</span>
            <Users className="w-3.5 h-3.5 text-[var(--text-tertiary)] stroke-[1.75]" />
          </div>
          <div className="text-2xl font-semibold text-[var(--text-primary)] tabular-numbers">
            {totalEmployees}
          </div>
          <span className="text-[11px] text-[var(--text-tertiary)] mt-1 block">Karyawan aktif terdaftar</span>
        </div>

        <div className="hig-card p-4 rounded-2xl">
          <div className="flex items-center justify-between text-[var(--text-secondary)] mb-1">
            <span className="text-[11px] font-medium">Hadir Hari Ini</span>
            <ClipboardList className="w-3.5 h-3.5 text-[var(--system-green)] stroke-[1.75]" />
          </div>
          <div className="text-2xl font-semibold text-[var(--text-primary)] tabular-numbers">
            {presentCount}
          </div>
          <span className="text-[11px] text-[var(--system-green)] mt-1 block tabular-numbers">
            {presentCount - lateCount} tepat waktu
          </span>
        </div>

        <div className="hig-card p-4 rounded-2xl">
          <div className="flex items-center justify-between text-[var(--text-secondary)] mb-1">
            <span className="text-[11px] font-medium">Terlambat</span>
            <AlertCircle className="w-3.5 h-3.5 text-[var(--system-red)] stroke-[1.75]" />
          </div>
          <div className="text-2xl font-semibold text-[var(--system-red)] tabular-numbers">
            {lateCount}
          </div>
          <span className="text-[11px] text-[var(--system-red)] mt-1 block tabular-numbers">
            {formatIDR(totalLateDeductions)} potongan denda
          </span>
        </div>

        <div className="hig-card p-4 rounded-2xl">
          <div className="flex items-center justify-between text-[var(--text-secondary)] mb-1">
            <span className="text-[11px] font-medium">Permintaan Buka Kunci</span>
            <Smartphone className="w-3.5 h-3.5 text-[var(--system-orange)] stroke-[1.75]" />
          </div>
          <div className="text-2xl font-semibold text-[var(--text-primary)] tabular-numbers">
            {pendingUnlockRequests}
          </div>
          <span className="text-[11px] text-[var(--text-secondary)] mt-1 block">
            {pendingUnlockRequests > 0 ? "Menunggu persetujuan" : "Semua perangkat aman"}
          </span>
        </div>
      </div>

      {/* Attendance Analytics & Trends */}
      <DashboardAnalytics />

      {/* Two Column Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Today's Punches */}
        <div className="lg:col-span-2 hig-card p-5 rounded-3xl">
          <div className="flex items-center justify-between mb-3 border-b border-[var(--separator-subtle)] pb-2.5">
            <div>
              <h2 className="text-xs font-semibold text-[var(--text-primary)]">
                Presensi Hari Ini
              </h2>
            </div>
            <Link href="/owner/attendance" className="text-xs text-[var(--accent)] hover:underline flex items-center">
              Lihat Semua
            </Link>
          </div>

          {todayAttendance.length === 0 ? (
            <div className="text-center py-8 text-xs text-[var(--text-tertiary)]">
              Belum ada catatan presensi untuk hari ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="hig-table">
                <thead>
                  <tr>
                    <th>Karyawan</th>
                    <th>Masuk</th>
                    <th>Keluar</th>
                    <th>Keterlambatan</th>
                    <th>Potongan Denda</th>
                    <th>Gaji Bersih</th>
                  </tr>
                </thead>
                <tbody className="tabular-numbers">
                  {todayAttendance.map((rec) => (
                    <tr key={rec.id}>
                      <td className="font-medium text-[var(--text-primary)]">{rec.employee.fullName}</td>
                      <td>{rec.checkInTime.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })}</td>
                      <td>{rec.checkOutTime ? rec.checkOutTime.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }) : "--"}</td>
                      <td>
                        {rec.lateMinutes > 0 ? (
                          <span className="hig-badge hig-badge-red">{rec.lateMinutes}m terlambat</span>
                        ) : (
                          <span className="hig-badge hig-badge-green">Tepat Waktu</span>
                        )}
                      </td>
                      <td className="text-[var(--system-red)] font-medium">
                        {rec.lateDeduction > 0 ? `-${formatIDR(rec.lateDeduction)}` : "Rp0"}
                      </td>
                      <td className="font-semibold text-[var(--system-green)]">
                        {formatIDR(rec.netDailyEarnings)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Audit Trail Activity */}
        <div className="hig-card p-5 rounded-3xl">
          <div className="flex items-center justify-between mb-3 border-b border-[var(--separator-subtle)] pb-2.5">
            <h2 className="text-xs font-semibold text-[var(--text-primary)]">
              Aktivitas Sistem Terkini
            </h2>
            <Link href="/owner/audit-logs" className="text-xs text-[var(--accent)] hover:underline">
              Semua Log
            </Link>
          </div>

          <div className="space-y-3">
            {recentAuditLogs.map((log) => (
              <div key={log.id} className="text-xs pb-2 border-b border-[var(--separator-subtle)] last:border-0">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[var(--text-primary)] font-mono text-[11px]">{log.action}</span>
                  <span className="text-[10px] text-[var(--text-tertiary)] tabular-numbers">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div className="text-[var(--text-secondary)] text-[11px] mt-0.5">
                  Aktor: {log.actorName} ({log.actorRole})
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
