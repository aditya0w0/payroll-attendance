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
      <body className="antialiased selection:bg-purple-500/20 bg-[#f2f4fa] dark:bg-[#0a0a14] text-neutral-900 dark:text-neutral-50 min-h-screen relative overflow-x-hidden">
        {/* Apple Dynamic Liquid Glass Wallpaper Canvas */}
        <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden" aria-hidden="true">
          {/* Top Violet / Purple Aurora Mesh */}
          <div className="absolute -top-[15%] left-[5%] w-[65vw] h-[65vw] max-w-[700px] max-h-[700px] rounded-full bg-gradient-to-br from-purple-500/30 via-violet-500/25 to-indigo-500/20 blur-[110px] dark:from-purple-800/40 dark:via-violet-900/35 dark:to-indigo-950/30" />
          <div className="absolute -top-[10%] -right-[10%] w-[55vw] h-[55vw] max-w-[600px] max-h-[600px] rounded-full bg-gradient-to-bl from-fuchsia-400/25 via-pink-400/15 to-violet-500/20 blur-[120px] dark:from-fuchsia-950/30 dark:via-purple-950/30 dark:to-violet-900/25" />

          {/* Vertical Specular Light Beams (as seen in macOS Sonoma/Sequoia wallpapers) */}
          <div className="absolute top-0 left-1/4 w-32 h-[85vh] bg-gradient-to-b from-purple-400/25 via-violet-300/12 to-transparent blur-3xl transform -rotate-12 dark:from-purple-500/25 dark:via-violet-500/10" />
          <div className="absolute top-0 right-1/3 w-28 h-[85vh] bg-gradient-to-b from-indigo-300/25 via-sky-300/12 to-transparent blur-3xl transform rotate-6 dark:from-indigo-500/25 dark:via-sky-600/10" />

          {/* Center Azure & Cyan Refraction Pool */}
          <div className="absolute top-[35%] -left-[10%] w-[50vw] h-[50vw] max-w-[550px] max-h-[550px] rounded-full bg-gradient-to-tr from-cyan-400/25 via-sky-400/20 to-blue-500/25 blur-[120px] dark:from-cyan-900/25 dark:via-sky-950/30 dark:to-blue-900/25" />

          {/* Floating Bottom Dock Glowing Violet Aura (Exact reflection for bottom navigation pill) */}
          <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-[90vw] max-w-[480px] h-52 rounded-full bg-gradient-to-t from-purple-600/35 via-indigo-600/25 to-transparent blur-[85px] dark:from-purple-700/40 dark:via-indigo-800/30 dark:to-transparent" />
        </div>
        {children}
      </body>
    </html>
  );
}
