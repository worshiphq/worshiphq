"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Heart, Trash2, Calendar, User, HandCoins, UtensilsCrossed, Stethoscope,
  Home, GraduationCap, HelpCircle, ArrowUpRight, ArrowDownRight, Scale, Plus, Loader2,
  Send, Wallet, AlertTriangle, CheckCircle2, X, Settings2, Bell, MessageSquare, Pencil, Check,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { AccountSelect, type AccountOption } from "@/components/app/account-select";
import {
  deleteWelfareRecord, recordWelfareDues, setWelfareRate,
  previewOwingReminders, sendOwingReminders,
  memberDuesDetail, editWelfareDue, deleteWelfareDue, setMemberWelfareStart, saveWelfareTemplates,
  setChurchWelfareStart,
} from "@/app/actions/welfare";
import type { WelfareData } from "@/lib/data/welfare";
import { wideYears } from "@/lib/years";
import { cn } from "@/lib/utils";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const TYPE_META: Record<string, { icon: typeof Heart; label: string }> = {
  financial: { icon: HandCoins, label: "Financial" }, food: { icon: UtensilsCrossed, label: "Food" },
  medical: { icon: Stethoscope, label: "Medical" }, housing: { icon: Home, label: "Housing" },
  education: { icon: GraduationCap, label: "Education" }, other: { icon: HelpCircle, label: "Other" },
};

function ghs(n: number) { return new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 0 }).format(n); }

type Member = { id: string; name: string; hasPhone: boolean };

type Templates = { receipt: string | null; reminder: string | null };

export function WelfareClient({
  data, members, accounts, smsBalance, templates, canWrite,
}: {
  data: WelfareData; members: Member[]; accounts: AccountOption[]; smsBalance: number; templates: Templates; canWrite: boolean;
}) {
  const [tab, setTab] = useState<"dues" | "aid">("dues");
  const balance = data.collected - data.disbursed;

  return (
    <div className="mt-5 space-y-4">
      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat icon={ArrowUpRight} tone="success" value={ghs(data.collected)} label="Dues collected" />
        <Stat icon={Bell} tone="danger" value={ghs(data.totalOwed)} label="Outstanding (owed)" />
        <Stat icon={ArrowDownRight} tone="danger" value={ghs(data.disbursed)} label="Aid disbursed" />
        <Stat icon={Scale} tone={balance >= 0 ? "primary" : "danger"} value={ghs(balance)} label="Welfare balance" />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 rounded-xl border border-line bg-surface-2 p-1 w-fit">
        {(["dues", "aid"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
              tab === t ? "bg-primary text-white shadow-sm" : "text-ink-muted hover:text-ink")}>
            {t === "dues" ? "Dues" : "Aid out"}
          </button>
        ))}
      </div>

      {tab === "dues" ? (
        <DuesTab data={data} members={members} accounts={accounts} smsBalance={smsBalance} templates={templates} canWrite={canWrite} />
      ) : (
        <AidTab data={data} canWrite={canWrite} />
      )}
    </div>
  );
}

function Stat({ icon: Icon, tone, value, label }: { icon: typeof Heart; tone: "success" | "danger" | "primary"; value: string; label: string }) {
  const bg = tone === "success" ? "bg-success/10" : tone === "danger" ? "bg-danger/10" : "bg-primary/10";
  const fg = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-primary";
  return (
    <Card className="flex items-center gap-3 p-4">
      <div className={cn("flex size-10 items-center justify-center rounded-xl", bg)}><Icon className={cn("size-5", fg)} /></div>
      <div><p className="text-xl font-bold">{value}</p><p className="text-xs text-ink-muted">{label}</p></div>
    </Card>
  );
}

/* ─────────────────── Dues tab ─────────────────── */

function DuesTab({ data, members, accounts, smsBalance, templates, canWrite }: {
  data: WelfareData; members: Member[]; accounts: AccountOption[]; smsBalance: number; templates: Templates; canWrite: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [remindAll, setRemindAll] = useState(false);
  const [remindOne, setRemindOne] = useState<Member | null>(null);
  const [detailFor, setDetailFor] = useState<{ id: string; name: string } | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  const filtered = data.members.filter((m) => !search || m.name.toLowerCase().includes(search.toLowerCase()));
  const owingCount = data.members.filter((m) => m.owed > 0).length;
  const isCurrentYear = data.selectedYear === data.currentYear;

  // Range mode — driven by the ?from/?to URL params resolved server-side.
  const rangeMode = !!data.range;
  const rangeBlocked = rangeMode && data.rangeMissingYears.length > 0;
  const [pickMode, setPickMode] = useState<"year" | "range">(rangeMode ? "range" : "year");
  const [rFromY, setRFromY] = useState(data.range?.fromY ?? data.currentYear);
  const [rFromM, setRFromM] = useState(data.range?.fromM ?? 1);
  const [rToY, setRToY] = useState(data.range?.toY ?? data.currentYear);
  const [rToM, setRToM] = useState(data.range?.toM ?? data.currentMonth);
  const years = wideYears();
  const applyRange = () =>
    router.push(`/app/welfare?from=${rFromY}-${String(rFromM).padStart(2, "0")}&to=${rToY}-${String(rToM).padStart(2, "0")}`);

  return (
    <div className="space-y-4">
      {canWrite && <RatesPanel rates={data.rates} currentYear={data.currentYear} />}
      {canWrite && <ChurchStartCard churchStart={data.churchStart} />}
      {canWrite && <RecordDuesForm members={members} accounts={accounts} rates={data.rates} currentYear={data.currentYear} />}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="font-display text-lg font-semibold">Member dues</h3>
            {/* Year ↔ Range switch */}
            <div className="flex items-center gap-1 rounded-lg border border-line bg-surface-2 p-0.5 text-sm">
              <button
                onClick={() => { setPickMode("year"); if (rangeMode) router.push(`/app/welfare?year=${data.currentYear}`); }}
                className={cn("rounded-md px-2.5 py-1 font-medium", pickMode === "year" ? "bg-primary text-white" : "text-ink-muted")}
              >Year</button>
              <button
                onClick={() => setPickMode("range")}
                className={cn("rounded-md px-2.5 py-1 font-medium", pickMode === "range" ? "bg-primary text-white" : "text-ink-muted")}
              >Range</button>
            </div>

            {pickMode === "year" ? (
              <select
                value={data.selectedYear}
                onChange={(e) => router.push(`/app/welfare?year=${e.target.value}`)}
                className="h-9 rounded-lg border border-line bg-surface px-2.5 text-sm font-medium"
              >
                {data.years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5 text-sm">
                <select value={rFromM} onChange={(e) => setRFromM(Number(e.target.value))} className="h-9 rounded-lg border border-line bg-surface px-2 font-medium">
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <select value={rFromY} onChange={(e) => setRFromY(Number(e.target.value))} className="h-9 rounded-lg border border-line bg-surface px-2 font-medium">
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                <span className="text-ink-faint">→</span>
                <select value={rToM} onChange={(e) => setRToM(Number(e.target.value))} className="h-9 rounded-lg border border-line bg-surface px-2 font-medium">
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <select value={rToY} onChange={(e) => setRToY(Number(e.target.value))} className="h-9 rounded-lg border border-line bg-surface px-2 font-medium">
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                <Button size="sm" onClick={applyRange}>Apply</Button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canWrite && (
              <Button variant="secondary" size="sm" onClick={() => setShowTemplates(true)}><MessageSquare className="size-4" /> Messages</Button>
            )}
            {canWrite && owingCount > 0 && (
              <Button size="sm" onClick={() => setRemindAll(true)}><Bell className="size-4" /> Remind all owing</Button>
            )}
          </div>
        </div>
        <div className="p-4">
          {rangeMode ? (
            <p className="mb-3 text-xs text-ink-muted">
              Showing <b>{data.range!.label}</b>. Paid = dues collected in this span; Owes = expected minus paid, from each member’s start up to now. Click a member for their full record.
            </p>
          ) : (
            <p className="mb-3 text-xs text-ink-muted">{owingCount} member{owingCount === 1 ? "" : "s"} owing overall (as of {MONTHS_FULL[data.currentMonth - 1]} {data.currentYear}). Green = paid in {data.selectedYear}. Click a member to see their full record.</p>
          )}

          {/* Range summary / blocked notice */}
          {rangeMode && rangeBlocked && (
            <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                A range needs a monthly rate for <b>every</b> year it covers. Missing:{" "}
                <b>{data.rangeMissingYears.join(", ")}</b>. Set {data.rangeMissingYears.length === 1 ? "it" : "them"} in “Monthly dues rate by year” above, then apply the range again.
              </span>
            </div>
          )}
          {rangeMode && !rangeBlocked && (
            <div className="mb-3 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-line bg-base p-3">
                <div className="text-xs text-ink-faint">Collected in range</div>
                <div className="text-lg font-bold text-success">{ghs(data.rangeCollected)}</div>
              </div>
              <div className="rounded-xl border border-line bg-base p-3">
                <div className="text-xs text-ink-faint">Owed in range</div>
                <div className={cn("text-lg font-bold", data.rangeOwed > 0 ? "text-danger" : "text-ink-faint")}>{data.rangeOwed > 0 ? ghs(data.rangeOwed) : "—"}</div>
              </div>
            </div>
          )}

          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
            <Input placeholder="Search members…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
          {!rangeMode && data.rates.length === 0 && (
            <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Set a monthly rate above (per year) so “owed” can be calculated.
            </div>
          )}

          {rangeMode && rangeBlocked ? null : (
          <div className="space-y-2">
            {filtered.map((m) => (
              <button key={m.id} onClick={() => setDetailFor({ id: m.id, name: m.name })}
                className="flex w-full flex-wrap items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left hover:border-primary/40 hover:bg-surface-2/40">
                <div className="min-w-40 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {m.name}
                    {!m.hasExplicitStart && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700" title="Using join date — set an explicit start inside">start: {m.startLabel}</span>}
                  </div>
                  {rangeMode ? (
                    <div className="mt-1 text-[11px] text-ink-faint">{m.rangeMonthsPaid}/{m.rangeMonthsTotal} month{m.rangeMonthsTotal === 1 ? "" : "s"} paid in range</div>
                  ) : (
                    <div className="mt-1 flex gap-0.5">
                      {MONTHS.map((mo, i) => {
                        const paid = m.monthsPaidInYear.includes(i + 1);
                        const past = data.selectedYear < data.currentYear || (isCurrentYear && i + 1 <= data.currentMonth);
                        return (
                          <span key={mo} title={`${MONTHS_FULL[i]} ${paid ? "— paid" : past ? "— unpaid" : ""}`}
                            className={cn("grid size-4 place-items-center rounded-[3px] text-[7px] font-bold",
                              paid ? "bg-success text-white" : past ? "bg-danger/15 text-danger" : "bg-surface-2 text-ink-faint")}>
                            {mo[0]}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-xs text-ink-faint">{rangeMode ? "Paid (range)" : "Paid (total)"}</div>
                  <div className="text-sm font-semibold text-success">{ghs(rangeMode ? m.rangePaid : m.paidTotal)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-ink-faint">Owes</div>
                  <div className={cn("text-sm font-semibold", (rangeMode ? m.rangeOwed : m.owed) > 0 ? "text-danger" : "text-ink-faint")}>{(rangeMode ? m.rangeOwed : m.owed) > 0 ? ghs(rangeMode ? m.rangeOwed : m.owed) : "—"}</div>
                </div>
                {canWrite && (rangeMode ? m.rangeOwed : m.owed) > 0 && m.hasPhone && (
                  <span onClick={(e) => { e.stopPropagation(); setRemindOne({ id: m.id, name: m.name, hasPhone: m.hasPhone }); }}
                    title="Send reminder"
                    className="grid size-8 place-items-center rounded-lg text-ink-faint hover:bg-primary/10 hover:text-primary">
                    <Bell className="size-4" />
                  </span>
                )}
              </button>
            ))}
            {filtered.length === 0 && <p className="py-6 text-center text-sm text-ink-faint">No members found.</p>}
          </div>
          )}
        </div>
      </Card>

      {remindAll && <RemindDialog title="Remind everyone who owes" smsBalance={smsBalance} onClose={() => setRemindAll(false)} />}
      {remindOne && <RemindDialog title={`Remind ${remindOne.name}`} personId={remindOne.id} smsBalance={smsBalance} onClose={() => setRemindOne(null)} />}
      {detailFor && <MemberDetailDialog member={detailFor} rates={data.rates} canWrite={canWrite} onClose={() => setDetailFor(null)} />}
      {showTemplates && <TemplatesDialog templates={templates} onClose={() => setShowTemplates(false)} />}
    </div>
  );
}

function ChurchStartCard({ churchStart }: { churchStart: string | null }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [date, setDate] = useState(churchStart ?? "");

  const save = (clear = false) => {
    const fd = new FormData();
    fd.set("welfareStart", clear ? "" : date);
    start(async () => {
      const r = await setChurchWelfareStart(fd);
      if (r?.ok) { toast(clear ? "Cleared" : "Church dues start saved", "success"); if (clear) setDate(""); router.refresh(); }
      else toast(r?.error ?? "Failed", "error");
    });
  };

  return (
    <Card className="p-4">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold"><Calendar className="size-4 text-primary" /> Dues start (church-wide)</div>
      <p className="mb-2 text-xs text-ink-muted">
        Optional. Owed is only counted from here for members who don’t have their own start date.
        Leave empty and nobody accrues “owed” until each member gets a start — set on their record, or captured automatically the first time you record their dues.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 rounded-lg border border-line bg-surface px-2.5 text-sm" />
        <Button size="sm" onClick={() => save(false)} disabled={pending || !date}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Save
        </Button>
        {churchStart && <Button size="sm" variant="ghost" onClick={() => save(true)} disabled={pending}>Clear</Button>}
      </div>
    </Card>
  );
}

function RatesPanel({ rates, currentYear }: { rates: { year: number; amount: number }[]; currentYear: number }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(String(currentYear));
  const [amount, setAmount] = useState("");
  const [pending, start] = useTransition();

  const save = () => {
    const fd = new FormData(); fd.set("year", year); fd.set("amount", amount);
    start(async () => {
      const res = await setWelfareRate(fd);
      if (res?.ok) { toast("Rate saved", "success"); setAmount(""); router.refresh(); }
      else toast(res?.error ?? "Failed", "error");
    });
  };

  return (
    <Card className="p-4">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold"><Settings2 className="size-4 text-primary" /> Monthly dues rate by year</div>
        <span className="text-xs text-ink-muted">{rates.length ? rates.map((r) => `${r.year}: ${ghs(r.amount)}`).join(" · ") : "Not set"}</span>
      </button>
      {open && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="mb-2 text-xs text-ink-muted">The dues amount per month changes year to year. Set each year’s rate — “owed” is calculated from these.</p>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-xs text-ink-faint">Year</label>
              <input type="number" value={year} onChange={(e) => setYear(e.target.value)} className="h-9 w-24 rounded-lg border border-line bg-surface px-2.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-ink-faint">Amount / month (GHS)</label>
              <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 20" className="h-9 w-40 rounded-lg border border-line bg-surface px-2.5 text-sm" />
            </div>
            <Button size="sm" onClick={save} disabled={pending || !amount}>{pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Save rate</Button>
          </div>
          {rates.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {rates.map((r) => (
                <span key={r.year} className="rounded-lg border border-line px-2.5 py-1 text-xs">
                  <b>{r.year}</b> · {ghs(r.amount)}/mo
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function RecordDuesForm({ members, accounts, rates, currentYear }: {
  members: Member[]; accounts: AccountOption[]; rates: { year: number; amount: number }[]; currentYear: number;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [personId, setPersonId] = useState("");
  const [year, setYear] = useState(currentYear);
  const [fromMonth, setFromMonth] = useState(1);
  const [toMonth, setToMonth] = useState(currentYear === new Date().getFullYear() ? new Date().getMonth() + 1 : 12);
  const rateForYear = rates.find((r) => r.year === year)?.amount;
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState(accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? "");
  const [notify, setNotify] = useState(true);

  const effAmount = Number(amount) || rateForYear || 0;
  const monthCount = Math.max(0, toMonth - fromMonth + 1);
  const total = effAmount * monthCount;

  const years = wideYears();
  const inputCls = "h-9 rounded-lg border border-line bg-surface px-2.5 text-sm outline-none focus:border-primary/50";

  const submit = () => {
    if (!personId) return toast("Choose a member", "error");
    if (!effAmount) return toast("Enter the amount per month (or set the year rate)", "error");
    const fd = new FormData();
    fd.set("personId", personId); fd.set("year", String(year));
    fd.set("fromMonth", String(fromMonth)); fd.set("toMonth", String(toMonth));
    fd.set("amountPerMonth", String(effAmount));
    if (accountId) fd.set("accountId", accountId);
    if (notify) fd.set("notify", "on");
    start(async () => {
      const res = await recordWelfareDues(fd);
      if (res?.ok) {
        toast(`Recorded ${res.months} month(s) — ${ghs(res.total)}${res.texted ? " · member texted" : ""}`, "success");
        setPersonId(""); setAmount("");
        router.refresh();
      } else toast(res?.error ?? "Failed", "error");
    });
  };

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><HandCoins className="size-4 text-success" /> Record dues (across months)</div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <select value={personId} onChange={(e) => setPersonId(e.target.value)} className={inputCls}>
          <option value="">— Member —</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}{m.hasPhone ? "" : " (no phone)"}</option>)}
        </select>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={inputCls}>
          {years.map((y) => <option key={y} value={y}>{y}{rates.find((r) => r.year === y) ? ` · ${ghs(rates.find((r) => r.year === y)!.amount)}/mo` : ""}</option>)}
        </select>
        <div className="flex items-center gap-1">
          <select value={fromMonth} onChange={(e) => setFromMonth(Number(e.target.value))} className={cn(inputCls, "flex-1")}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <span className="text-xs text-ink-faint">to</span>
          <select value={toMonth} onChange={(e) => setToMonth(Number(e.target.value))} className={cn(inputCls, "flex-1")}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
          placeholder={rateForYear ? `${rateForYear} (year rate)` : "Amount / month"} className={inputCls} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {accounts.length > 1 && (
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputCls}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.isDefault ? " (default)" : ""}</option>)}
          </select>
        )}
        <label className="flex items-center gap-2 text-xs text-ink-muted">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="size-3.5 accent-primary" />
          Text the member a receipt
        </label>
        <div className="flex-1" />
        {monthCount > 0 && effAmount > 0 && (
          <span className="text-sm text-ink-muted">{monthCount} month{monthCount === 1 ? "" : "s"} × {ghs(effAmount)} = <b className="text-ink">{ghs(total)}</b></span>
        )}
        <Button size="sm" onClick={submit} disabled={pending || monthCount <= 0}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Record dues
        </Button>
      </div>
    </Card>
  );
}

function RemindDialog({ title, personId, smsBalance, onClose }: { title: string; personId?: string; smsBalance: number; onClose: () => void }) {
  const router = useRouter();
  const [preview, setPreview] = useState<{ recipients: number; cost: number; balance: number; remaining: number; enough: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useMemo(() => {
    previewOwingReminders(personId).then((r) => { if (r.ok) setPreview(r); setLoading(false); });
  }, [personId]);

  const send = async () => {
    setSending(true);
    const res = await sendOwingReminders(personId);
    setSending(false);
    if (res.ok) { setResult({ ok: true, message: `Sent ${res.sent} reminder${res.sent === 1 ? "" : "s"}.` }); router.refresh(); }
    else setResult({ ok: false, message: res.error });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={sending ? undefined : onClose}>
      <Card className="w-full max-w-md p-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-line p-5">
          <div><h3 className="font-display text-lg font-semibold">{title}</h3><p className="text-sm text-ink-muted">A friendly SMS with their balance.</p></div>
          <button onClick={onClose} disabled={sending} className="rounded-lg p-1 text-ink-faint hover:bg-surface-2 disabled:opacity-40"><X className="size-4" /></button>
        </div>
        <div className="p-5">
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-ink-muted"><Loader2 className="size-4 animate-spin" /> Working out the cost…</div>
          ) : result ? (
            <div className={cn("flex items-start gap-2 rounded-xl border p-4 text-sm", result.ok ? "border-success/30 bg-success/10 text-success" : "border-danger/30 bg-danger/10 text-danger")}>
              {result.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}<span>{result.message}</span>
            </div>
          ) : preview && preview.recipients > 0 ? (
            <div className="space-y-2.5 text-sm">
              <Row label="Members to remind" value={`${preview.recipients}`} />
              <Row label="Current balance" value={`${preview.balance.toLocaleString()} credits`} icon={<Wallet className="size-3.5" />} />
              <Row label="This costs" value={`− ${preview.cost.toLocaleString()} credits`} strong />
              <div className="border-t border-line-soft" />
              <Row label="Balance after" value={`${preview.remaining.toLocaleString()} credits`} strong tone={preview.enough ? "ok" : "bad"} />
              {!preview.enough && <div className="mt-2 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 p-3 text-danger"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> Not enough credits.</div>}
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> Nobody to remind (no one owes, or no phone numbers).</div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line p-4">
          {result?.ok ? <Button variant="secondary" size="sm" onClick={onClose}>Done</Button> : (
            <>
              <Button variant="ghost" size="sm" onClick={onClose} disabled={sending}>Cancel</Button>
              <Button size="sm" onClick={send} disabled={sending || loading || !preview || !preview.enough || preview.recipients === 0}>
                {sending ? <><Loader2 className="size-4 animate-spin" /> Sending…</> : <><Send className="size-4" /> Send now</>}
              </Button>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value, strong, tone, icon }: { label: string; value: string; strong?: boolean; tone?: "ok" | "bad"; icon?: React.ReactNode }) {
  const color = tone === "ok" ? "text-success" : tone === "bad" ? "text-danger" : "text-ink";
  return <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-1.5 text-ink-muted">{icon}{label}</span><span className={cn(strong && "font-semibold", color)}>{value}</span></div>;
}

/* ─────────────────── Member detail (drill-down) ─────────────────── */

type DuesDetail = {
  name: string; welfareStart: string | null; churchStart: string | null; joinedAt: string | null; started: boolean;
  owed: number; paidTotal: number; dues: { id: string; year: number; month: number; amount: number }[];
};

function MemberDetailDialog({ member, rates, canWrite, onClose }: {
  member: { id: string; name: string }; rates: { year: number; amount: number }[]; canWrite: boolean; onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [detail, setDetail] = useState<DuesDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [start, setStart] = useState("");
  const [pending, startTx] = useTransition();
  const [editId, setEditId] = useState<string | null>(null);
  const [editAmt, setEditAmt] = useState("");

  const load = () => {
    setLoading(true);
    memberDuesDetail(member.id).then((d) => { setDetail(d); setStart(d.welfareStart ?? ""); setLoading(false); });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [member.id]);

  const saveStart = () => {
    const fd = new FormData(); fd.set("personId", member.id); fd.set("welfareStart", start);
    startTx(async () => { const r = await setMemberWelfareStart(fd); if (r?.ok) { toast("Start date saved", "success"); load(); router.refresh(); } else toast(r?.error ?? "Failed", "error"); });
  };
  const saveEdit = (id: string) => {
    const fd = new FormData(); fd.set("id", id); fd.set("amount", editAmt);
    startTx(async () => { const r = await editWelfareDue(fd); if (r?.ok) { toast("Updated", "success"); setEditId(null); load(); router.refresh(); } else toast(r?.error ?? "Failed", "error"); });
  };
  const del = (id: string) => {
    if (!confirm("Delete this month's dues record?")) return;
    const fd = new FormData(); fd.set("id", id);
    startTx(async () => { await deleteWelfareDue(fd); toast("Deleted", "success"); load(); router.refresh(); });
  };

  // Group dues by year desc.
  const byYear = new Map<number, { id: string; month: number; amount: number }[]>();
  for (const d of detail?.dues ?? []) {
    if (!byYear.has(d.year)) byYear.set(d.year, []);
    byYear.get(d.year)!.push({ id: d.id, month: d.month, amount: d.amount });
  }
  const years = [...byYear.keys()].sort((a, b) => b - a);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <Card className="max-h-[85vh] w-full max-w-lg overflow-y-auto p-0" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-line bg-surface p-5">
          <div>
            <h3 className="font-display text-lg font-semibold">{member.name}</h3>
            {detail && <p className="text-sm text-ink-muted">Paid {ghs(detail.paidTotal)} · Owes <span className={detail.owed > 0 ? "font-semibold text-danger" : ""}>{detail.owed > 0 ? ghs(detail.owed) : "nothing"}</span></p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-faint hover:bg-surface-2"><X className="size-4" /></button>
        </div>

        {loading || !detail ? (
          <div className="flex items-center gap-2 p-6 text-sm text-ink-muted"><Loader2 className="size-4 animate-spin" /> Loading…</div>
        ) : (
          <div className="space-y-4 p-5">
            {/* Start date */}
            <div className="rounded-xl border border-line p-3">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">Dues start from</div>
              <p className="mb-2 text-xs text-ink-muted">
                Owed is counted from this date. {detail.welfareStart ? "" : detail.churchStart ? `Currently using the church-wide start (${detail.churchStart}).` : "No start set — this member won’t accrue “owed” until you set one here or record their first dues."}
              </p>
              <div className="flex items-center gap-2">
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} disabled={!canWrite}
                  className="h-9 rounded-lg border border-line bg-surface px-2.5 text-sm" />
                {canWrite && <Button size="sm" onClick={saveStart} disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Save</Button>}
                {canWrite && start && <Button size="sm" variant="ghost" onClick={() => { setStart(""); }}>Clear</Button>}
              </div>
            </div>

            {/* Paid months by year */}
            {years.length === 0 ? (
              <p className="text-sm text-ink-faint">No dues recorded yet.</p>
            ) : years.map((y) => {
              const rate = rates.find((r) => r.year === y)?.amount;
              const rows = byYear.get(y)!.sort((a, b) => a.month - b.month);
              return (
                <div key={y}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-sm font-semibold">{y}</span>
                    {rate != null && <span className="text-xs text-ink-faint">rate {ghs(rate)}/mo</span>}
                  </div>
                  <div className="space-y-1">
                    {rows.map((r) => (
                      <div key={r.id} className="flex items-center gap-2 rounded-lg border border-line-soft px-3 py-1.5 text-sm">
                        <span className="w-24 text-ink-muted">{MONTHS_FULL[r.month - 1]}</span>
                        {editId === r.id ? (
                          <>
                            <input type="number" min="0" step="0.01" value={editAmt} onChange={(e) => setEditAmt(e.target.value)}
                              className="h-8 w-24 rounded-lg border border-line bg-surface px-2 text-sm" autoFocus />
                            <button onClick={() => saveEdit(r.id)} className="grid size-7 place-items-center rounded-lg text-success hover:bg-success/10"><Check className="size-4" /></button>
                            <button onClick={() => setEditId(null)} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-surface-2"><X className="size-4" /></button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 font-medium">{ghs(r.amount)}</span>
                            {canWrite && (
                              <>
                                <button onClick={() => { setEditId(r.id); setEditAmt(String(r.amount)); }} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-primary/10 hover:text-primary"><Pencil className="size-3.5" /></button>
                                <button onClick={() => del(r.id)} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger"><Trash2 className="size-3.5" /></button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ─────────────────── Message templates ─────────────────── */

const DEFAULT_RECEIPT = "Dear {title} {name}, your welfare dues of GHS {amount} for {months} have been received by {church}. {balance} God bless.";
const DEFAULT_REMINDER = "Dear {title} {name}, a friendly reminder from {church}: your welfare dues balance is GHS {owed}. Kindly settle when you can. God bless you.";

function TemplatesDialog({ templates, onClose }: { templates: Templates; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [receipt, setReceipt] = useState(templates.receipt ?? DEFAULT_RECEIPT);
  const [reminder, setReminder] = useState(templates.reminder ?? DEFAULT_REMINDER);
  const [pending, start] = useTransition();

  const save = () => {
    const fd = new FormData(); fd.set("receipt", receipt); fd.set("reminder", reminder);
    start(async () => { const r = await saveWelfareTemplates(fd); if (r?.ok) { toast("Messages saved", "success"); router.refresh(); onClose(); } else toast(r?.error ?? "Failed", "error"); });
  };

  const seg = (t: string) => Math.max(1, Math.ceil(t.length / 160));

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <Card className="max-h-[85vh] w-full max-w-lg overflow-y-auto p-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line p-5">
          <h3 className="font-display text-lg font-semibold">Welfare SMS messages</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-faint hover:bg-surface-2"><X className="size-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          <p className="text-xs text-ink-muted">Shorten these to save SMS credits. Placeholders: <code className="rounded bg-surface-2 px-1">{"{title}"}</code> <code className="rounded bg-surface-2 px-1">{"{name}"}</code> <code className="rounded bg-surface-2 px-1">{"{church}"}</code> <code className="rounded bg-surface-2 px-1">{"{amount}"}</code> <code className="rounded bg-surface-2 px-1">{"{months}"}</code> <code className="rounded bg-surface-2 px-1">{"{owed}"}</code> <code className="rounded bg-surface-2 px-1">{"{balance}"}</code>. Tip: <code className="rounded bg-surface-2 px-1">Hi {"{title}"} {"{name}"}</code> → “Hi Mr. Mensah”. Empty titles collapse cleanly.</p>
          <div>
            <div className="mb-1 flex items-center justify-between text-sm font-medium"><span>Payment receipt</span><span className="text-xs text-ink-faint">{receipt.length} chars · {seg(receipt)} SMS</span></div>
            <textarea value={receipt} onChange={(e) => setReceipt(e.target.value)} rows={3} className="w-full rounded-lg border border-line bg-surface p-2.5 text-sm outline-none focus:border-primary/50" />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between text-sm font-medium"><span>Owing reminder</span><span className="text-xs text-ink-faint">{reminder.length} chars · {seg(reminder)} SMS</span></div>
            <textarea value={reminder} onChange={(e) => setReminder(e.target.value)} rows={3} className="w-full rounded-lg border border-line bg-surface p-2.5 text-sm outline-none focus:border-primary/50" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line p-4">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Save messages</Button>
        </div>
      </Card>
    </div>
  );
}

/* ─────────────────── Aid tab ─────────────────── */

function AidTab({ data, canWrite }: { data: WelfareData; canWrite: boolean }) {
  const { toast } = useFeedback();
  const [search, setSearch] = useState("");
  const [pending, start] = useTransition();

  const filtered = data.aid.filter((r) => !search || r.recipientName.toLowerCase().includes(search.toLowerCase()) || r.description?.toLowerCase().includes(search.toLowerCase()));

  const del = (id: string) => {
    if (!confirm("Delete this aid record? This cannot be undone.")) return;
    const fd = new FormData(); fd.set("id", id);
    start(() => deleteWelfareRecord(fd).then(() => toast("Deleted", "success")));
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <Input placeholder="Search aid records…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>
      {filtered.length === 0 ? (
        <Card className="p-12 text-center"><Heart className="mx-auto size-10 text-ink-faint" /><p className="mt-3 text-sm text-ink-muted">No aid records yet. Use “Record aid” above.</p></Card>
      ) : (
        <div className={cn("space-y-2", pending && "opacity-60")}>
          {filtered.map((r) => {
            const meta = TYPE_META[r.type] ?? TYPE_META.other; const Icon = meta.icon;
            return (
              <Card key={r.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-danger/10"><Icon className="size-4 text-danger" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{r.recipientName}</span>
                      <Badge variant="default" className="text-[10px]">{meta.label}</Badge>
                      {r.amount && r.amount > 0 && <span className="text-sm font-bold text-danger">−{ghs(r.amount)}</span>}
                    </div>
                    {r.description && <p className="mt-1 text-xs text-ink-muted">{r.description}</p>}
                    <div className="mt-1.5 flex flex-wrap gap-x-4 text-xs text-ink-faint">
                      <span className="flex items-center gap-1"><Calendar className="size-3" />{new Date(r.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                      {r.personName && <span className="flex items-center gap-1"><User className="size-3" /> {r.personName}</span>}
                    </div>
                  </div>
                  {canWrite && <button onClick={() => del(r.id)} className="shrink-0 rounded-lg p-1.5 text-ink-faint hover:bg-danger/10 hover:text-danger" title="Delete"><Trash2 className="size-4" /></button>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
