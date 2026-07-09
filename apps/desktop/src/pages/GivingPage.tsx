import { useEffect, useState, useMemo } from "react";
import {
  Plus, Search, Loader2, Trash2, HandCoins, Wallet,
  Banknote, CreditCard, Smartphone, PiggyBank, Pencil, Send, Users,
  Calendar, Download, ChevronDown, ChevronRight, CheckCircle2, AlertCircle,
  Repeat, FileText, ArrowLeft, Printer, MessageSquare, X,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Avatar } from "../components/ui/Avatar";
import { Modal } from "../components/ui/Modal";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatCurrency, formatDate, cn, safeNum } from "../lib/utils";
import { v4 as uuid } from "uuid";

const METHODS = ["Cash", "MTN_MoMo", "Telecel_Cash", "AirtelTigo", "Card"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const methodIcons: Record<string, any> = {
  Cash: Banknote, MTN_MoMo: Smartphone, Telecel_Cash: Smartphone, AirtelTigo: Smartphone, Card: CreditCard,
};

const FUND_TYPES = [
  { key: "tithes", label: "Tithes" },
  { key: "offertory", label: "Offertory" },
  { key: "dayborn", label: "Day Born (Kofi ne Ama)" },
  { key: "custom", label: "Custom" },
] as const;

const DEFAULT_TITHE_TEMPLATE = "Dear {name}, your Tithe of GHS {amount} has been received by {church}. God Bless You for paying your Tithes to the Lord. Malachi 3:10 Shalom!";

const methodLabel = (m: string) => (m || "Cash").replace(/_/g, " ");

/** Get weeks in a month (Sun-Sat), mirroring web getWeeksInMonth. */
function getWeeksInMonth(year: number, month: number) {
  const weeks: { label: string; start: Date; end: Date }[] = [];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  let weekStart = new Date(firstDay);
  let weekNum = 1;
  while (weekStart <= lastDay) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + (6 - weekStart.getDay()));
    if (weekEnd > lastDay) weekEnd.setTime(lastDay.getTime());
    weekEnd.setHours(23, 59, 59, 999);
    weeks.push({ label: `Week ${weekNum}`, start: new Date(weekStart), end: new Date(weekEnd) });
    weekNum++;
    weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() + 1);
    weekStart.setHours(0, 0, 0, 0);
  }
  return weeks;
}

export function GivingPage() {
  const { session, showToast, syncVersion } = useAppStore();
  const [view, setView] = useState<"giving" | "tithe" | "statements">("giving");
  const [gifts, setGifts] = useState<any[]>([]);
  const [people, setPeople] = useState<any[]>([]);
  const [funds, setFunds] = useState<any[]>([]);
  const [church, setChurch] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [methodFilter, setMethodFilter] = useState("");

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  async function loadData() {
    setLoading(true);
    const cid = session!.churchId;
    const [g, p, f, ch] = await Promise.all([
      db.rawQuery(`SELECT g.*, p.first_name, p.last_name, p.photo_url, p.phone, fn.name AS fund_name FROM gift g LEFT JOIN person p ON g.person_id = p.id LEFT JOIN fund fn ON g.fund_id = fn.id WHERE g.church_id = ? ORDER BY g.date DESC LIMIT 1000`, [cid]),
      db.rawQuery("SELECT id, first_name, last_name, phone, photo_url FROM person WHERE church_id = ? AND status IN ('active','visitor') ORDER BY first_name", [cid]),
      db.rawQuery("SELECT * FROM fund WHERE church_id = ?", [cid]),
      db.getById("church", cid),
    ]);
    setGifts(g);
    setPeople(p);
    setFunds(f);
    setChurch(ch);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    let list = gifts;
    if (methodFilter) list = list.filter((g) => g.method === methodFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (g) => (g.first_name || "").toLowerCase().includes(q) || (g.last_name || "").toLowerCase().includes(q) || (g.donor_name || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [gifts, search, methodFilter]);

  const stats = useMemo(() => {
    const now = new Date();
    const monthGifts = gifts.filter((g) => { const d = new Date(g.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
    const monthTotal = monthGifts.reduce((s, g) => s + (safeNum(g.amount)), 0);
    const momoCount = monthGifts.filter((g) => ["MTN_MoMo", "Telecel_Cash", "AirtelTigo"].includes(g.method)).length;
    const recurringCount = gifts.filter((g) => g.recurring).length;
    return {
      total: gifts.reduce((s, g) => s + (safeNum(g.amount)), 0),
      monthTotal, count: gifts.length,
      avgGift: monthGifts.length ? Math.round(monthTotal / monthGifts.length) : 0,
      momoPct: monthGifts.length ? Math.round((momoCount / monthGifts.length) * 100) : 0,
      recurringCount,
    };
  }, [gifts]);

  const fundBreakdown = useMemo(() => {
    const now = new Date();
    const byFund = new Map<string, number>();
    for (const g of gifts) {
      const d = new Date(g.date);
      if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) continue;
      const name = g.fund_name || "General";
      byFund.set(name, (byFund.get(name) || 0) + (safeNum(g.amount)));
    }
    return [...byFund.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [gifts]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this gift record?")) return;
    setGifts((prev) => prev.filter((g) => g.id !== id));
    showToast("Gift deleted");
    await db.delete("gift", id);
  }

  const tabs = [
    { id: "giving" as const, label: "Giving & donations", icon: HandCoins },
    { id: "tithe" as const, label: "Tithe recording", icon: Calendar },
    { id: "statements" as const, label: "Statements", icon: FileText },
  ];

  return (
    <PageShell title="Giving">
      <PageHeader title="Giving" description="Track tithes, offerings, donations, and generate statements.">
        {view === "giving" && (
          <button onClick={() => setShowForm(true)} className="btn-primary btn-sm">
            <Plus className="size-3.5" /> Record Gift
          </button>
        )}
      </PageHeader>

      {/* View tabs */}
      <div className="mb-5 flex gap-1 rounded-xl bg-surface-2 p-1">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setView(t.id)}
            className={cn("flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
              view === t.id ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink")}>
            <t.icon className="size-4" /> {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>
      ) : view === "giving" ? (
        <>
          <div className="mb-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="This Month" value={formatCurrency(stats.monthTotal)} icon={HandCoins} color="text-gold" />
            <StatCard label="Recurring Givers" value={stats.recurringCount} icon={Repeat} color="text-primary-bright" />
            <StatCard label="Mobile Money %" value={`${stats.momoPct}%`} icon={Smartphone} color="text-info" />
            <StatCard label="Avg. Gift" value={formatCurrency(stats.avgGift)} icon={Banknote} color="text-success" />
          </div>

          {fundBreakdown.length > 0 && (
            <div className="card mb-4 p-4">
              <h3 className="mb-3 text-sm font-bold text-ink">Giving by fund · this month</h3>
              <div className="space-y-2">
                {fundBreakdown.map((f) => {
                  const pct = stats.monthTotal > 0 ? Math.round((f.value / stats.monthTotal) * 100) : 0;
                  return (
                    <div key={f.name}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium text-ink">{f.name}</span>
                        <span className="text-ink-muted">{formatCurrency(f.value)} · {pct}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                        <div className="h-full rounded-full bg-primary-bright" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Filters bar */}
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setMethodFilter("")}
                className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition-all", !methodFilter ? "bg-primary/10 text-primary-bright shadow-sm" : "text-ink-muted hover:bg-surface-2")}>All</button>
              {METHODS.map((m) => (
                <button key={m} onClick={() => setMethodFilter(m)}
                  className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition-all", methodFilter === m ? "bg-primary/10 text-primary-bright shadow-sm" : "text-ink-muted hover:bg-surface-2")}>{methodLabel(m)}</button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} className="input h-9 pl-9 w-56 text-sm" placeholder="Search gifts..." />
            </div>
          </div>

          {/* Gift list */}
          <div className="card p-0 overflow-hidden">
            {filtered.length === 0 ? (
              <div className="py-16 text-center">
                <HandCoins className="mx-auto size-10 text-ink-faint/30" />
                <p className="mt-3 text-sm font-medium text-ink">{search || methodFilter ? "No gifts match your filter" : "No gifts recorded yet"}</p>
                <p className="mt-1 text-xs text-ink-muted">Sync to pull data or record a gift manually.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface-2/50">
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Donor</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Amount</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Fund</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Method</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Date</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {filtered.map((g) => {
                    const name = g.first_name ? `${g.first_name} ${g.last_name}` : g.donor_name || "Anonymous";
                    const MethodIcon = methodIcons[g.method] || Banknote;
                    return (
                      <tr key={g.id} className="transition-colors hover:bg-surface-2/50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={name} src={g.photo_url} size="sm" />
                            <span className="font-medium text-ink flex items-center gap-1.5">{name}{g.recurring ? <Repeat className="size-3 text-ink-faint" /> : null}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-bold text-success">{formatCurrency(g.amount)}</td>
                        <td className="px-4 py-3 text-ink-muted">{g.fund_name || "General"}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 text-ink-muted"><MethodIcon className="size-3.5" />{methodLabel(g.method)}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-ink-faint">{formatDate(g.date)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => { setEditing(g); setShowForm(true); }} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-primary-soft hover:text-primary-bright" title="Edit"><Pencil className="size-3.5" /></button>
                            <button onClick={() => handleDelete(g.id)} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger"><Trash2 className="size-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : view === "tithe" ? (
        <TitheSection people={people} gifts={gifts} church={church} funds={funds} churchId={session!.churchId} onChanged={loadData} />
      ) : (
        <StatementsSection gifts={gifts} people={people} church={church} />
      )}

      <Modal open={showForm} onClose={() => { setShowForm(false); setEditing(null); }} title={editing ? "Edit Gift" : "Record Gift"}>
        <GiftForm churchId={session!.churchId} people={people} funds={funds} existing={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); loadData(); }} />
      </Modal>
    </PageShell>
  );
}

/* ─────────────── Single gift form ─────────────── */

function GiftForm({ churchId, people, funds, existing, onClose, onSaved }: {
  churchId: string; people: any[]; funds: any[]; existing?: any; onClose: () => void; onSaved: () => void;
}) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => existing ? {
    person_id: existing.person_id || "", donor_name: existing.donor_name || "",
    fund_id: existing.fund_id || "", amount: String(existing.amount || ""),
    method: existing.method || "Cash", recurring: !!existing.recurring,
    date: existing.date ? existing.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
  } : { person_id: "", donor_name: "", fund_id: "", amount: "", method: "Cash", recurring: false, date: new Date().toISOString().slice(0, 10) });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.amount || safeNum(form.amount) <= 0) return;
    setSaving(true);
    const data = {
      person_id: form.person_id || null, donor_name: form.donor_name || null,
      fund_id: form.fund_id || null, amount: safeNum(form.amount), method: form.method,
      recurring: form.recurring ? 1 : 0, currency: "GHS", date: form.date,
    };
    if (existing) { await db.update("gift", existing.id, data); showToast("Gift updated"); }
    else { await db.insert("gift", { id: uuid(), church_id: churchId, ...data }); showToast("Gift recorded"); }
    setSaving(false); onSaved();
  }

  const set = (key: string) => (e: any) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-ink-muted mb-1">Member</label>
        <select value={form.person_id} onChange={set("person_id")} className="input">
          <option value="">— Select member or enter name below —</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
        </select>
      </div>
      {!form.person_id && (
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Donor Name</label>
          <input value={form.donor_name} onChange={set("donor_name")} className="input" placeholder="Visitor / external donor" />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Amount (GHS) *</label><input type="number" step="0.01" value={form.amount} onChange={set("amount")} className="input" required /></div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Method</label>
          <select value={form.method} onChange={set("method")} className="input">{METHODS.map((m) => <option key={m} value={m}>{methodLabel(m)}</option>)}</select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Fund</label>
          <select value={form.fund_id} onChange={set("fund_id")} className="input"><option value="">General</option>{funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
        </div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Date</label><input type="date" value={form.date} onChange={set("date")} className="input" /></div>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink-muted">
        <input type="checkbox" checked={form.recurring} onChange={(e) => setForm((f) => ({ ...f, recurring: e.target.checked }))} /> Recurring giver
      </label>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving && <Loader2 className="size-4 whq-spin" />}{saving ? "Saving..." : (existing ? "Save Changes" : "Record Gift")}</button>
      </div>
    </form>
  );
}

/* ─────────────── Tithe / batch recording section ─────────────── */

function TitheSection({ people, gifts, church, funds, churchId, onChanged }: {
  people: any[]; gifts: any[]; church: any; funds: any[]; churchId: string; onChanged: () => void;
}) {
  const now = new Date();
  const [tab, setTab] = useState<"record" | "records" | "report">("records");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const years = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i);

  // resolve the fund id whose name === "Tithes" (case-insensitive) for the records/report view
  const titheFund = funds.find((f) => (f.name || "").toLowerCase() === "tithes");

  const titheGifts = useMemo(() => {
    if (!titheFund) return [];
    return gifts.filter((g) => g.fund_id === titheFund.id);
  }, [gifts, titheFund]);

  const weeks = useMemo(() => {
    const defs = getWeeksInMonth(year, month);
    return defs.map((w) => {
      const recs = titheGifts.filter((g) => { const d = new Date(g.date); return d >= w.start && d <= w.end; });
      return {
        label: w.label, start: w.start, end: w.end,
        records: recs.map((g) => ({
          id: g.id, donorName: g.first_name ? `${g.first_name} ${g.last_name}` : g.donor_name || "Anonymous",
          amount: safeNum(g.amount), method: methodLabel(g.method), date: g.date,
          receiptSent: !!g.receipt_sent, phone: g.phone, photoUrl: g.photo_url, personId: g.person_id,
        })),
        total: recs.reduce((s, g) => s + (safeNum(g.amount)), 0),
      };
    });
  }, [titheGifts, year, month]);

  const monthTotal = weeks.reduce((s, w) => s + w.total, 0);
  const payerCount = weeks.reduce((s, w) => s + w.records.length, 0);
  const monthLabel = `${MONTHS[month]} ${year}`;

  return (
    <div className="space-y-5">
      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
          <Calendar className="size-4 text-ink-faint" />
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="bg-transparent text-sm font-medium outline-none">
            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="bg-transparent text-sm font-medium outline-none">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <span className="text-sm text-ink-muted">{monthLabel}</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Month total" value={formatCurrency(monthTotal)} icon={HandCoins} color="text-gold" />
        <StatCard label="Tithe payers" value={payerCount} icon={Users} color="text-primary-bright" />
        <StatCard label="Weeks recorded" value={`${weeks.filter((w) => w.records.length > 0).length} / ${weeks.length}`} icon={Calendar} color="text-info" />
        <StatCard label="Avg per payer" value={formatCurrency(payerCount ? Math.round(monthTotal / payerCount) : 0)} icon={Banknote} color="text-success" />
      </div>

      <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
        {[
          { id: "record" as const, label: "Record giving", icon: Plus },
          { id: "records" as const, label: "Weekly records", icon: Calendar },
          { id: "report" as const, label: "Monthly report", icon: Download },
        ].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn("flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
              tab === t.id ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink")}>
            <t.icon className="size-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "record" && <BatchRecorder people={people} church={church} churchId={churchId} onChanged={onChanged} />}
      {tab === "records" && <WeeklyRecords weeks={weeks} />}
      {tab === "report" && <MonthlyReport weeks={weeks} monthLabel={monthLabel} monthTotal={monthTotal} />}
    </div>
  );
}

function BatchRecorder({ people, church, churchId, onChanged }: { people: any[]; church: any; churchId: string; onChanged: () => void }) {
  const { showToast } = useAppStore();
  const [fundType, setFundType] = useState<string>("tithes");
  const [customFund, setCustomFund] = useState("");
  const [entries, setEntries] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [showList, setShowList] = useState(false);
  const [method, setMethod] = useState("Cash");
  const [saving, setSaving] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [templateText, setTemplateText] = useState(church?.tithe_receipt_template || DEFAULT_TITHE_TEMPLATE);
  const [savingTpl, setSavingTpl] = useState(false);

  const activeFundName = fundType === "tithes" ? "Tithes" : fundType === "offertory" ? "Offertory" : fundType === "dayborn" ? "Day Born" : customFund || "Custom";

  const filtered = useMemo(() => {
    if (!search.trim()) return people.slice(0, 20);
    const q = search.toLowerCase();
    return people.filter((m) => `${m.first_name} ${m.last_name}`.toLowerCase().includes(q)).slice(0, 20);
  }, [people, search]);

  const addEntry = (m: any) => {
    if (entries.some((e) => e.personId === m.id)) { showToast("Already added"); return; }
    setEntries((prev) => [...prev, { personId: m.id, name: `${m.first_name} ${m.last_name}`, amount: "", method, phone: m.phone }]);
    setSearch(""); setShowList(false);
  };
  const updateAmount = (i: number, v: string) => setEntries((p) => p.map((e, idx) => idx === i ? { ...e, amount: v } : e));
  const updateMethod = (i: number, v: string) => setEntries((p) => p.map((e, idx) => idx === i ? { ...e, method: v } : e));
  const removeEntry = (i: number) => setEntries((p) => p.filter((_, idx) => idx !== i));

  const totalAmount = entries.reduce((s, e) => s + (safeNum(e.amount) || 0), 0);
  const validEntries = entries.filter((e) => safeNum(e.amount) > 0);

  /** Resolve (or create) the target fund by name for this church. */
  async function resolveFund(name: string): Promise<string> {
    const existing = await db.rawQuery("SELECT id FROM fund WHERE church_id = ? AND LOWER(name) = LOWER(?) LIMIT 1", [churchId, name]);
    if (existing.length) return existing[0].id;
    const id = uuid();
    await db.insert("fund", { id, church_id: churchId, name });
    return id;
  }

  async function handleSubmit() {
    if (!validEntries.length) { showToast("Add at least one entry with an amount"); return; }
    setSaving(true);
    const fundId = await resolveFund(activeFundName);
    for (const e of validEntries) {
      await db.insert("gift", {
        id: uuid(), church_id: churchId, person_id: e.personId, donor_name: e.name,
        fund_id: fundId, amount: safeNum(e.amount), method: e.method, currency: "GHS", receipt_sent: 0,
        date: new Date().toISOString().slice(0, 10),
      });
    }
    setSaving(false);
    showToast(`${validEntries.length} ${activeFundName} record(s) saved. SMS receipts require online — will sync.`);
    setEntries([]);
    onChanged();
  }

  async function saveTemplate() {
    setSavingTpl(true);
    await db.update("church", churchId, { tithe_receipt_template: templateText });
    setSavingTpl(false);
    showToast("Tithe message template saved");
    setShowTemplate(false);
  }

  return (
    <div className="space-y-4">
      {/* Fund type */}
      <div className="flex flex-wrap gap-2">
        {FUND_TYPES.map((f) => (
          <button key={f.key} onClick={() => setFundType(f.key)}
            className={cn("rounded-full border px-4 py-2 text-sm font-medium transition-all",
              fundType === f.key ? "border-primary bg-primary/10 text-ink shadow-sm" : "border-line text-ink-muted hover:bg-surface-2")}>
            {f.label}
          </button>
        ))}
      </div>
      {fundType === "custom" && (
        <div className="flex items-center gap-2">
          <label className="text-sm whitespace-nowrap text-ink-muted">Fund name:</label>
          <input value={customFund} onChange={(e) => setCustomFund(e.target.value)} placeholder="e.g. Building Fund, Missions…" className="input max-w-xs" />
        </div>
      )}

      {/* Template editor (tithes only) */}
      {fundType === "tithes" && (
        <div>
          <button onClick={() => setShowTemplate(!showTemplate)} className="flex items-center gap-2 text-sm font-medium text-primary-bright hover:underline">
            <MessageSquare className="size-4" /> {showTemplate ? "Hide" : "Edit"} tithe receipt message
          </button>
          {showTemplate && (
            <div className="card mt-3 p-4 space-y-3">
              <div>
                <label className="text-sm font-medium text-ink">SMS receipt template</label>
                <p className="text-xs text-ink-faint mt-0.5">Use {"{name}"}, {"{amount}"}, and {"{church}"} as placeholders. Sending requires online — will sync.</p>
              </div>
              <textarea value={templateText} onChange={(e) => setTemplateText(e.target.value)} rows={3} className="input resize-none" />
              <div className="flex items-center gap-2">
                <button onClick={saveTemplate} disabled={savingTpl} className="btn-primary btn-sm">{savingTpl && <Loader2 className="size-4 whq-spin" />}{savingTpl ? "Saving..." : "Save template"}</button>
                <button onClick={() => setTemplateText(DEFAULT_TITHE_TEMPLATE)} className="btn-ghost btn-sm">Reset to default</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-ink">Record {activeFundName}</h3>
            <p className="text-sm text-ink-muted">Select members, enter amounts, then save the batch.</p>
          </div>
          <span className="badge">{entries.length} {entries.length === 1 ? "entry" : "entries"}</span>
        </div>

        {/* Default method */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-ink-muted">Default payment method</label>
          <div className="flex flex-wrap gap-2">
            {METHODS.map((m) => {
              const Icon = methodIcons[m];
              return (
                <button key={m} type="button" onClick={() => setMethod(m)}
                  className={cn("flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                    method === m ? "border-primary/50 bg-primary/10 text-ink" : "border-line text-ink-muted hover:bg-surface-2")}>
                  <Icon className="size-3.5" /> {methodLabel(m)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Member search */}
        <div className="relative mb-4">
          <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5">
            <Search className="size-4 text-ink-faint" />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setShowList(true); }} onFocus={() => setShowList(true)}
              placeholder="Search member to add…" className="flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint" />
          </div>
          {showList && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowList(false)} />
              <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-xl border border-line bg-surface shadow-xl">
                {filtered.length === 0 ? (
                  <div className="p-4 text-center text-sm text-ink-faint">No members found</div>
                ) : filtered.map((m) => {
                  const added = entries.some((e) => e.personId === m.id);
                  return (
                    <button key={m.id} onClick={() => addEntry(m)} disabled={added}
                      className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-surface-2", added && "opacity-40")}>
                      <Avatar name={`${m.first_name} ${m.last_name}`} src={m.photo_url} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{m.first_name} {m.last_name}</div>
                        {m.phone && <div className="text-xs text-ink-faint">{m.phone}</div>}
                      </div>
                      {added ? <CheckCircle2 className="size-4 text-success" /> : <Plus className="size-4 text-ink-faint" />}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Entries */}
        {entries.length > 0 && (
          <div className="mb-4 space-y-2">
            {entries.map((entry, idx) => (
              <div key={entry.personId} className="flex items-center gap-3 rounded-xl border border-line bg-surface-2/50 px-4 py-3">
                <Avatar name={entry.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{entry.name}</div>
                  {entry.phone && <div className="text-xs text-ink-faint">{entry.phone}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink-faint">₵</span>
                    <input type="number" min="1" step="0.01" value={entry.amount} onChange={(e) => updateAmount(idx, e.target.value)} placeholder="0.00"
                      className="w-28 rounded-lg border border-line bg-surface py-2 pl-7 pr-3 text-right text-sm font-medium outline-none focus:border-primary/50" />
                  </div>
                  <select value={entry.method} onChange={(e) => updateMethod(idx, e.target.value)} className="rounded-lg border border-line bg-surface px-2 py-2 text-xs outline-none">
                    {METHODS.map((m) => <option key={m} value={m}>{methodLabel(m)}</option>)}
                  </select>
                  <button onClick={() => removeEntry(idx)} className="grid size-8 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger"><Trash2 className="size-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        {entries.length > 0 ? (
          <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-5 py-4">
            <div>
              <div className="text-sm text-ink-muted">{validEntries.length} of {entries.length} valid</div>
              <div className="text-2xl font-bold text-ink">{formatCurrency(totalAmount)}</div>
            </div>
            <button onClick={handleSubmit} disabled={saving || !validEntries.length} className="btn-primary">
              {saving ? <Loader2 className="size-4 whq-spin" /> : <Send className="size-4" />}{saving ? "Saving..." : `Record ${activeFundName}`}
            </button>
          </div>
        ) : (
          <div className="rounded-xl border-2 border-dashed border-line p-8 text-center">
            <Users className="mx-auto mb-3 size-10 text-ink-faint" />
            <p className="text-sm font-medium text-ink-muted">No entries yet</p>
            <p className="mt-1 text-xs text-ink-faint">Search and select members above to start recording</p>
          </div>
        )}
      </div>
    </div>
  );
}

function WeeklyRecords({ weeks }: { weeks: any[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(weeks.filter((w) => w.records.length > 0).map((w) => w.label)));
  const toggle = (l: string) => setExpanded((p) => { const n = new Set(p); n.has(l) ? n.delete(l) : n.add(l); return n; });

  return (
    <div className="space-y-3">
      {weeks.map((week) => (
        <div key={week.label} className="card overflow-hidden">
          <button onClick={() => toggle(week.label)} className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-surface-2/50">
            <div className="flex items-center gap-3">
              {expanded.has(week.label) ? <ChevronDown className="size-4 text-ink-faint" /> : <ChevronRight className="size-4 text-ink-faint" />}
              <div>
                <span className="text-sm font-bold text-ink">{week.label}</span>
                <span className="ml-2 text-xs text-ink-faint">{formatDate(week.start)} — {formatDate(week.end)}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="badge">{week.records.length} {week.records.length === 1 ? "payer" : "payers"}</span>
              <span className="text-lg font-bold text-success">{formatCurrency(week.total)}</span>
            </div>
          </button>
          {expanded.has(week.label) && (
            week.records.length > 0 ? (
              <div className="border-t border-line divide-y divide-line-soft">
                {week.records.map((r: any) => {
                  const Icon = methodIcons[r.method.replace(/ /g, "_")] ?? Banknote;
                  return (
                    <div key={r.id} className="flex items-center gap-3 px-5 py-3">
                      <Avatar name={r.donorName} src={r.photoUrl} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{r.donorName}</div>
                        <div className="flex items-center gap-1.5 text-xs text-ink-faint"><Icon className="size-3" /> {r.method} · {formatDate(r.date)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-success">{formatCurrency(r.amount)}</div>
                        {r.receiptSent ? (
                          <div className="flex items-center gap-1 text-xs text-success"><CheckCircle2 className="size-3" /> Sent</div>
                        ) : r.phone ? (
                          <div className="flex items-center gap-1 text-xs text-gold"><AlertCircle className="size-3" /> No receipt</div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="border-t border-line px-5 py-6 text-center text-sm text-ink-faint">No tithes recorded this week</div>
            )
          )}
        </div>
      ))}
    </div>
  );
}

function MonthlyReport({ weeks, monthLabel, monthTotal }: { weeks: any[]; monthLabel: string; monthTotal: number }) {
  const allRecords = weeks.flatMap((w) => w.records);
  const uniquePayers = new Set(allRecords.map((r: any) => r.personId ?? r.donorName));
  const withReceipt = allRecords.filter((r: any) => r.receiptSent).length;

  const byPayer = new Map<string, { name: string; total: number; count: number }>();
  for (const r of allRecords) {
    const key = r.personId ?? r.donorName;
    const ex = byPayer.get(key);
    if (ex) { ex.total += safeNum(r.amount); ex.count++; } else byPayer.set(key, { name: r.donorName, total: safeNum(r.amount), count: 1 });
  }
  const payerList = [...byPayer.values()].sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-4">
      <div className="card p-6">
        <h3 className="text-lg font-bold text-ink">Tithe report — {monthLabel}</h3>
        <p className="text-sm text-ink-muted">{uniquePayers.size} unique payers · {allRecords.length} transactions · {withReceipt} receipts sent</p>
        <div className="mt-5 grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-line bg-surface-2/50 p-4 text-center">
            <div className="text-sm text-ink-muted">Total collected</div>
            <div className="mt-1 text-2xl font-bold text-success">{formatCurrency(monthTotal)}</div>
          </div>
          <div className="rounded-xl border border-line bg-surface-2/50 p-4 text-center">
            <div className="text-sm text-ink-muted">Unique payers</div>
            <div className="mt-1 text-2xl font-bold text-ink">{uniquePayers.size}</div>
          </div>
          <div className="rounded-xl border border-line bg-surface-2/50 p-4 text-center">
            <div className="text-sm text-ink-muted">Avg per payer</div>
            <div className="mt-1 text-2xl font-bold text-ink">{formatCurrency(uniquePayers.size ? Math.round(monthTotal / uniquePayers.size) : 0)}</div>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-line p-5"><h3 className="text-lg font-bold text-ink">Weekly breakdown</h3></div>
        <div className="divide-y divide-line-soft">
          {weeks.map((w) => (
            <div key={w.label} className="flex items-center justify-between px-5 py-3">
              <div><span className="text-sm font-medium">{w.label}</span><span className="ml-2 text-xs text-ink-faint">{formatDate(w.start)} — {formatDate(w.end)}</span></div>
              <div className="flex items-center gap-4"><span className="text-xs text-ink-faint">{w.records.length} payers</span><span className="font-semibold text-success">{formatCurrency(w.total)}</span></div>
            </div>
          ))}
        </div>
      </div>

      {payerList.length > 0 && (
        <div className="card overflow-hidden">
          <div className="border-b border-line p-5"><h3 className="text-lg font-bold text-ink">Payer summary</h3><p className="text-sm text-ink-muted">All tithe payers for {monthLabel}, ranked by total</p></div>
          <div className="divide-y divide-line-soft">
            {payerList.map((p, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3">
                <span className="grid size-7 place-items-center rounded-full bg-surface-2 text-xs font-semibold text-ink-faint">{i + 1}</span>
                <Avatar name={p.name} size="sm" />
                <div className="min-w-0 flex-1"><div className="text-sm font-medium">{p.name}</div><div className="text-xs text-ink-faint">{p.count} {p.count === 1 ? "payment" : "payments"}</div></div>
                <div className="font-semibold text-success">{formatCurrency(p.total)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────── Statements section ─────────────── */

function StatementsSection({ gifts, people, church }: { gifts: any[]; people: any[]; church: any }) {
  const year = new Date().getFullYear();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any>(null);

  const donors = useMemo(() => {
    const byPerson = new Map<string, any>();
    for (const g of gifts) {
      const d = new Date(g.date);
      if (d.getFullYear() !== year) continue;
      const key = g.person_id || `name:${g.donor_name || "Anonymous"}`;
      if (!byPerson.has(key)) {
        const p = g.person_id ? people.find((x) => x.id === g.person_id) : null;
        byPerson.set(key, {
          id: key, name: g.first_name ? `${g.first_name} ${g.last_name}` : g.donor_name || "Anonymous",
          memberId: p?.member_id || null, phone: g.phone || p?.phone || null, email: p?.email || null,
          total: 0, gifts: [] as any[], byFund: new Map<string, number>(),
        });
      }
      const rec = byPerson.get(key);
      rec.total += safeNum(g.amount);
      const fundName = g.fund_name || "General";
      rec.byFund.set(fundName, (rec.byFund.get(fundName) || 0) + (safeNum(g.amount)));
      rec.gifts.push({ id: g.id, amount: safeNum(g.amount), date: g.date, method: methodLabel(g.method), fund: fundName });
    }
    return [...byPerson.values()].map((d) => ({
      ...d, giftCount: d.gifts.length,
      byFund: [...d.byFund.entries()].map(([fund, amount]) => ({ fund, amount })),
      gifts: d.gifts.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [gifts, people]);

  const filtered = donors.filter((d) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return d.name.toLowerCase().includes(q) || (d.memberId || "").toLowerCase().includes(q);
  });

  const churchName = church?.name ?? "";
  const churchAddress = [church?.address, church?.city, church?.country].filter(Boolean).join(", ");

  function handlePrint() {
    if (!selected) return;
    const fundRows = selected.byFund.map((f: any) => `<tr><td>${f.fund}</td><td style="text-align:right">${formatCurrency(f.amount)}</td></tr>`).join("");
    const txRows = selected.gifts.map((g: any) => `<tr><td>${formatDate(g.date)}</td><td>${g.fund}</td><td>${g.method}</td><td style="text-align:right">${formatCurrency(g.amount)}</td></tr>`).join("");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>Giving Statement - ${selected.name}</title>
      <style>body{font-family:system-ui,sans-serif;padding:40px;max-width:700px;margin:0 auto;color:#1c1a16}h1{font-size:20px;margin-bottom:4px}h2{font-size:16px;margin-top:24px}.meta{color:#6b6560;font-size:13px}table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #e5e0db}th{background:#faf8f4;font-weight:600}.total{font-weight:700;font-size:15px}.footer{margin-top:40px;font-size:11px;color:#a09890;border-top:1px solid #e5e0db;padding-top:16px}</style></head><body>
      <h1>${churchName}</h1><p class="meta">${churchAddress}</p>
      <h2>Giving Statement — ${year}</h2>
      <p class="meta">Prepared for: <strong>${selected.name}</strong>${selected.memberId ? ` (ID: ${selected.memberId})` : ""}</p>
      ${selected.email ? `<p class="meta">Email: ${selected.email}</p>` : ""}${selected.phone ? `<p class="meta">Phone: ${selected.phone}</p>` : ""}
      <h2>Summary by fund</h2><table><thead><tr><th>Fund</th><th style="text-align:right">Amount</th></tr></thead><tbody>${fundRows}<tr style="border-top:2px solid #1c1a16"><td class="total">Total</td><td class="total" style="text-align:right">${formatCurrency(selected.total)}</td></tr></tbody></table>
      <h2>Transaction details</h2><table><thead><tr><th>Date</th><th>Fund</th><th>Method</th><th style="text-align:right">Amount</th></tr></thead><tbody>${txRows}</tbody></table>
      <div class="footer"><p>This statement was generated by ${churchName} using WorshipHQ.</p><p>${selected.giftCount} transaction(s) totalling ${formatCurrency(selected.total)} for the period Jan 1 — Dec 31, ${year}.</p></div>
      </body></html>`);
    w.document.close();
    w.print();
  }

  if (selected) {
    return (
      <div>
        <button onClick={() => setSelected(null)} className="mb-4 flex items-center gap-1 text-sm text-ink-muted hover:text-ink"><ArrowLeft className="size-4" /> Back to all donors</button>
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-bold text-ink">{selected.name} — {year} Statement</h2>
          <button onClick={handlePrint} className="btn-secondary btn-sm"><Printer className="size-4" /> Print</button>
        </div>
        <div className="card p-6 space-y-5">
          <div>
            <h3 className="text-sm font-bold text-ink mb-2">Summary by fund</h3>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-line-soft">
                {selected.byFund.map((f: any) => (<tr key={f.fund}><td className="py-2">{f.fund}</td><td className="py-2 text-right">{formatCurrency(f.amount)}</td></tr>))}
                <tr className="border-t-2 border-ink font-bold"><td className="py-2">Total</td><td className="py-2 text-right">{formatCurrency(selected.total)}</td></tr>
              </tbody>
            </table>
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink mb-2">Transaction details</h3>
            <table className="w-full text-sm">
              <thead><tr className="text-[11px] uppercase text-ink-faint"><th className="py-1 text-left">Date</th><th className="py-1 text-left">Fund</th><th className="py-1 text-left">Method</th><th className="py-1 text-right">Amount</th></tr></thead>
              <tbody className="divide-y divide-line-soft">
                {selected.gifts.map((g: any) => (<tr key={g.id}><td className="py-2">{formatDate(g.date)}</td><td className="py-2">{g.fund}</td><td className="py-2">{g.method}</td><td className="py-2 text-right">{formatCurrency(g.amount)}</td></tr>))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">{year} giving summary for each member. Click a member to view their detailed statement.</p>
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} className="input h-9 pl-9 text-sm" placeholder="Search donors by name or ID..." />
      </div>
      {filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <FileText className="mx-auto size-10 text-ink-faint/30" />
          <p className="mt-3 text-sm text-ink-muted">{search ? "No donors match your search." : "No giving records for this year yet."}</p>
        </div>
      ) : (
        <div className="card p-2 space-y-1">
          {filtered.map((d) => (
            <button key={d.id} onClick={() => setSelected(d)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-surface-2">
              <div className="grid size-10 place-items-center rounded-xl bg-primary-soft"><HandCoins className="size-5 text-primary-bright" /></div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{d.name}</p>
                <div className="flex flex-wrap gap-x-3 text-xs text-ink-muted">
                  {d.memberId && <span>{d.memberId}</span>}
                  <span>{d.giftCount} gift{d.giftCount !== 1 ? "s" : ""}</span>
                  {d.byFund.length > 1 && <span>{d.byFund.length} funds</span>}
                </div>
              </div>
              <div className="text-right"><p className="text-sm font-bold text-primary-bright">{formatCurrency(d.total)}</p></div>
              <ChevronRight className="size-4 text-ink-faint" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
