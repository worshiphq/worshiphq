import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes safely (conditional + conflict resolution). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a Date (or ISO string) as e.g. "5 Jun 2026". */
export function formatDate(date: Date | string, opts?: Intl.DateTimeFormatOptions) {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-GH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...opts,
  });
}

/** Initials from a full name, max 2 chars. */
export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

/** Compact number e.g. 12_400 -> "12.4K". */
export function compactNumber(n: number) {
  return Intl.NumberFormat("en-GH", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/** Deterministic pick from an array based on a string seed (stable demo data). */
export function seededPick<T>(arr: T[], seed: string): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h << 5) - h + seed.charCodeAt(i);
  return arr[Math.abs(h) % arr.length];
}
