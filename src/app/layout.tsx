import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Payroll & QR Attendance System",
  description: "Enterprise Zero-Trust Single-Device Attendance and Daily Payroll Engine",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var mql = window.matchMedia('(prefers-color-scheme: dark)');
                  function updateTheme(e) {
                    if (e.matches) {
                      document.documentElement.classList.add('dark');
                      document.documentElement.classList.remove('light');
                    } else {
                      document.documentElement.classList.remove('dark');
                      document.documentElement.classList.add('light');
                    }
                  }
                  updateTheme(mql);
                  if (mql.addEventListener) {
                    mql.addEventListener('change', updateTheme);
                  } else if (mql.addListener) {
                    mql.addListener(updateTheme);
                  }
                } catch (err) {}
              })();
            `,
          }}
        />
      </head>
      <body className="antialiased selection:bg-blue-500/20 bg-slate-50 dark:bg-[#090b11] text-neutral-900 dark:text-neutral-50 min-h-screen relative overflow-x-hidden">
        {/* Ambient Liquid Glass Aura Orbs */}
        <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden" aria-hidden="true">
          <div className="absolute -top-[15%] -left-[10%] w-[55vw] h-[55vw] max-w-[620px] max-h-[620px] rounded-full bg-gradient-to-tr from-blue-400/20 via-indigo-400/20 to-sky-300/15 blur-[100px] dark:from-blue-600/15 dark:via-indigo-700/15 dark:to-cyan-600/10" />
          <div className="absolute top-[35%] -right-[15%] w-[50vw] h-[50vw] max-w-[560px] max-h-[560px] rounded-full bg-gradient-to-br from-teal-300/20 via-sky-300/15 to-indigo-400/20 blur-[110px] dark:from-indigo-900/25 dark:via-blue-900/20 dark:to-teal-900/15" />
          <div className="absolute -bottom-[10%] left-[15%] w-[48vw] h-[48vw] max-w-[520px] max-h-[520px] rounded-full bg-gradient-to-tr from-sky-400/20 via-cyan-300/15 to-blue-400/15 blur-[100px] dark:from-blue-950/40 dark:via-purple-950/20 dark:to-slate-900/30" />
        </div>
        {children}
      </body>
    </html>
  );
}
