// Plain (server and client safe) helper: the query string that reproduces an
// accounting period + filters. Defaults are left out to keep URLs short.
import type { LedgerFilters, Period } from "@/lib/data/ledger";

export function ledgerQuery(period: Period, f: LedgerFilters): URLSearchParams {
  const sp = new URLSearchParams();
  sp.set("p", period.kind);
  if (period.kind === "month") { sp.set("y", String(period.year)); sp.set("m", String(period.month)); }
  if (period.kind === "year") sp.set("y", String(period.year));
  if (period.kind === "custom" && period.from && period.to) { sp.set("from", period.from); sp.set("to", period.to); }
  if (f.type) sp.set("type", f.type);
  if (f.source) sp.set("src", f.source);
  if (f.account) sp.set("acct", f.account);
  if (f.fund) sp.set("fund", f.fund);
  if (f.category) sp.set("cat", f.category);
  if (f.q) sp.set("q", f.q);
  if (f.sort !== "newest") sp.set("sort", f.sort);
  if (!f.group) sp.set("grp", "0");
  if (f.page > 1) sp.set("page", String(f.page));
  return sp;
}
