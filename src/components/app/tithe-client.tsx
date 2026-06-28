"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Plus, Trash2, Send, ChevronDown, ChevronRight,
  Download, Calendar, Smartphone, CreditCard, Banknote,
  CheckCircle2, AlertCircle, Users, Receipt,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { StatCard } from "@/components/app/stat-card";
import { useFeedback } from "@/components/ui/feedback";
import { recordTitheBatch, recordGivingBatch, saveTitheTemplate, type TitheEntry } from "@/app/actions/giving";
import { Pencil, MessageSquare, X } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { formatCurrency } from "@/config/brand";
import { formatDate, cn } from "@/lib/utils";
import type { TitheMember, WeekGroup } from "@/lib/data/giving";

const methods = ["MTN MoMo", "Telecel Cash", "AirtelTigo", "Card", "Cash"] as const;
const methodIcon: Record<string, typeof Smartphone> = {
  "MTN MoMo": Smartphone, "Telecel Cash": Smartphone, AirtelTigo: Smartphone, Card: CreditCard, Cash: Banknote,
};

type LocalEntry = { personId: string; name: string; amount: string; method: string; phone: string | null };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const FUND_TYPES = [
  { key: "tithes", label: "Tithes" },
  { key: "offertory", label: "Offertory" },
  { key: "dayborn", label: "Day Born (Kofi ne Ama)" },
  { key: "custom", label: "Custom" },
] as const;

const DEFAULT_TITHE_TEMPLATE = "Dear {name}, your Tithe of GHS {amount} has been received by {church}. God Bless You for paying your Tithes to the Lord. Malachi 3:10 Shalom!";

export function TitheClient({
  members,
  weeks,
  monthTotal,
  monthLabel,
  year,
  month,
  canWrite,
  titheTemplate,
}: {
  members: TitheMember[];
  weeks: WeekGroup[];
  monthTotal: number;
  monthLabel: string;
  year: number;
  month: number;
  canWrite: boolean;
  titheTemplate?: string | null;
}) {
  const [tab, setTab] = useState<"record" | "records" | "report">("records");
  const [selectedYear, setSelectedYear] = useState(year);
  const [selectedMonth, setSelectedMonth] = useState(month);
  const [fundType, setFundType] = useState<string>("tithes");
  const [customFund, setCustomFund] = useState("");
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 3 }, (_, i) => currentYear - i);

  const router = useRouter();
  const [templateText, setTemplateText] = useState(titheTemplate || DEFAULT_TITHE_TEMPLATE);
  const [savingTemplate, startTemplateSave] = useTransition();
  const { toast } = useFeedback();

  const activeFundName = fundType === "tithes" ? "Tithes"
    : fundType === "offertory" ? "Offertory"
    : fundType === "dayborn" ? "Day Born"
    : customFund || "Custom";

  const navigatePeriod = (newYear: number, newMonth: number) => {
    setSelectedYear(newYear);
    setSelectedMonth(newMonth);
    if (newYear !== year || newMonth !== month) {
      router.push(`/app/giving?titheYear=${newYear}&titheMonth=${newMonth}`);
    }
  };

  const handleSaveTemplate = () => {
    const fd = new FormData();
    fd.set("template", templateText);
    startTemplateSave(async () => {
      const result = await saveTitheTemplate(fd);
      if (result?.ok) {
        toast("Tithe message template saved", "success");
        setShowTemplateEditor(false);
      } else {
        toast(result?.error ?? "Failed to save", "error");
      }
    });
  };

  return (
    <div className="space-y-5">
      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
          <Calendar className="size-4 text-ink-faint" />
          <select
            value={selectedMonth}
            onChange={(e) => navigatePeriod(selectedYear, Number(e.target.value))}
            className="bg-transparent text-sm font-medium outline-none"
          >
            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <select
            value={selectedYear}
            onChange={(e) => navigatePeriod(Number(e.target.value), selectedMonth)}
            className="bg-transparent text-sm font-medium outline-none"
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <span className="text-sm text-ink-muted">{monthLabel}</span>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Month total" value={monthTotal} prefix="₵" icon={Receipt} />
        <StatCard label="Tithe payers" value={weeks.reduce((s, w) => s + w.records.length, 0)} icon={Users} />
        <StatCard
          label="Weeks recorded"
          value={weeks.filter((w) => w.records.length > 0).length}
          suffix={` / ${weeks.length}`}
          icon={Calendar}
        />
        <StatCard
          label="Avg per payer"
          value={(() => { const count = weeks.reduce((s, w) => s + w.records.length, 0); return count ? Math.round(monthTotal / count) : 0; })()}
          prefix="₵"
          icon={Banknote}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
        {(canWrite ? [
          { id: "record" as const, label: "Record giving", icon: Plus },
          { id: "records" as const, label: "Weekly records", icon: Calendar },
          { id: "report" as const, label: "Monthly report", icon: Download },
        ] : [
          { id: "records" as const, label: "Weekly records", icon: Calendar },
          { id: "report" as const, label: "Monthly report", icon: Download },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
              tab === t.id ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink",
            )}
          >
            <t.icon className="size-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* Fund type selector (visible in record mode) */}
      {tab === "record" && canWrite && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {FUND_TYPES.map((f) => (
              <button
                key={f.key}
                onClick={() => setFundType(f.key)}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm font-medium transition-all",
                  fundType === f.key
                    ? "border-primary bg-primary/10 text-ink shadow-sm scale-[1.02]"
                    : "border-line text-ink-muted hover:bg-surface-2 hover:scale-[1.01]",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          {fundType === "custom" && (
            <div className="flex items-center gap-2">
              <Label htmlFor="customFund" className="text-sm whitespace-nowrap">Fund name:</Label>
              <Input
                id="customFund"
                value={customFund}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomFund(e.target.value)}
                placeholder="e.g. Building Fund, Missions…"
                className="max-w-xs"
              />
            </div>
          )}
        </div>
      )}

      {/* Tithe message template editor */}
      {tab === "record" && canWrite && fundType === "tithes" && (
        <div>
          <button
            onClick={() => setShowTemplateEditor(!showTemplateEditor)}
            className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
          >
            <MessageSquare className="size-4" />
            {showTemplateEditor ? "Hide" : "Edit"} tithe receipt message
          </button>
          {showTemplateEditor && (
            <Card className="mt-3 p-4 space-y-3">
              <div>
                <Label className="text-sm font-medium">SMS receipt template</Label>
                <p className="text-xs text-ink-faint mt-0.5">
                  Use {"{name}"}, {"{amount}"}, and {"{church}"} as placeholders.
                </p>
              </div>
              <textarea
                value={templateText}
                onChange={(e) => setTemplateText(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/25 resize-none"
              />
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleSaveTemplate} disabled={savingTemplate}>
                  {savingTemplate ? "Saving…" : "Save template"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setTemplateText(DEFAULT_TITHE_TEMPLATE); }}>
                  Reset to default
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}

      {tab === "record" && canWrite && <BatchRecorder members={members} fundType={fundType} activeFundName={activeFundName} />}
      {tab === "records" && <WeeklyRecords weeks={weeks} />}
      {tab === "report" && <MonthlyReport weeks={weeks} monthLabel={monthLabel} monthTotal={monthTotal} year={year} month={month} />}
    </div>
  );
}

/* ────── Batch Recorder ────── */

function BatchRecorder({ members, fundType, activeFundName }: { members: TitheMember[]; fundType: string; activeFundName: string }) {
  const router = useRouter();
  const [entries, setEntries] = useState<LocalEntry[]>([]);
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState<string>("Cash");
  const [showList, setShowList] = useState(false);
  const [pending, startTransition] = useTransition();
  const { toast, showBusy, hideBusy } = useFeedback();

  const filtered = useMemo(() => {
    if (!search.trim()) return members.slice(0, 20);
    const q = search.toLowerCase();
    return members.filter((m) =>
      `${m.firstName} ${m.lastName}`.toLowerCase().includes(q),
    ).slice(0, 20);
  }, [members, search]);

  const addEntry = (member: TitheMember) => {
    if (entries.some((e) => e.personId === member.id)) {
      toast("Already added", "error");
      return;
    }
    setEntries((prev) => [...prev, {
      personId: member.id,
      name: `${member.firstName} ${member.lastName}`,
      amount: "",
      method,
      phone: member.phone,
    }]);
    setSearch("");
    setShowList(false);
  };

  const updateAmount = (idx: number, val: string) => {
    setEntries((prev) => prev.map((e, i) => i === idx ? { ...e, amount: val } : e));
  };

  const updateMethod = (idx: number, val: string) => {
    setEntries((prev) => prev.map((e, i) => i === idx ? { ...e, method: val } : e));
  };

  const removeEntry = (idx: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== idx));
  };

  const totalAmount = entries.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const validEntries = entries.filter((e) => Number(e.amount) > 0);

  const handleSubmit = () => {
    if (!validEntries.length) { toast("Add at least one entry with an amount", "error"); return; }
    const isTithe = fundType === "tithes";
    showBusy(isTithe ? "Recording tithes & sending receipts…" : `Recording ${activeFundName}…`);
    startTransition(async () => {
      const batch: TitheEntry[] = validEntries.map((e) => ({
        personId: e.personId,
        amount: Number(e.amount),
        method: e.method,
      }));
      const result = isTithe
        ? await recordTitheBatch(batch)
        : await recordGivingBatch(activeFundName, batch);
      hideBusy();
      if (result.ok) {
        const msg = isTithe
          ? `${result.recorded} tithe(s) recorded, ${"smsSent" in result ? result.smsSent : 0} receipt(s) sent${"insufficientCredits" in result && result.insufficientCredits ? " (SMS credits ran out)" : ""}`
          : `${result.recorded} ${activeFundName} record(s) saved`;
        toast(msg, ("insufficientCredits" in result && result.insufficientCredits) ? "error" : "success");
        setEntries([]);
        router.refresh();
      } else {
        toast(result.error ?? "Failed to record", "error");
      }
    });
  };

  return (
    <Card className="p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="font-display text-lg font-semibold">Record {activeFundName}</h3>
          <p className="text-sm text-ink-muted">
            {fundType === "tithes"
              ? "Select members, enter amounts, then send receipts via SMS."
              : `Select members and record ${activeFundName} contributions.`}
          </p>
        </div>
        <Badge variant="outline">{entries.length} {entries.length === 1 ? "entry" : "entries"}</Badge>
      </div>

      {/* Default method */}
      <div className="mb-4">
        <label className="mb-1.5 block text-sm font-medium text-ink-muted">Default payment method</label>
        <div className="flex flex-wrap gap-2">
          {methods.map((m) => {
            const Icon = methodIcon[m];
            return (
              <button key={m} type="button" onClick={() => setMethod(m)}
                className={cn("flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                  method === m ? "border-primary/50 bg-primary/10 text-ink" : "border-line text-ink-muted hover:bg-surface-2")}>
                <Icon className="size-3.5" /> {m}
              </button>
            );
          })}
        </div>
      </div>

      {/* Member search */}
      <div className="relative mb-4">
        <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5">
          <Search className="size-4 text-ink-faint" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setShowList(true); }}
            onFocus={() => setShowList(true)}
            placeholder="Search member to add…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint"
          />
        </div>
        {showList && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowList(false)} />
            <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-xl border border-line bg-surface shadow-xl">
              {filtered.length === 0 ? (
                <div className="p-4 text-center text-sm text-ink-faint">No members found</div>
              ) : filtered.map((m) => (
                <button
                  key={m.id}
                  onClick={() => addEntry(m)}
                  disabled={entries.some((e) => e.personId === m.id)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-surface-2",
                    entries.some((e) => e.personId === m.id) && "opacity-40",
                  )}
                >
                  <Avatar name={`${m.firstName} ${m.lastName}`} src={m.photoUrl ?? undefined} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{m.firstName} {m.lastName}</div>
                    {m.phone && <div className="text-xs text-ink-faint">{m.phone}</div>}
                  </div>
                  {entries.some((e) => e.personId === m.id) ? (
                    <CheckCircle2 className="size-4 text-success" />
                  ) : (
                    <Plus className="size-4 text-ink-faint" />
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Entries list */}
      {entries.length > 0 && (
        <div className="mb-4 space-y-2">
          {entries.map((entry, idx) => {
            const Icon = methodIcon[entry.method] ?? Banknote;
            return (
              <div key={entry.personId} className="flex items-center gap-3 rounded-xl border border-line bg-surface-2/50 px-4 py-3">
                <Avatar name={entry.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{entry.name}</div>
                  {entry.phone && <div className="text-xs text-ink-faint">{entry.phone}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink-faint">₵</span>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      value={entry.amount}
                      onChange={(e) => updateAmount(idx, e.target.value)}
                      placeholder="0.00"
                      className="w-28 rounded-lg border border-line bg-surface py-2 pl-7 pr-3 text-right text-sm font-medium outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/25"
                    />
                  </div>
                  <select
                    value={entry.method}
                    onChange={(e) => updateMethod(idx, e.target.value)}
                    className="rounded-lg border border-line bg-surface px-2 py-2 text-xs outline-none"
                  >
                    {methods.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <button onClick={() => removeEntry(idx)} className="grid size-8 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Summary + submit */}
      {entries.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-5 py-4">
          <div>
            <div className="text-sm text-ink-muted">{validEntries.length} of {entries.length} valid</div>
            <div className="font-display text-2xl font-bold">{formatCurrency(totalAmount, { decimals: true })}</div>
          </div>
          <Button onClick={handleSubmit} disabled={pending || !validEntries.length} size="lg">
            {pending ? (
              <>
                <div className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Sending…
              </>
            ) : (
              <>
                <Send className="size-4" />
                {fundType === "tithes" ? "Record & send receipts" : `Record ${activeFundName}`}
              </>
            )}
          </Button>
        </div>
      )}

      {entries.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-line p-8 text-center">
          <Users className="mx-auto mb-3 size-10 text-ink-faint" />
          <p className="text-sm font-medium text-ink-muted">No entries yet</p>
          <p className="mt-1 text-xs text-ink-faint">Search and select members above to start recording tithes</p>
        </div>
      )}
    </Card>
  );
}

/* ────── Weekly Records ────── */

function WeeklyRecords({ weeks }: { weeks: WeekGroup[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(weeks.filter((w) => w.records.length > 0).map((w) => w.label)));

  const toggle = (label: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {weeks.map((week) => (
        <Card key={week.label} className="overflow-hidden">
          <button
            onClick={() => toggle(week.label)}
            className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-surface-2/50"
          >
            <div className="flex items-center gap-3">
              {expanded.has(week.label) ? <ChevronDown className="size-4 text-ink-faint" /> : <ChevronRight className="size-4 text-ink-faint" />}
              <div>
                <span className="font-display text-sm font-semibold">{week.label}</span>
                <span className="ml-2 text-xs text-ink-faint">
                  {formatDate(week.startDate)} — {formatDate(week.endDate)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline">{week.records.length} {week.records.length === 1 ? "payer" : "payers"}</Badge>
              <span className="font-display text-lg font-bold text-success">{formatCurrency(week.total)}</span>
            </div>
          </button>

          {expanded.has(week.label) && week.records.length > 0 && (
            <div className="border-t border-line divide-y divide-line-soft">
              {week.records.map((r) => {
                const Icon = methodIcon[r.method] ?? Banknote;
                return (
                  <div key={r.id} className="flex items-center gap-3 px-5 py-3">
                    <Avatar name={r.donorName} src={r.photoUrl ?? undefined} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{r.donorName}</div>
                      <div className="flex items-center gap-1.5 text-xs text-ink-faint">
                        <Icon className="size-3" /> {r.method} · {formatDate(r.date)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-success">{formatCurrency(r.amount)}</div>
                      {r.receiptSent && (
                        <div className="flex items-center gap-1 text-xs text-success">
                          <CheckCircle2 className="size-3" /> Sent
                        </div>
                      )}
                      {r.phone && !r.receiptSent && (
                        <div className="flex items-center gap-1 text-xs text-warning">
                          <AlertCircle className="size-3" /> No receipt
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {expanded.has(week.label) && week.records.length === 0 && (
            <div className="border-t border-line px-5 py-6 text-center text-sm text-ink-faint">
              No tithes recorded this week
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

/* ────── Monthly Report ────── */

function MonthlyReport({
  weeks,
  monthLabel,
  monthTotal,
  year,
  month,
}: {
  weeks: WeekGroup[];
  monthLabel: string;
  monthTotal: number;
  year: number;
  month: number;
}) {
  const allRecords = weeks.flatMap((w) => w.records);
  const uniquePayers = new Set(allRecords.map((r) => r.personId ?? r.donorName));
  const withReceipt = allRecords.filter((r) => r.receiptSent).length;

  const byPayer = new Map<string, { name: string; total: number; count: number }>();
  for (const r of allRecords) {
    const key = r.personId ?? r.donorName;
    const existing = byPayer.get(key);
    if (existing) {
      existing.total += r.amount;
      existing.count++;
    } else {
      byPayer.set(key, { name: r.donorName, total: r.amount, count: 1 });
    }
  }
  const payerList = [...byPayer.values()].sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-4">
      {/* Summary card */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg font-semibold">Tithe report — {monthLabel}</h3>
            <p className="text-sm text-ink-muted">{uniquePayers.size} unique payers · {allRecords.length} transactions · {withReceipt} receipts sent</p>
          </div>
          <a href={`/api/export/tithes?year=${year}&month=${month}`}>
            <Button variant="secondary" size="sm"><Download className="size-4" /> Export CSV</Button>
          </a>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-line bg-surface-2/50 p-4 text-center">
            <div className="text-sm text-ink-muted">Total collected</div>
            <div className="mt-1 font-display text-2xl font-bold text-success">{formatCurrency(monthTotal, { decimals: true })}</div>
          </div>
          <div className="rounded-xl border border-line bg-surface-2/50 p-4 text-center">
            <div className="text-sm text-ink-muted">Unique payers</div>
            <div className="mt-1 font-display text-2xl font-bold">{uniquePayers.size}</div>
          </div>
          <div className="rounded-xl border border-line bg-surface-2/50 p-4 text-center">
            <div className="text-sm text-ink-muted">Avg per payer</div>
            <div className="mt-1 font-display text-2xl font-bold">
              {formatCurrency(uniquePayers.size ? Math.round(monthTotal / uniquePayers.size) : 0)}
            </div>
          </div>
        </div>
      </Card>

      {/* Weekly breakdown */}
      <Card className="overflow-hidden">
        <div className="border-b border-line p-5">
          <h3 className="font-display text-lg font-semibold">Weekly breakdown</h3>
        </div>
        <div className="divide-y divide-line-soft">
          {weeks.map((w) => (
            <div key={w.label} className="flex items-center justify-between px-5 py-3">
              <div>
                <span className="text-sm font-medium">{w.label}</span>
                <span className="ml-2 text-xs text-ink-faint">{formatDate(w.startDate)} — {formatDate(w.endDate)}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs text-ink-faint">{w.records.length} payers</span>
                <span className="font-display font-semibold text-success">{formatCurrency(w.total)}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Top payers */}
      {payerList.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-line p-5">
            <h3 className="font-display text-lg font-semibold">Payer summary</h3>
            <p className="text-sm text-ink-muted">All tithe payers for {monthLabel}, ranked by total</p>
          </div>
          <div className="divide-y divide-line-soft">
            {payerList.map((p, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3">
                <span className="grid size-7 place-items-center rounded-full bg-surface-2 text-xs font-semibold text-ink-faint">{i + 1}</span>
                <Avatar name={p.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="text-xs text-ink-faint">{p.count} {p.count === 1 ? "payment" : "payments"}</div>
                </div>
                <div className="font-display font-semibold text-success">{formatCurrency(p.total, { decimals: true })}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
