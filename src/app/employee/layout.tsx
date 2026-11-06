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
    <div className="min-h-screen flex flex-col bg-neutral-50 dark:bg-black max-w-md mx-auto pb-24 sm:pb-10 border-x border-neutral-200 dark:border-neutral-900 shadow-sm">
      {/* iOS Navigation Header */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md border-b border-neutral-200 dark:border-neutral-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 flex items-center justify-center font-medium text-xs border border-neutral-200 dark:border-neutral-700">
            <User className="w-4 h-4 text-neutral-600 dark:text-neutral-300" />
          </div>
          <div>
            <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 leading-tight">
              {employeeName}
            </div>
            <div className="text-[10px] text-neutral-500 font-mono">
              {current.user.employeeProfile?.employeeId} • {current.user.employeeProfile?.shift.name}
            </div>
          </div>
        </div>

        <form action={handleLogout}>
          <button
            type="submit"
            className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 p-1.5 rounded-lg text-xs"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </form>
      </header>

      {/* Main Content View */}
      <main className="flex-1 p-4">{children}</main>

      {/* iOS Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto z-40 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md border-t border-neutral-200 dark:border-neutral-800 flex justify-around items-center py-2 px-6">
        <Link
          href="/employee"
          className="flex flex-col items-center gap-1 text-[11px] font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
        >
          <Home className="w-5 h-5 stroke-[1.75]" />
          <span>Home</span>
        </Link>

        <Link
          href="/employee/scan"
          className="flex flex-col items-center -mt-4 group"
        >
          <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-md border-2 border-white dark:border-neutral-900 group-hover:bg-blue-700 transition-colors">
            <QrCode className="w-6 h-6 stroke-[2]" />
          </div>
          <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 mt-1">Scan</span>
        </Link>

        <Link
          href="/employee/history"
          className="flex flex-col items-center gap-1 text-[11px] font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
        >
          <History className="w-5 h-5 stroke-[1.75]" />
          <span>History</span>
        </Link>
      </nav>
    </div>
  );
}
