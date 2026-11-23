import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats integer amount to Indonesian Rupiah (IDR).
 * Uses deterministic string formatting to prevent SSR/CSR hydration mismatch.
 * Example: 150000 -> "Rp150.000", 0 -> "Rp0", -6000 -> "-Rp6.000"
 */
export function formatIDR(amount: number): string {
  const rounded = Math.round(amount || 0);
  const formatted = Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return rounded < 0 ? `-Rp${formatted}` : `Rp${formatted}`;
}

/**
 * Formats minutes into human-readable duration.
 * Example: 75 -> "1 hr 15 mins"
 */
export function formatDurationMinutes(minutes: number): string {
  if (minutes <= 0) return "0 mins";
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs > 0 && mins > 0) return `${hrs} hr ${mins} mins`;
  if (hrs > 0) return `${hrs} hr`;
  return `${mins} mins`;
}

/**
 * Converts a number to Indonesian written words (terbilang).
 * Example: 144000 -> "Seratus Empat Puluh Empat Ribu Rupiah"
 */
export function angkaKeTerbilang(angka: number): string {
  const nominal = Math.floor(Math.abs(angka || 0));
  if (nominal === 0) return "Nol Rupiah";

  const satuan = [
    "",
    "Satu",
    "Dua",
    "Tiga",
    "Empat",
    "Lima",
    "Enam",
    "Tujuh",
    "Delapan",
    "Sembilan",
    "Sepuluh",
    "Sebelas",
  ];

  function konversi(n: number): string {
    if (n < 12) return satuan[n];
    if (n < 20) return konversi(n - 10) + " Belas";
    if (n < 100) return konversi(Math.floor(n / 10)) + " Puluh " + konversi(n % 10);
    if (n < 200) return "Seratus " + konversi(n - 100);
    if (n < 1000) return konversi(Math.floor(n / 100)) + " Ratus " + konversi(n % 100);
    if (n < 2000) return "Seribu " + konversi(n - 1000);
    if (n < 1000000) return konversi(Math.floor(n / 1000)) + " Ribu " + konversi(n % 1000);
    if (n < 1000000000) return konversi(Math.floor(n / 1000000)) + " Juta " + konversi(n % 1000000);
    if (n < 1000000000000) return konversi(Math.floor(n / 1000000000)) + " Miliar " + konversi(n % 1000000000);
    return String(n);
  }

  const hasil = konversi(nominal).replace(/\s+/g, " ").trim();
  return `${hasil} Rupiah`;
}
