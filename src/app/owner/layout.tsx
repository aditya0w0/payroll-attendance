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
    <div className="min-h-screen flex flex-col bg-[var(--system-bg)]">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-[var(--card-bg)]/85 backdrop-blur-md border-b border-[var(--separator)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-[var(--text-primary)] text-[var(--system-bg)] flex items-center justify-center">
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
            <span className="hig-badge hig-badge-neutral text-[10px] font-semibold">
              OWNER
            </span>
            <form action={handleLogout}>
              <button
                type="submit"
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1 rounded transition-colors flex items-center gap-1 text-xs"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5 stroke-[1.75]" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </form>
          </div>
        </div>

        {/* Apple HIG Segmented Bar */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 border-t border-[var(--separator-subtle)] overflow-x-auto">
          <nav className="flex space-x-1 py-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-2.5 py-1 text-xs font-medium rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--separator-subtle)] flex items-center gap-1.5 transition-colors whitespace-nowrap"
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
