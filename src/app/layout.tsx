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
    <html lang="en">
      <body className="antialiased selection:bg-blue-500/20">{children}</body>
    </html>
  );
}
