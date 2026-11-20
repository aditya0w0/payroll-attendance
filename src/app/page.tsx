import Link from "next/link";
import { Shield, UserCheck, QrCode } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col justify-between p-6 sm:p-12 max-w-4xl mx-auto">
      {/* Header */}
      <header className="flex justify-between items-center py-4 border-b border-[var(--separator)]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[var(--text-primary)] text-[var(--system-bg)] flex items-center justify-center">
            <Shield className="w-4 h-4 stroke-[2]" />
          </div>
          <div>
            <span className="text-sm font-semibold tracking-tight">CyberGuard</span>
            <span className="text-xs text-[var(--text-secondary)] ml-1.5 font-normal">Presensi &amp; Penggajian</span>
          </div>
        </div>

        <Link
          href="/login"
          className="hig-button-primary text-xs"
        >
          Masuk
        </Link>
      </header>

      {/* Main Hero */}
      <main className="my-auto py-16 max-w-2xl mx-auto text-center">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[var(--text-primary)] mb-3">
          Presensi Karyawan &amp; Penggajian Harian
        </h1>

        <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed mb-10 max-w-lg mx-auto">
          Pencatatan kehadiran kerja dan kalkulasi upah harian tim secara transparan.
        </p>

        {/* Action Cards */}
        <div className="grid sm:grid-cols-2 gap-4 text-left">
          <Link
            href="/login?role=owner"
            className="hig-card p-6 hover:border-[var(--accent)] transition-colors group cursor-pointer flex flex-col justify-between gap-4"
          >
            <div>
              <div className="w-9 h-9 rounded-lg bg-[var(--accent-tint)] text-[var(--accent)] flex items-center justify-center mb-4">
                <UserCheck className="w-5 h-5 stroke-[2]" />
              </div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
                Portal Pemilik
              </h2>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Pantau kehadiran tim, persetujuan presensi, dan rekap penggajian.
              </p>
            </div>
            <div className="text-xs font-medium text-[var(--accent)]">
              Buka Portal Pemilik
            </div>
          </Link>

          <Link
            href="/login?role=employee"
            className="hig-card p-6 hover:border-[var(--accent)] transition-colors group cursor-pointer flex flex-col justify-between gap-4"
          >
            <div>
              <div className="w-9 h-9 rounded-lg bg-[var(--accent-tint)] text-[var(--accent)] flex items-center justify-center mb-4">
                <QrCode className="w-5 h-5 stroke-[2]" />
              </div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
                Portal Karyawan
              </h2>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Presensi masuk dan pulang kerja, serta riwayat upah harian.
              </p>
            </div>
            <div className="text-xs font-medium text-[var(--accent)]">
              Buka Portal Karyawan
            </div>
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 border-t border-[var(--separator)] flex flex-col sm:flex-row justify-between items-center text-xs text-[var(--text-secondary)] gap-2">
        <span>CyberGuard Attendance Systems</span>
        <span>Asia/Jakarta (WIB)</span>
      </footer>
    </div>
  );
}