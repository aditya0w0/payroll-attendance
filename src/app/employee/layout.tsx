import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, destroySession } from "@/lib/auth";
import { QrCode, Home, History, LogOut, User } from "lucide-react";

export default async function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const current = await getCurrentUser();

  if (!current || current.user.role !== "EMPLOYEE") {
    redirect("/login");
  }

  async function handleLogout() {
    "use server";
    await destroySession();
    redirect("/login");
  }

  const employeeName = current.user.employeeProfile?.fullName || current.user.username;

  return (
    <div className="min-h-screen flex flex-col bg-transparent max-w-md mx-auto pb-28 sm:pb-12 relative">
      {/* Liquid Glass Navigation Header */}
      <header className="sticky top-2 z-40 mx-3 mt-2 rounded-2xl liquid-glass px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500/20 to-indigo-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center font-medium text-xs border border-white/60 dark:border-white/10 shadow-inner">
            <User className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 leading-tight">
              {employeeName}
            </div>
            <div className="text-[10px] text-neutral-500 dark:text-neutral-400 font-mono">
              {current.user.employeeProfile?.employeeId} • {current.user.employeeProfile?.shift.name}
            </div>
          </div>
        </div>

        <form action={handleLogout}>
          <button
            type="submit"
            className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-xs"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </form>
      </header>

      {/* Main Content View */}
      <main className="flex-1 p-3 pt-3">{children}</main>

      {/* Liquid Glass Floating Dock Bottom Navigation */}
      <nav className="fixed bottom-4 left-4 right-4 max-w-sm mx-auto z-40 liquid-glass-pill px-6 py-2 flex justify-around items-center shadow-[0_12px_40px_rgba(0,0,0,0.15)]">
        <Link
          href="/employee"
          className="flex flex-col items-center gap-1 text-[11px] font-medium text-neutral-600 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          <Home className="w-5 h-5 stroke-[1.75]" />
          <span>Home</span>
        </Link>

        <Link
          href="/employee/scan"
          className="flex flex-col items-center -mt-5 group"
        >
          <div className="w-13 h-13 p-3 rounded-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-500 text-white flex items-center justify-center shadow-[0_8px_24px_rgba(37,99,235,0.45)] border-2 border-white/80 dark:border-white/25 group-hover:scale-105 group-active:scale-95 transition-all">
            <QrCode className="w-6 h-6 stroke-[2.2]" />
          </div>
          <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 mt-1 tracking-tight">Scan</span>
        </Link>

        <Link
          href="/employee/history"
          className="flex flex-col items-center gap-1 text-[11px] font-medium text-neutral-600 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          <History className="w-5 h-5 stroke-[1.75]" />
          <span>History</span>
        </Link>
      </nav>
    </div>
  );
}
