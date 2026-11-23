import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, destroySession } from "@/lib/auth";
import {
  Users,
  Clock,
  ClipboardList,
  Wallet,
  Smartphone,
  Shield,
  QrCode,
  LogOut,
  LayoutDashboard,
  MapPin,
} from "lucide-react";

export default async function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const current = await getCurrentUser();

  if (!current || current.user.role !== "OWNER") {
    redirect("/login");
  }

  const navItems = [
    { href: "/owner", label: "Ringkasan", icon: LayoutDashboard },
    { href: "/owner/employees", label: "Karyawan", icon: Users },
    { href: "/owner/shifts", label: "Shift & Aturan", icon: Clock },
    { href: "/owner/attendance", label: "Presensi", icon: ClipboardList },
    { href: "/owner/payroll", label: "Penggajian", icon: Wallet },
    { href: "/owner/devices", label: "Keamanan Perangkat", icon: Smartphone },
    { href: "/owner/settings", label: "Lokasi & Jaringan", icon: MapPin },
    { href: "/owner/audit-logs", label: "Log Audit", icon: Shield },
    { href: "/owner/qr", label: "Terminal QR", icon: QrCode },
  ];

  async function handleLogout() {
    "use server";
    await destroySession();
    redirect("/login");
  }

  return (
    <div className="min-h-screen flex flex-col bg-transparent">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#0b0f19]/95 border-b border-slate-200 dark:border-slate-800 shadow-xs backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Shield className="w-3.5 h-3.5 stroke-[2]" />
            </div>
            <span className="text-xs font-semibold tracking-tight text-[var(--text-primary)]">CyberGuard</span>
            <span className="text-xs text-[var(--text-tertiary)]">/</span>
            <span className="text-xs text-[var(--text-secondary)]">Konsol Pemilik</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] text-[var(--text-tertiary)] hidden sm:inline tabular-numbers">
              WIB (UTC+7)
            </span>
            <span className="hig-badge text-[10px] font-bold tracking-wider uppercase bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              PEMILIK
            </span>
            <form action={handleLogout}>
              <button
                type="submit"
                className="min-h-[44px] px-3 py-2 text-xs rounded-lg flex items-center gap-1.5 transition-colors text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700"
                title="Keluar dari akun"
              >
                <LogOut className="w-3.5 h-3.5 stroke-[1.75]" />
                <span className="hidden sm:inline">Keluar</span>
              </button>
            </form>
          </div>
        </div>

        {/* Subheader Navigation Bar (R-03: min 44px tap target height) */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 border-t border-slate-200 dark:border-slate-800 overflow-x-auto">
          <nav className="flex space-x-1 py-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="min-h-[44px] px-3.5 py-2 text-xs font-medium rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors whitespace-nowrap active:scale-[0.98]"
                >
                  <Icon className="w-3.5 h-3.5 stroke-[1.75]" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {children}
      </main>
    </div>
  );
}
