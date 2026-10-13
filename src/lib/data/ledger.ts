import "server-only";
import { db } from "@/lib/db";
import { defaultAccountId } from "@/lib/data/accounts";

/**
 * The accounting ledger: every cedi that came in (giving, other income) or went
 * out (expenses, outgoing entries) in one place, with period + filter handling,
 * totals, breakdowns and a page of rows. All three money tables are merged here
 * so Accounting always agrees with Giving and Expenses.
 */

export type PeriodKind = "month" | "year" | "all" | "custom";

export interface Period {
  kind: PeriodKind;
  year: number;
  month: number; // 0-11
  from: string | null; // YYYY-MM-DD (custom)
  to: string | null;
}

export interface LedgerFilters {
  type: "" | "income" | "expense";
  source: "" | "giving" | "expense" | "manual";
  account: string; // "" = all, "none" = unassigned, else an account id
  fund: string;
  category: string;
  q: string;
  sort: "newest" | "oldest" | "largest";
  group: boolean; // summarise giving by day
  page: number;
}

export interface LedgerRow {
  id: string;
  description: string;
  category: string;
  fund: string;
  amount: number; // signed: + income, − expense
  date: string;
  source: "manual" | "giving" | "expense";
  accountId: string | null;
  /** Paid-by label for gifts (Cash, MTN MoMo…). */
  method?: string | null;
  /** Received but not put into an account yet (e.g. cash in hand). */
  pending?: boolean;
  /** A summarised day of giving: the gifts inside it. */
  group?: LedgerRow[];
}

export interface Bucket {
  key: string;
  label: string;
  sub: string;
  from: string; // YYYY-MM-DD
  to: string;
  income: number;
  expenses: number;
  count: number;
}

export interface NameTotal { name: string; income: number; expenses: number; count: number }

export interface Ledger {
  period: Period;
  label: string;
  fromYmd: string | null;
  toYmd: string | null;
  filters: LedgerFilters;
  activeFilters: number;
  totals: { income: number; expenses: number; net: number; count: number };
  previous: { label: string; income: number; expenses: number; net: number } | null;
  rows: LedgerRow[];
  pageInfo: { page: number; pages: number; total: number; pageSize: number };
  bucketKind: "week" | "month";
  buckets: Bucket[];
  byCategory: NameTotal[];
  byFund: NameTotal[];
  byAccount: { accountId: string | null; income: number; expenses: number; count: number }[];
  options: { categories: string[]; funds: string[] };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const PAGE_SIZE = 40;
const METHOD: Record<string, string> = { MTN_MoMo: "MTN MoMo", Telecel_Cash: "Telecel Cash", AirtelTigo: "AirtelTigo", Card: "Card", Cash: "Cash", Bank: "Bank" };

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const startOfDay = (s: string) => new Date(`${s}T00:00:00`);
const endOfDay = (s: string) => new Date(`${s}T23:59:59.999`);
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Read the period + filters from the page's query string (old links keep working). */
export function parseLedgerParams(params: Record<string, string | string[] | undefined>, now = new Date()): { period: Period; filters: LedgerFilters } {
  const y = parseInt(first(params.y) || first(params.year), 10);
  const mRaw = first(params.m) !== "" ? first(params.m) : first(params.month);
  const m = parseInt(mRaw, 10);
  let kind = first(params.p) as PeriodKind;
  if (!["month", "year", "all", "custom"].includes(kind)) kind = first(params.allTime) === "1" ? "all" : "month";
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const from = iso.test(first(params.from)) ? first(params.from) : null;
  const to = iso.test(first(params.to)) ? first(params.to) : null;
  if (kind === "custom" && !(from && to)) kind = "month";

  const period: Period = {
    kind,
    year: Number.isFinite(y) && y > 1990 && y < 2200 ? y : now.getFullYear(),
    month: Number.isFinite(m) && m >= 0 && m <= 11 ? m : now.getMonth(),
    from,
    to,
  };

  const pick = <T extends string>(v: string, allowed: readonly T[], fallback: T): T => ((allowed as readonly string[]).includes(v) ? (v as T) : fallback);
  const filters: LedgerFilters = {
    type: pick(first(params.type), ["", "income", "expense"] as const, ""),
    source: pick(first(params.src), ["", "giving", "expense", "manual"] as const, ""),
    account: first(params.acct),
    fund: first(params.fund),
    category: first(params.cat),
    q: first(params.q).trim().slice(0, 80),
    sort: pick(first(params.sort), ["newest", "oldest", "largest"] as const, "newest"),
    group: first(params.grp) !== "0",
    page: Math.max(1, parseInt(first(params.page), 10) || 1),
  };
  return { period, filters };
}

export function periodBounds(p: Period): { from: Date | null; to: Date | null; label: string } {
  if (p.kind === "all") return { from: null, to: null, label: "All time" };
  if (p.kind === "year") return { from: new Date(p.year, 0, 1), to: new Date(p.year, 11, 31, 23, 59, 59, 999), label: String(p.year) };
  if (p.kind === "custom" && p.from && p.to) {
    const [a, b] = p.from <= p.to ? [p.from, p.to] : [p.to, p.from];
    const fmt = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    return { from: startOfDay(a), to: endOfDay(b), label: `${fmt(a)} - ${fmt(b)}` };
  }
  return { from: new Date(p.year, p.month, 1), to: new Date(p.year, p.month + 1, 0, 23, 59, 59, 999), label: `${MONTHS[p.month]} ${p.year}` };
}

function previousPeriod(p: Period): Period | null {
  if (p.kind === "month") return p.month === 0 ? { ...p, year: p.year - 1, month: 11 } : { ...p, month: p.month - 1 };
  if (p.kind === "year") return { ...p, year: p.year - 1 };
  if (p.kind === "custom" && p.from && p.to) {
    const a = startOfDay(p.from <= p.to ? p.from : p.to), b = endOfDay(p.from <= p.to ? p.to : p.from);
    const days = Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
    const pb = new Date(a.getTime() - 86400000);
    const pa = new Date(pb.getTime() - (days - 1) * 86400000);
    return { ...p, from: ymd(pa), to: ymd(pb) };
  }
  return null;
}

async function loadRows(churchId: string, from: Date | null, to: Date | null): Promise<LedgerRow[]> {
  const where = { churchId, ...(from && to ? { date: { gte: from, lte: to } } : {}) };
  const [txns, gifts, expenses] = await Promise.all([
    db.transaction.findMany({ where, select: { id: true, description: true, category: true, fund: true, amount: true, date: true, accountId: true, pendingDeposit: true } }),
    db.gift.findMany({ where, select: { id: true, donorName: true, amount: true, date: true, accountId: true, pendingDeposit: true, method: true, fund: { select: { name: true } }, person: { select: { firstName: true, lastName: true } } } }),
    db.expense.findMany({ where, select: { id: true, description: true, category: true, amount: true, date: true, vendor: true, accountId: true } }),
  ]);
  return [
    ...txns.map((t): LedgerRow => ({ id: t.id, description: t.description, category: t.category, fund: t.fund ?? "General", amount: Number(t.amount), date: t.date.toISOString(), source: "manual", accountId: t.accountId, pending: t.pendingDeposit })),
    // Expenses live in their own table (the single source of truth), shown here as outgoing rows.
    ...expenses.map((e): LedgerRow => ({ id: e.id, description: `${e.description}${e.vendor ? ` (${e.vendor})` : ""}`, category: e.category, fund: "General", amount: -Number(e.amount), date: e.date.toISOString(), source: "expense", accountId: e.accountId })),
    ...gifts.map((g): LedgerRow => ({
      id: g.id,
      description: `${g.person ? `${g.person.firstName} ${g.person.lastName}` : g.donorName ?? "Anonymous"} - ${g.fund?.name ?? "Gift"}`,
      category: g.fund?.name ?? "Giving",
      fund: g.fund?.name ?? "General",
      amount: Number(g.amount),
      date: g.date.toISOString(),
      source: "giving",
      accountId: g.accountId,
      pending: g.pendingDeposit,
      method: METHOD[g.method] ?? g.method,
    })),
  ];
}

function filterRows(rows: LedgerRow[], f: LedgerFilters, defaultId: string | null): LedgerRow[] {
  const q = f.q.toLowerCase();
  return rows.filter((r) => {
    if (f.type === "income" && r.amount < 0) return false;
    if (f.type === "expense" && r.amount >= 0) return false;
    if (f.source && r.source !== f.source) return false;
    if (f.fund && r.fund !== f.fund) return false;
    if (f.category && r.category !== f.category) return false;
    if (f.account) {
      const eff = r.accountId ?? null;
      if (f.account === "none") { if (eff) return false; }
      else if (r.pending || (eff ?? defaultId) !== f.account) return false; // money with no account counts under the default one (unless it's not banked yet)
    }
    if (q && !`${r.description} ${r.category} ${r.fund}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

const sum = (rows: LedgerRow[]) => {
  let income = 0, expenses = 0;
  for (const r of rows) { if (r.amount >= 0) income += r.amount; else expenses += -r.amount; }
  return { income, expenses, net: income - expenses, count: rows.length };
};

/** Church weeks (Sunday to Saturday) inside [from, to]. */
function weeksIn(from: Date, to: Date) {
  const out: { start: Date; end: Date }[] = [];
  let s = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  while (s <= to) {
    const e = new Date(s);
    e.setDate(s.getDate() + (6 - s.getDay()));
    e.setHours(23, 59, 59, 999);
    const end = e > to ? new Date(to) : e;
    out.push({ start: new Date(s), end });
    s = new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1);
  }
  return out;
}

function buildBuckets(rows: LedgerRow[], from: Date | null, to: Date | null): { kind: "week" | "month"; buckets: Bucket[] } {
  if (rows.length === 0 && !(from && to)) return { kind: "month", buckets: [] };
  const dates = rows.map((r) => new Date(r.date).getTime());
  const lo = from ?? new Date(Math.min(...dates));
  const hi = to ?? new Date(Math.max(...dates));
  const days = (hi.getTime() - lo.getTime()) / 86400000;
  const short = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  if (days <= 62) {
    const buckets = weeksIn(lo, hi).map((w, i): Bucket => ({
      key: ymd(w.start), label: `Week ${i + 1}`, sub: `${short(w.start)} - ${short(w.end)}`, from: ymd(w.start), to: ymd(w.end), income: 0, expenses: 0, count: 0,
    }));
    for (const r of rows) {
      const t = new Date(r.date);
      const b = buckets.find((x) => t >= startOfDay(x.from) && t <= endOfDay(x.to));
      if (!b) continue;
      if (r.amount >= 0) b.income += r.amount; else b.expenses += -r.amount;
      b.count++;
    }
    return { kind: "week", buckets };
  }

  const buckets: Bucket[] = [];
  const cur = new Date(lo.getFullYear(), lo.getMonth(), 1);
  while (cur <= hi && buckets.length < 240) {
    const end = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
    buckets.push({ key: `${cur.getFullYear()}-${cur.getMonth()}`, label: `${MONTHS[cur.getMonth()].slice(0, 3)} ${cur.getFullYear()}`, sub: MONTHS[cur.getMonth()], from: ymd(cur), to: ymd(end), income: 0, expenses: 0, count: 0 });
    cur.setMonth(cur.getMonth() + 1);
  }
  const idx = new Map(buckets.map((b) => [b.key, b]));
  for (const r of rows) {
    const t = new Date(r.date);
    const b = idx.get(`${t.getFullYear()}-${t.getMonth()}`);
    if (!b) continue;
    if (r.amount >= 0) b.income += r.amount; else b.expenses += -r.amount;
    b.count++;
  }
  return { kind: "month", buckets };
}

function groupBy(rows: LedgerRow[], key: (r: LedgerRow) => string): NameTotal[] {
  const m = new Map<string, NameTotal>();
  for (const r of rows) {
    const k = key(r) || "Other";
    const e = m.get(k) ?? { name: k, income: 0, expenses: 0, count: 0 };
    if (r.amount >= 0) e.income += r.amount; else e.expenses += -r.amount;
    e.count++;
    m.set(k, e);
  }
  return [...m.values()].sort((a, b) => b.income + b.expenses - (a.income + a.expenses));
}

/** Giving is recorded gift by gift; show each day's gifts to a fund as one line you can open. */
function summariseGiving(rows: LedgerRow[]): LedgerRow[] {
  const out: LedgerRow[] = [];
  const groups = new Map<string, LedgerRow[]>();
  for (const r of rows) {
    if (r.source !== "giving") { out.push(r); continue; }
    const k = `${r.date.slice(0, 10)}|${r.fund}|${r.accountId ?? ""}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }
  for (const [k, items] of groups) {
    if (items.length === 1) { out.push(items[0]); continue; }
    const total = items.reduce((s, x) => s + x.amount, 0);
    const latest = items.reduce((a, b) => (a.date > b.date ? a : b));
    out.push({
      id: `grp:${k}`,
      description: `${items[0].fund} - ${items.length} gifts`,
      category: items[0].category,
      fund: items[0].fund,
      amount: total,
      date: latest.date,
      source: "giving",
      accountId: items[0].accountId,
      group: items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 300),
    });
  }
  return out;
}

export async function getLedger(churchId: string, period: Period, filters: LedgerFilters): Promise<Ledger> {
  const { from, to, label } = periodBounds(period);
  const [rows, defaultId] = await Promise.all([loadRows(churchId, from, to), defaultAccountId(churchId)]);

  const filtered = filterRows(rows, filters, defaultId);
  const totals = sum(filtered);

  // Previous period (same filters) for "vs last month".
  let previous: Ledger["previous"] = null;
  const prevP = previousPeriod(period);
  if (prevP) {
    const pb = periodBounds(prevP);
    const prevRows = filterRows(await loadRows(churchId, pb.from, pb.to), filters, defaultId);
    const t = sum(prevRows);
    previous = { label: pb.label, income: t.income, expenses: t.expenses, net: t.net };
  }

  const { kind: bucketKind, buckets } = buildBuckets(filtered, from, to);

  // Entries list: summarise giving by day (optional), sort, paginate.
  const entries = filters.group ? summariseGiving(filtered) : [...filtered];
  entries.sort((a, b) =>
    filters.sort === "oldest" ? a.date.localeCompare(b.date)
      : filters.sort === "largest" ? Math.abs(b.amount) - Math.abs(a.amount)
        : b.date.localeCompare(a.date));
  const pages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const page = Math.min(filters.page, pages);
  const pageRows = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const acct = new Map<string, { accountId: string | null; income: number; expenses: number; count: number }>();
  for (const r of filtered) {
    const eff = r.pending ? null : r.accountId ?? defaultId;
    const k = eff ?? "";
    const e = acct.get(k) ?? { accountId: eff, income: 0, expenses: 0, count: 0 };
    if (r.amount >= 0) e.income += r.amount; else e.expenses += -r.amount;
    e.count++;
    acct.set(k, e);
  }

  const activeFilters = [filters.type, filters.source, filters.account, filters.fund, filters.category, filters.q].filter(Boolean).length;
  return {
    period,
    label,
    fromYmd: from ? ymd(from) : null,
    toYmd: to ? ymd(to) : null,
    filters: { ...filters, page },
    activeFilters,
    totals,
    previous,
    rows: pageRows,
    pageInfo: { page, pages, total: entries.length, pageSize: PAGE_SIZE },
    bucketKind,
    buckets,
    byCategory: groupBy(filtered, (r) => r.category),
    byFund: groupBy(filtered, (r) => r.fund),
    byAccount: [...acct.values()],
    options: {
      categories: [...new Set(rows.map((r) => r.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
      funds: [...new Set(rows.map((r) => r.fund).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    },
  };
}

/** Every row matching the period and filters (no paging, no grouping) - for exports. Oldest first. */
export async function getLedgerRows(churchId: string, period: Period, filters: LedgerFilters): Promise<{ label: string; rows: LedgerRow[]; accounts: Map<string, string> }> {
  const { from, to, label } = periodBounds(period);
  const [rows, defaultId, accounts] = await Promise.all([
    loadRows(churchId, from, to),
    defaultAccountId(churchId),
    db.churchAccount.findMany({ where: { churchId }, select: { id: true, name: true } }),
  ]);
  const filtered = filterRows(rows, filters, defaultId).sort((a, b) => a.date.localeCompare(b.date));
  const names = new Map(accounts.map((a) => [a.id, a.name]));
  if (defaultId) for (const r of filtered) if (!r.accountId && !r.pending) r.accountId = defaultId;
  return { label, rows: filtered, accounts: names };
}
