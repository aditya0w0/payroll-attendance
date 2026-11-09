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
      <body className="antialiased selection:bg-blue-500/20 bg-neutral-50 dark:bg-black text-neutral-900 dark:text-neutral-50 min-h-screen">
        {children}
      </body>
    </html>
  );
}
