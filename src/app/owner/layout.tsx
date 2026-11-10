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
    { href: "/owner", label: "Overview", icon: LayoutDashboard },
    { href: "/owner/employees", label: "Employees", icon: Users },
    { href: "/owner/shifts", label: "Shifts & Policies", icon: Clock },
    { href: "/owner/attendance", label: "Attendance", icon: ClipboardList },
    { href: "/owner/payroll", label: "Payroll", icon: Wallet },
    { href: "/owner/devices", label: "Device Security", icon: Smartphone },
    { href: "/owner/settings", label: "Location & WiFi", icon: MapPin },
    { href: "/owner/audit-logs", label: "Audit Logs", icon: Shield },
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
      <header className="sticky top-0 z-40 liquid-glass border-b border-white/30 dark:border-white/10 shadow-sm backdrop-blur-2xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-sm border border-white/30">
              <Shield className="w-3.5 h-3.5 stroke-[2]" />
            </div>
            <span className="text-xs font-semibold tracking-tight text-[var(--text-primary)]">CyberGuard</span>
            <span className="text-xs text-[var(--text-tertiary)]">/</span>
            <span className="text-xs text-[var(--text-secondary)]">Management Console</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] text-[var(--text-tertiary)] hidden sm:inline tabular-numbers">
              WIB (UTC+7)
            </span>
            <span className="liquid-glass-pill px-2.5 py-0.5 text-[10px] font-bold tracking-wider uppercase bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30">
              OWNER
            </span>
            <form action={handleLogout}>
              <button
                type="submit"
                className="liquid-glass-btn-secondary px-2.5 py-1 text-xs rounded-xl flex items-center gap-1.5 transition-all text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5 stroke-[1.75]" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </form>
          </div>
        </div>

        {/* Apple HIG Segmented Bar */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 border-t border-white/20 dark:border-white/10 overflow-x-auto">
          <nav className="flex space-x-1 py-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-3 py-1.5 text-xs font-medium rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/40 dark:hover:bg-white/10 flex items-center gap-1.5 transition-all whitespace-nowrap active:scale-[0.98]"
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
