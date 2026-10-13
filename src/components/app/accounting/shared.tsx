"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Ledger, LedgerFilters, Period } from "@/lib/data/ledger";
import { ledgerQuery } from "@/lib/ledger-query";

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export interface LedgerAccount { id: string; name: string; isDefault: boolean }

/**
 * Navigate by changing the period or filters. The page re-renders on the server
 * with the new data; `pending` is true while that happens so the UI can dim.
 */
export function useLedgerNav(ledger: Ledger) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();

  const hrefFor = (patch: { period?: Partial<Period>; filters?: Partial<LedgerFilters> }) => {
    const period = { ...ledger.period, ...(patch.period ?? {}) } as Period;
    const filters = { ...ledger.filters, ...(patch.filters ?? {}) } as LedgerFilters;
    // Any change other than paging goes back to page 1.
    if (patch.filters?.page === undefined) filters.page = 1;
    return `${pathname}?${ledgerQuery(period, filters).toString()}`;
  };
  const go = (patch: { period?: Partial<Period>; filters?: Partial<LedgerFilters> }) => start(() => router.replace(hrefFor(patch), { scroll: false }));
  const clearFilters = () =>
    go({ filters: { type: "", source: "", account: "", fund: "", category: "", q: "" } });

  return { go, hrefFor, clearFilters, pending };
}

export const sourceLabel = (s: "manual" | "giving" | "expense") => (s === "giving" ? "Giving" : s === "expense" ? "Expense" : "Entry");

/** "+₵1,200" / "−₵300" with the sign placed outside the currency symbol. */
export function signed(amount: number, fmt: (n: number, o?: { decimals?: boolean }) => string, decimals = false) {
  return `${amount >= 0 ? "+" : "−"}${fmt(Math.abs(amount), { decimals })}`;
}

export const fieldCls =
  "h-9 rounded-lg border border-line bg-surface px-2.5 text-sm outline-none focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/25";
