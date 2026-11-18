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
      <body className="antialiased selection:bg-blue-600/10 bg-slate-50 dark:bg-[#0b0f19] text-neutral-900 dark:text-neutral-100 min-h-screen relative">
        {children}
      </body>
    </html>
  );
}
