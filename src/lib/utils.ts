import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats integer amount to Indonesian Rupiah (IDR).
 * Example: 150000 -> "Rp150.000"
 */
export function formatIDR(amount: number): string {
  const rounded = Math.round(amount || 0);
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(rounded);
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
