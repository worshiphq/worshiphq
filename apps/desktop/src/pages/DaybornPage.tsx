import { useEffect, useState, useMemo } from "react";
import {
  Sun, Plus, Loader2, Trash2, CheckCircle2, Smartphone, Landmark, Calendar, AlertTriangle,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { cn, formatCurrency } from "../lib/utils";
import { v4 as uuid } from "uuid";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const DAY_LABELS: Record<string, string> = {
  monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday",
  thursday: "Thursday", friday: "Friday", saturday: "Saturday", sunday: "Sunday",
};
const DAY_AKAN: Record<string, string> = {
  monday: "Adwoa / Kojo", tuesday: "Abena / Kwabena", wednesday: "Akua / Kwaku",
  thursday: "Yaa / Yaw", friday: "Afia / Kofi", saturday: "Ama / Kwame", sunday: "Akosua / Kwesi",
};
const METHODS = [
  { value: "MTN_MoMo", label: "MTN MoMo", icon: Smartphone },
  { value: "Telecel_Cash", label: "Telecel Cash", icon: Smartphone },
  { value: "AirtelTigo", label: "AirtelTigo", icon: Smartphone },
  { value: "bank_transfer", label: "Bank Transfer", icon: Landmark },
];

function getSunday(d: Date): string {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? 0 : 7 - day));
  return date.toISOString().slice(0, 10);
}
function getMondayFromSunday(sundayIso: string): string {
  const d = new Date(sundayIso);
  d.setDate(d.getDate() - 6);
  return d.toISOString().slice(0, 10);
}
function isSunday(iso: string) { return new Date(iso).getDay() === 0; }
function isFuture(iso: string) { const t = new Date(); t.setHours(0, 0, 0, 0); return new Date(iso) > t; }
function isPast(iso: string) { const t = new Date(); t.setHours(0, 0, 0, 0); const s = new Date(iso); s.setHours(0, 0, 0, 0); return s < t; }
function formatSundayDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function formatWeekRange(sundayIso: string) {
  const sun = new Date(sundayIso);
  const mon = new Date(sun); mon.setDate(mon.getDate() - 6);
  const fmt = (dt: Date) => dt.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${fmt(mon)} – ${fmt(sun)}, ${sun.getFullYear()}`;
}

export function DaybornPage() {
  const { session, showToast, syncVersion } = useAppStore();
  const [weeks, setWeeks] = useState<any[]>([]);
  const [entriesByWeek, setEntriesByWeek] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"record" | "history">("record");
  const [selectedSunday, setSelectedSunday] = useState(() => getSunday(new Date()));
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [showMomo, setShowMomo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [postingId, setPostingId] = useState<string | null>(null);

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  async function loadData() {
    setLoading(true);
    const cid = session!.churchId;
    const wk = await db.rawQuery("SELECT * FROM day_born_week WHERE church_id = ? ORDER BY week_of DESC LIMIT 500", [cid]);
    setWeeks(wk);
    const map: Record<string, any[]> = {};
    if (wk.length) {
      const placeholders = wk.map(() => "?").join(",");
      const ent = await db.rawQuery(`SELECT * FROM day_born_entry WHERE week_id IN (${placeholders}) ORDER BY created_at ASC`, wk.map((w: any) => w.id));
      for (const e of ent) { (map[e.week_id] ||= []).push(e); }
    }
    setEntriesByWeek(map);
    setLoading(false);
  }

  const selectedMonday = getMondayFromSunday(selectedSunday);
  const currentWeek = useMemo(
    () => weeks.find((w) => String(w.week_of).slice(0, 10) === selectedMonday),
    [weeks, selectedMonday]
  );
  const currentEntries = currentWeek ? (entriesByWeek[currentWeek.id] || []) : [];

  const liveCashTotal = useMemo(() => DAYS.reduce((sum, day) => {
    const local = amounts[day];
    const val = local !== undefined ? parseFloat(local) || 0 : Number(currentWeek?.[day] ?? 0);
    return sum + val;
  }, 0), [amounts, currentWeek]);
  const momoTotal = currentEntries.reduce((s, e) => s + Number(e.amount), 0);
  const liveGrandTotal = liveCashTotal + momoTotal;

  const stats = useMemo(() => {
    const cashOf = (w: any) => DAYS.reduce((s, d) => s + Number(w[d] || 0), 0);
    const momoOf = (w: any) => (entriesByWeek[w.id] || []).reduce((s, e) => s + Number(e.amount), 0);
    const totalCash = weeks.reduce((s, w) => s + cashOf(w), 0);
    const totalMomo = weeks.reduce((s, w) => s + momoOf(w), 0);
    const posted = weeks.filter((w) => w.posted).length;
    return { totalAll: totalCash + totalMomo, totalCash, totalMomo, posted, count: weeks.length };
  }, [weeks, entriesByWeek]);

  function handleDateChange(dateStr: string) {
    const d = new Date(dateStr);
    if (d.getDay() !== 0) {
      const nearest = getSunday(d);
      if (isFuture(nearest)) { showToast("Future dates are not allowed", "error"); return; }
      if (!confirm(`${d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} is not a Sunday.\n\nDay Born is collected on Sundays. Use the Sunday of that week instead?`)) return;
      setSelectedSunday(nearest);
    } else {
      if (isFuture(dateStr)) { showToast("Future dates are not allowed", "error"); return; }
      if (isPast(dateStr) && !confirm(`This is a past date.\n\nAre you recording a backdated Day Born collection?`)) return;
      setSelectedSunday(dateStr);
    }
    setAmounts({});
  }

  async function saveAmounts() {
    if (liveCashTotal === 0) { showToast("Enter at least one amount", "error"); return; }
    setSaving(true);
    const dayData: Record<string, number> = {};
    for (const day of DAYS) {
      const local = amounts[day];
      dayData[day] = local !== undefined ? Math.max(0, parseFloat(local) || 0) : Number(currentWeek?.[day] ?? 0);
    }
    if (currentWeek) {
      await db.update("day_born_week", currentWeek.id, dayData);
    } else {
      await db.insert("day_born_week", {
        id: uuid(), church_id: session!.churchId, branch_id: null,
        week_of: selectedMonday, ...dayData, posted: 0,
      });
    }
    showToast("Day Born amounts saved");
    setAmounts({});
    setSaving(false);
    loadData();
  }

  async function deleteEntry(entry: any) {
    setEntriesByWeek((prev) => ({ ...prev, [entry.week_id]: (prev[entry.week_id] || []).filter((e) => e.id !== entry.id) }));
    showToast("Entry removed");
    await db.delete("day_born_entry", entry.id);
  }

  async function deleteWeek(week: any) {
    if (!confirm(`Delete Day Born record for this week?\n\nThis cannot be undone.`)) return;
    setWeeks((prev) => prev.filter((w) => w.id !== week.id));
    showToast("Record deleted");
    await db.delete("day_born_week", week.id);
  }

  async function postToAccounting(week: any) {
    const cash = DAYS.reduce((s, d) => s + Number(week[d] || 0), 0);
    const momo = (entriesByWeek[week.id] || []).reduce((s, e) => s + Number(e.amount), 0);
    const grand = cash + momo;
    if (grand <= 0 || week.posted) return;
    setPostingId(week.id);
    const weekDate = new Date(week.week_of).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    await db.insert("transaction", {
      id: uuid(), church_id: session!.churchId,
      description: `Day Born — week of ${weekDate}`, category: "Income",
      fund: "Day Born", amount: grand, date: new Date().toISOString(),
    });
    await db.update("day_born_week", week.id, { posted: 1, posted_at: new Date().toISOString() });
    showToast("Posted to Accounting as Day Born income");
    setPostingId(null);
    loadData();
  }

  return (
    <PageShell title="Day Born">
      <PageHeader title="Day Born" description="Sunday day-born collections by day of the week." />

      <div className="mb-5 grid grid-cols-4 gap-3">
        <StatCard label="Total Collected" value={formatCurrency(stats.totalAll)} icon={Sun} color="bg-primary-soft text-primary-bright" />
        <StatCard label="Cash Collections" value={formatCurrency(stats.totalCash)} icon={Sun} color="bg-success/10 text-success" />
        <StatCard label="MoMo / Bank" value={formatCurrency(stats.totalMomo)} icon={Smartphone} color="bg-info/10 text-info" />
        <StatCard label="Posted to Accounts" value={`${stats.posted} / ${stats.count}`} icon={CheckCircle2} color="bg-gold/10 text-gold" />
      </div>

      <div className="mb-4 flex gap-2 border-b border-line">
        {(["record", "history"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === t ? "border-primary-bright text-primary-bright" : "border-transparent text-ink-muted hover:text-ink"
            )}>{t === "record" ? "Record Collection" : "History"}</button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>
      ) : tab === "record" ? (
        <div className="space-y-4">
          <div className="card p-4">
            <div className="flex flex-wrap items-center gap-3">
              <Calendar className="size-5 text-ink-faint" />
              <label className="text-sm font-medium text-ink">Collection Sunday:</label>
              <input type="date" value={selectedSunday} max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => handleDateChange(e.target.value)} className="input h-9 w-auto" />
              <span className="text-sm text-ink-muted">{formatSundayDate(selectedSunday)}</span>
            </div>
            {isPast(selectedSunday) && isSunday(selectedSunday) && (
              <div className="mt-2 flex items-center gap-2 text-xs text-gold">
                <AlertTriangle className="size-3.5" /> Backdated record — this is a previous Sunday
              </div>
            )}
          </div>

          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold text-ink">Cash Collections by Day</h3>
              <div className="text-right">
                <p className="text-xs text-ink-faint">Live Cash Total</p>
                <p className="text-lg font-bold text-primary-bright">{formatCurrency(liveCashTotal)}</p>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {DAYS.map((day) => (
                <div key={day} className="space-y-1">
                  <label className="block text-xs font-medium text-ink-muted">{DAY_LABELS[day]} <span className="text-ink-faint">({DAY_AKAN[day]})</span></label>
                  <input type="number" min="0" step="0.01" placeholder="0.00" className="input h-9"
                    value={amounts[day] !== undefined ? amounts[day] : (currentWeek?.[day] || "")}
                    onChange={(e) => setAmounts((p) => ({ ...p, [day]: e.target.value }))} />
                </div>
              ))}
            </div>
            <div className="mt-4">
              <button onClick={saveAmounts} disabled={saving || liveCashTotal === 0} className="btn-primary">
                {saving && <Loader2 className="size-4 whq-spin" />}{saving ? "Saving..." : "Save Amounts"}
              </button>
              {liveCashTotal === 0 && <span className="ml-3 text-xs text-ink-faint">Enter at least one amount</span>}
            </div>
          </div>

          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold text-ink">Mobile Money & Bank Transfers</h3>
              <button onClick={() => setShowMomo(!showMomo)} className="btn-secondary btn-sm"><Plus className="size-3.5" /> Add Entry</button>
            </div>
            {showMomo && (
              <MomoForm churchId={session!.churchId} weekOf={selectedMonday}
                currentWeek={currentWeek} onDone={() => { setShowMomo(false); loadData(); }} />
            )}
            {currentEntries.length > 0 ? (
              <div className="divide-y divide-line-soft">
                {currentEntries.map((entry) => {
                  const method = METHODS.find((m) => m.value === entry.method);
                  const Icon = method?.icon ?? Smartphone;
                  return (
                    <div key={entry.id} className="flex items-center gap-3 py-2">
                      <div className="grid size-8 place-items-center rounded-full bg-primary-soft"><Icon className="size-4 text-primary-bright" /></div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{entry.person_name || DAY_LABELS[entry.day]} <span className="font-normal text-ink-faint">({DAY_AKAN[entry.day] ?? entry.day})</span></p>
                        <p className="text-xs text-ink-faint">{method?.label ?? entry.method}{entry.reference && ` · ${entry.reference}`}</p>
                      </div>
                      <span className="text-sm font-semibold text-ink">{formatCurrency(Number(entry.amount))}</span>
                      <button onClick={() => deleteEntry(entry)} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger"><Trash2 className="size-3.5" /></button>
                    </div>
                  );
                })}
                <div className="pt-3 text-sm font-medium text-ink">MoMo/Bank total: <span className="text-primary-bright">{formatCurrency(momoTotal)}</span></div>
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-ink-muted">No mobile money or bank entries for this week</p>
            )}
          </div>

          <div className="card p-4">
            <h3 className="mb-2 font-bold text-ink">Week Summary</h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div><p className="text-xs text-ink-faint">Cash</p><p className="text-lg font-bold text-ink">{formatCurrency(liveCashTotal)}</p></div>
              <div><p className="text-xs text-ink-faint">MoMo / Bank</p><p className="text-lg font-bold text-ink">{formatCurrency(momoTotal)}</p></div>
              <div><p className="text-xs text-ink-faint">Grand Total</p><p className="text-lg font-bold text-primary-bright">{formatCurrency(liveGrandTotal)}</p></div>
            </div>
            {currentWeek && !currentWeek.posted && liveGrandTotal > 0 && (
              <div className="mt-4 flex justify-center">
                <button onClick={() => postToAccounting(currentWeek)} disabled={postingId === currentWeek.id} className="btn-primary">
                  {postingId === currentWeek.id ? <Loader2 className="size-4 whq-spin" /> : <CheckCircle2 className="size-4" />}
                  {postingId === currentWeek.id ? "Posting..." : "Post to Accounting"}
                </button>
              </div>
            )}
            {currentWeek?.posted ? (
              <div className="mt-4 text-center">
                <span className="inline-flex items-center gap-1 rounded-full border border-success/40 px-3 py-1 text-xs font-bold text-success">
                  <CheckCircle2 className="size-3" /> Posted to Accounting
                  {currentWeek.posted_at && <span className="ml-1 font-normal text-ink-faint">{new Date(currentWeek.posted_at).toLocaleDateString("en-GB")}</span>}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <HistoryTab weeks={weeks} entriesByWeek={entriesByWeek} postingId={postingId} onPost={postToAccounting} onDelete={deleteWeek} />
      )}
    </PageShell>
  );
}

function MomoForm({ churchId, weekOf, currentWeek, onDone }: {
  churchId: string; weekOf: string; currentWeek: any; onDone: () => void;
}) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ day: "sunday", method: "MTN_MoMo", amount: "", personName: "", reference: "" });
  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amt = Math.max(0, parseFloat(form.amount) || 0);
    if (!amt) { showToast("Enter an amount", "error"); return; }
    setSaving(true);
    // Upsert the week so the entry has a parent.
    let weekId = currentWeek?.id;
    if (!weekId) {
      weekId = uuid();
      await db.insert("day_born_week", { id: weekId, church_id: churchId, branch_id: null, week_of: weekOf, posted: 0 });
    }
    await db.insert("day_born_entry", {
      id: uuid(), week_id: weekId, day: form.day, method: form.method, amount: amt,
      person_name: form.personName.trim() || null, reference: form.reference.trim() || null,
    });
    showToast("Entry added");
    setSaving(false);
    onDone();
  }

  return (
    <form onSubmit={submit} className="mb-4 space-y-3 rounded-lg border border-line bg-surface-2/40 p-4">
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Day of the Week</label>
          <select value={form.day} onChange={set("day")} className="input" required>
            {DAYS.map((d) => <option key={d} value={d}>{DAY_LABELS[d]} — {DAY_AKAN[d]}</option>)}
          </select>
        </div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Payment Method</label>
          <select value={form.method} onChange={set("method")} className="input" required>
            {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Amount</label>
          <input type="number" min="0.01" step="0.01" value={form.amount} onChange={set("amount")} className="input" placeholder="0.00" required />
          {parseFloat(form.amount) > 0 && <p className="mt-1 text-xs font-medium text-primary-bright">{formatCurrency(parseFloat(form.amount))}</p>}
        </div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Person Name (optional)</label>
          <input value={form.personName} onChange={set("personName")} className="input" placeholder="e.g. Kwame Mensah" />
        </div>
        <div className="col-span-2"><label className="block text-xs font-medium text-ink-muted mb-1">Reference (optional)</label>
          <input value={form.reference} onChange={set("reference")} className="input" placeholder="Transaction ID" />
        </div>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn-primary btn-sm">{saving && <Loader2 className="size-4 whq-spin" />}{saving ? "Saving..." : "Add Entry"}</button>
        <button type="button" onClick={onDone} className="btn-ghost btn-sm">Cancel</button>
      </div>
    </form>
  );
}

function HistoryTab({ weeks, entriesByWeek, postingId, onPost, onDelete }: {
  weeks: any[]; entriesByWeek: Record<string, any[]>; postingId: string | null;
  onPost: (w: any) => void; onDelete: (w: any) => void;
}) {
  if (weeks.length === 0) {
    return (
      <div className="card p-8 text-center">
        <Sun className="mx-auto size-10 text-ink-faint/30" />
        <p className="mt-3 text-sm font-medium text-ink">No Day Born records yet</p>
        <p className="mt-1 text-xs text-ink-faint">Switch to the Record tab to start entering collections</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {weeks.map((week) => {
        const sundayIso = new Date(new Date(week.week_of).getTime() + 6 * 86400000).toISOString().slice(0, 10);
        const entries = entriesByWeek[week.id] || [];
        const cash = DAYS.reduce((s, d) => s + Number(week[d] || 0), 0);
        const momo = entries.reduce((s, e) => s + Number(e.amount), 0);
        const grand = cash + momo;
        return (
          <div key={week.id} className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-ink">{formatWeekRange(sundayIso)}</h4>
                <div className="mt-1">
                  {week.posted ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-success/40 px-2 py-0.5 text-[10px] font-bold text-success"><CheckCircle2 className="size-3" /> Posted</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-gold/40 px-2 py-0.5 text-[10px] font-bold text-gold">Pending</span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-primary-bright">{formatCurrency(grand)}</p>
                <p className="text-xs text-ink-faint">Cash: {formatCurrency(cash)} · MoMo: {formatCurrency(momo)}</p>
              </div>
            </div>
            <div className="mb-2 grid grid-cols-7 gap-1">
              {DAYS.map((day) => (
                <div key={day} className="text-center">
                  <p className="text-[10px] text-ink-faint">{DAY_LABELS[day].slice(0, 3)}</p>
                  <p className={cn("text-xs font-medium", Number(week[day]) > 0 ? "text-ink" : "text-ink-faint/40")}>{Number(week[day]) > 0 ? formatCurrency(Number(week[day])) : "—"}</p>
                </div>
              ))}
            </div>
            {entries.length > 0 && <p className="text-xs text-ink-faint">+ {entries.length} MoMo/bank entr{entries.length === 1 ? "y" : "ies"} ({formatCurrency(momo)})</p>}
            <div className="mt-3 flex gap-2">
              {!week.posted && grand > 0 && (
                <button onClick={() => onPost(week)} disabled={postingId === week.id} className="btn-secondary btn-sm">
                  {postingId === week.id && <Loader2 className="size-3.5 whq-spin" />}Post to Accounting
                </button>
              )}
              <button onClick={() => onDelete(week)} className="btn-ghost btn-sm text-danger"><Trash2 className="size-3.5" /> Delete</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
