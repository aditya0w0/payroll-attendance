import Link from "next/link";
import { Shield, Smartphone, ArrowRight, UserCheck, QrCode } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col justify-between p-6 sm:p-12 max-w-4xl mx-auto">
      {/* Navigation */}
      <header className="flex justify-between items-center py-4 border-b border-[var(--separator)]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[var(--text-primary)] text-[var(--system-bg)] flex items-center justify-center">
            <Shield className="w-4 h-4 stroke-[2]" />
          </div>
          <div>
            <span className="text-sm font-semibold tracking-tight">CyberGuard</span>
            <span className="text-xs text-[var(--text-secondary)] ml-1.5 font-normal">Attendance & Payroll</span>
          </div>
        </div>

        <Link
          href="/login"
          className="hig-button-primary text-xs"
        >
          Sign In
        </Link>
      </header>

      {/* Main Hero */}
      <main className="my-auto py-16 max-w-2xl mx-auto text-center">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-[var(--text-secondary)] bg-[var(--card-bg)] border border-[var(--separator)] mb-6 shadow-sm">
          <Smartphone className="w-3.5 h-3.5 text-[var(--accent)]" />
          Single-Device Authorization & Dynamic QR
        </div>

        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[var(--text-primary)] mb-4">
          Attendance and Daily Payroll.
        </h1>

        <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed mb-12 max-w-xl mx-auto">
          An attendance and wage management system. Owners configure work shifts and daily salaries. Employees scan workplace dynamic QR codes to check in and check out, viewing transparent daily earnings and deductions.
        </p>

        {/* Action Cards */}
        <div className="grid sm:grid-cols-2 gap-4 text-left">
          <Link
            href="/login"
            className="hig-card p-6 hover:border-[var(--accent)] transition-colors group cursor-pointer"
          >
            <div className="w-9 h-9 rounded-lg bg-[var(--accent-tint)] text-[var(--accent)] flex items-center justify-center mb-4">
              <UserCheck className="w-5 h-5 stroke-[2]" />
            </div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1 flex items-center justify-between">
              Owner Console
              <ArrowRight className="w-4 h-4 text-[var(--text-tertiary)] group-hover:text-[var(--accent)] transition-colors" />
            </h2>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Manage workforce profiles, set daily wages, configure daytime and overnight shifts, review attendance, and inspect append-only audit logs.
            </p>
          </Link>

          <Link
            href="/login"
            className="hig-card p-6 hover:border-[var(--accent)] transition-colors group cursor-pointer"
          >
            <div className="w-9 h-9 rounded-lg bg-[var(--accent-tint)] text-[var(--accent)] flex items-center justify-center mb-4">
              <QrCode className="w-5 h-5 stroke-[2]" />
            </div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1 flex items-center justify-between">
              Employee Portal
              <ArrowRight className="w-4 h-4 text-[var(--text-tertiary)] group-hover:text-[var(--accent)] transition-colors" />
            </h2>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Mobile-first interface. Scan workplace QR to record check-in and check-out, with immediate salary breakdowns and deduction reporting.
            </p>
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 border-t border-[var(--separator)] flex flex-col sm:flex-row justify-between items-center text-xs text-[var(--text-secondary)] gap-2">
        <span>Business Timezone: Asia/Jakarta (UTC+7)</span>
        <span>Zero-Trust Architecture</span>
      </footer>
    </div>
  );
}
