"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Sun, Plus, Trash2, CheckCircle2, Smartphone, Landmark, Calendar,
  AlertTriangle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFeedback } from "@/components/ui/feedback";
import {
  saveDayBornAmounts,
  addDayBornEntry,
  deleteDayBornEntry,
  deleteDayBornWeek,
  postDayBornToAccounting,
} from "@/app/actions/dayborn";
import { formatCurrency } from "@/config/brand";
import { cn } from "@/lib/utils";
import type { DayBornWeekRow, DayBornEntryRow } from "@/lib/data/dayborn";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

const DAY_LABELS: Record<string, string> = {
  monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday",
  thursday: "Thursday", friday: "Friday", saturday: "Saturday", sunday: "Sunday",
};

const DAY_AKAN: Record<string, string> = {
  monday: "Adwoa / Kojo", tuesday: "Abena / Kwabena", wednesday: "Akua / Kwaku",
  thursday: "Yaa / Yaw", friday: "Afia / Kofi", saturday: "Ama / Kwame",
  sunday: "Akosua / Kwesi",
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
  const diff = day === 0 ? 0 : 7 - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().slice(0, 10);
}

function getMondayFromSunday(sundayIso: string): string {
  const d = new Date(sundayIso);
  d.setDate(d.getDate() - 6);
  return d.toISOString().slice(0, 10);
}

function formatSundayDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function formatWeekRange(sundayIso: string) {
  const sun = new Date(sundayIso);
  const mon = new Date(sun);
  mon.setDate(mon.getDate() - 6);
  const fmt = (dt: Date) => dt.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${fmt(mon)} – ${fmt(sun)}, ${sun.getFullYear()}`;
}

function isSunday(iso: string): boolean {
  return new Date(iso).getDay() === 0;
}

function isFuture(iso: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(iso) > today;
}

function isPast(iso: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const selected = new Date(iso);
  selected.setHours(0, 0, 0, 0);
  return selected < today;
}

export function DayBornClient({
  weeks,
  currentMonday,
  canWrite,
  canDelete,
}: {
  weeks: DayBornWeekRow[];
  currentMonday: string;
  canWrite: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [tab, setTab] = useState<"record" | "history">("record");
  const [selectedSunday, setSelectedSunday] = useState(() => getSunday(new Date()));
  const [showMomoForm, setShowMomoForm] = useState(false);
  const [pending, startTransition] = useTransition();

  // Live local amounts for instant calculation
  const [localAmounts, setLocalAmounts] = useState<Record<string, string>>({});

  const selectedMonday = getMondayFromSunday(selectedSunday);
  const currentWeek = weeks.find(
    (w) => new Date(w.weekOf).toISOString().slice(0, 10) === selectedMonday
  );

  // Date warnings
  const dateNotSunday = !isSunday(selectedSunday);
  const dateFuture = isFuture(selectedSunday);
  const dateBackdated = isPast(selectedSunday);

  // Live calculation of cash total from local inputs
  const liveCashTotal = useMemo(() => {
    return DAYS.reduce((sum, day) => {
      const local = localAmounts[day];
      const val = local !== undefined ? parseFloat(local) || 0 : (currentWeek?.[day] ?? 0);
      return sum + val;
    }, 0);
  }, [localAmounts, currentWeek]);

  const momoTotal = currentWeek?.momoTotal ?? 0;
  const liveGrandTotal = liveCashTotal + momoTotal;

  // Totals for stats
  const totalAll = weeks.reduce((s, w) => s + w.grandTotal, 0);
  const totalCash = weeks.reduce((s, w) => s + w.cashTotal, 0);
  const totalMomo = weeks.reduce((s, w) => s + w.momoTotal, 0);
  const postedCount = weeks.filter((w) => w.posted).length;

  const handleDateChange = (dateStr: string) => {
    const d = new Date(dateStr);
    if (d.getDay() !== 0) {
      const nearestSunday = getSunday(d);
      if (isFuture(nearestSunday)) {
        toast("Future dates are not allowed");
        return;
      }
      if (!confirm(`${d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} is not a Sunday.\n\nDay Born is collected on Sundays. Use the Sunday of that week (${new Date(getSunday(d)).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}) instead?`)) {
        return;
      }
      setSelectedSunday(getSunday(d));
    } else {
      if (isFuture(dateStr)) {
        toast("Future dates are not allowed");
        return;
      }
      if (isPast(dateStr)) {
        if (!confirm(`This is a past date (${new Date(dateStr).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}).\n\nAre you recording a backdated Day Born collection?`)) {
          return;
        }
      }
      setSelectedSunday(dateStr);
    }
    setLocalAmounts({});
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Day Born</h1>
          <p className="text-muted-fg text-sm">
            Sunday day-born collections by day of the week
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-fg text-xs mb-1"><Sun className="h-4 w-4" /> Total Collected</div>
          <p className="text-xl font-bold">{formatCurrency(totalAll)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-fg text-xs mb-1"><Sun className="h-4 w-4" /> Cash Collections</div>
          <p className="text-xl font-bold">{formatCurrency(totalCash)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-fg text-xs mb-1"><Smartphone className="h-4 w-4" /> MoMo / Bank</div>
          <p className="text-xl font-bold">{formatCurrency(totalMomo)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-fg text-xs mb-1"><CheckCircle2 className="h-4 w-4" /> Posted to Accounts</div>
          <p className="text-xl font-bold">{postedCount} / {weeks.length}</p>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-separator">
        {(["record", "history"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === t
                ? "border-accent text-accent"
                : "border-transparent text-muted-fg hover:text-foreground"
            )}
          >
            {t === "record" ? "Record Collection" : "History"}
          </button>
        ))}
      </div>

      {tab === "record" && (
        <div className="space-y-4">
          {/* Sunday selector */}
          <Card className="p-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Calendar className="h-5 w-5 text-muted-fg" />
              <Label className="text-sm font-medium">Collection Sunday:</Label>
              <input
                type="date"
                value={selectedSunday}
                onChange={(e) => handleDateChange(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                className="border border-separator rounded-md px-3 py-1.5 text-sm bg-surface"
              />
              <span className="text-sm text-muted-fg">
                {formatSundayDate(selectedSunday)}
              </span>
            </div>
            {dateBackdated && isSunday(selectedSunday) && (
              <div className="flex items-center gap-2 mt-2 text-xs text-amber-600">
                <AlertTriangle className="h-3.5 w-3.5" />
                Backdated record — this is a previous Sunday
              </div>
            )}
          </Card>

          {/* Cash amounts per day — with live totals */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Cash Collections by Day</h3>
              <div className="text-right">
                <p className="text-xs text-muted-fg">Live Cash Total</p>
                <p className="text-lg font-bold text-accent">{formatCurrency(liveCashTotal)}</p>
              </div>
            </div>
            <form
              action={async (fd: FormData) => {
                fd.set("weekOf", selectedMonday);
                await saveDayBornAmounts(fd);
                router.refresh();
                toast("Day Born amounts saved");
                setLocalAmounts({});
              }}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {DAYS.map((day) => (
                  <div key={day} className="space-y-1">
                    <Label className="text-xs font-medium">
                      {DAY_LABELS[day]}{" "}
                      <span className="text-muted-fg">({DAY_AKAN[day]})</span>
                    </Label>
                    <Input
                      name={day}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      defaultValue={currentWeek?.[day] || ""}
                      disabled={!canWrite}
                      onChange={(e) => setLocalAmounts((prev) => ({ ...prev, [day]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
              {canWrite && (
                <div className="mt-4 flex items-center gap-3">
                  <SubmitButton>Save Amounts</SubmitButton>
                </div>
              )}
            </form>
          </Card>

          {/* Individual MoMo / Bank entries */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Mobile Money & Bank Transfers</h3>
              {canWrite && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowMomoForm(!showMomoForm)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Entry
                </Button>
              )}
            </div>

            {showMomoForm && canWrite && (
              <MomoForm
                selectedMonday={selectedMonday}
                router={router}
                toast={toast}
                onDone={() => setShowMomoForm(false)}
              />
            )}

            {currentWeek && currentWeek.entries.length > 0 ? (
              <div className="divide-y divide-separator">
                {currentWeek.entries.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} canWrite={canWrite} />
                ))}
                <div className="pt-3 text-sm font-medium">
                  MoMo/Bank total:{" "}
                  <span className="text-accent">{formatCurrency(momoTotal)}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-fg py-4 text-center">
                No mobile money or bank entries for this week
              </p>
            )}
          </Card>

          {/* Live week summary */}
          <Card className="p-4">
            <h3 className="font-semibold mb-2">Week Summary</h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-muted-fg">Cash</p>
                <p className="text-lg font-bold">{formatCurrency(liveCashTotal)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-fg">MoMo / Bank</p>
                <p className="text-lg font-bold">{formatCurrency(momoTotal)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-fg">Grand Total</p>
                <p className="text-lg font-bold text-accent">{formatCurrency(liveGrandTotal)}</p>
              </div>
            </div>
            {canWrite && currentWeek && !currentWeek.posted && currentWeek.grandTotal > 0 && (
              <div className="mt-4 flex justify-center">
                <Button
                  onClick={() => {
                    startTransition(async () => {
                      await postDayBornToAccounting(currentWeek.id);
                      router.refresh();
                      toast("Posted to Accounting as Day Born income");
                    });
                  }}
                  disabled={pending}
                  className="gap-2"
                >
                  {pending && <span className="whq-spin inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full" />}
                  <CheckCircle2 className="h-4 w-4" />
                  Post to Accounting
                </Button>
              </div>
            )}
            {currentWeek?.posted && (
              <div className="mt-4 text-center">
                <Badge variant="outline" className="text-green-600 border-green-600">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Posted to Accounting
                  {currentWeek.postedAt && (
                    <span className="ml-1 text-muted-fg">
                      {new Date(currentWeek.postedAt).toLocaleDateString("en-GB")}
                    </span>
                  )}
                </Badge>
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "history" && (
        <HistoryTab weeks={weeks} canWrite={canWrite} canDelete={canDelete} />
      )}
    </div>
  );
}

/* ── MoMo form with live amount preview ──────────────────── */
function MomoForm({
  selectedMonday,
  router,
  toast,
  onDone,
}: {
  selectedMonday: string;
  router: ReturnType<typeof useRouter>;
  toast: (msg: string) => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState("");

  return (
    <form
      className="border border-separator rounded-lg p-4 mb-4 space-y-3 bg-surface-raised"
      action={async (fd: FormData) => {
        fd.set("weekOf", selectedMonday);
        await addDayBornEntry(fd);
        router.refresh();
        toast("Entry added");
        onDone();
      }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Day of the Week</Label>
          <select
            name="day"
            required
            className="w-full border border-separator rounded-md px-3 py-2 text-sm bg-surface"
          >
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {DAY_LABELS[d]} — {DAY_AKAN[d]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Payment Method</Label>
          <select
            name="method"
            required
            className="w-full border border-separator rounded-md px-3 py-2 text-sm bg-surface"
          >
            {METHODS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Amount</Label>
          <Input
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            required
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          {parseFloat(amount) > 0 && (
            <p className="text-xs text-accent font-medium">{formatCurrency(parseFloat(amount))}</p>
          )}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Person Name (optional)</Label>
          <Input name="personName" placeholder="e.g. Kwame Mensah" />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Reference (optional)</Label>
          <Input name="reference" placeholder="Transaction ID" />
        </div>
      </div>
      <div className="flex gap-2">
        <SubmitButton size="sm">Add Entry</SubmitButton>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}

/* ── Entry row ───────────────────────────────────────────── */
function EntryRow({ entry, canWrite }: { entry: DayBornEntryRow; canWrite: boolean }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [delPending, startDel] = useTransition();
  const method = METHODS.find((m) => m.value === entry.method);
  const Icon = method?.icon ?? Smartphone;

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-8 w-8 rounded-full bg-accent/10 flex items-center justify-center">
        <Icon className="h-4 w-4 text-accent" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {entry.personName || DAY_LABELS[entry.day]}{" "}
          <span className="text-muted-fg font-normal">({DAY_AKAN[entry.day] ?? entry.day})</span>
        </p>
        <p className="text-xs text-muted-fg">
          {method?.label ?? entry.method}
          {entry.reference && ` · ${entry.reference}`}
        </p>
      </div>
      <span className="text-sm font-semibold">{formatCurrency(entry.amount)}</span>
      {canWrite && (
        <button
          onClick={() =>
            startDel(async () => {
              await deleteDayBornEntry(entry.id);
              router.refresh();
              toast("Entry removed");
            })
          }
          disabled={delPending}
          className="text-red-500 hover:text-red-700 p-1"
        >
          {delPending ? (
            <span className="whq-spin inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </button>
      )}
    </div>
  );
}

/* ── History tab with delete ─────────────────────────────── */
function HistoryTab({
  weeks,
  canWrite,
  canDelete,
}: {
  weeks: DayBornWeekRow[];
  canWrite: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [actionPending, startAction] = useTransition();
  const [actionId, setActionId] = useState<string | null>(null);

  if (weeks.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Sun className="h-12 w-12 mx-auto text-muted-fg/30 mb-3" />
        <p className="text-muted-fg">No Day Born records yet</p>
        <p className="text-xs text-muted-fg mt-1">
          Switch to the Record tab to start entering collections
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {weeks.map((week) => {
        const sundayIso = new Date(new Date(week.weekOf).getTime() + 6 * 86400000).toISOString().slice(0, 10);
        return (
          <Card key={week.id} className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="font-semibold text-sm">{formatWeekRange(sundayIso)}</h4>
                <div className="flex items-center gap-2 mt-1">
                  {week.posted ? (
                    <Badge variant="outline" className="text-green-600 border-green-600 text-xs">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Posted
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-amber-600 border-amber-600 text-xs">
                      Pending
                    </Badge>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-accent">{formatCurrency(week.grandTotal)}</p>
                <p className="text-xs text-muted-fg">
                  Cash: {formatCurrency(week.cashTotal)} · MoMo: {formatCurrency(week.momoTotal)}
                </p>
              </div>
            </div>

            {/* Day breakdown */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {DAYS.map((day) => (
                <div key={day} className="text-center">
                  <p className="text-[10px] text-muted-fg">{DAY_LABELS[day].slice(0, 3)}</p>
                  <p className={cn("text-xs font-medium", week[day] > 0 ? "text-foreground" : "text-muted-fg/40")}>
                    {week[day] > 0 ? formatCurrency(week[day]) : "—"}
                  </p>
                </div>
              ))}
            </div>

            {week.entries.length > 0 && (
              <p className="text-xs text-muted-fg">
                + {week.entries.length} MoMo/bank entr{week.entries.length === 1 ? "y" : "ies"} ({formatCurrency(week.momoTotal)})
              </p>
            )}

            {/* Action buttons */}
            <div className="mt-3 flex gap-2">
              {canWrite && !week.posted && week.grandTotal > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={actionPending && actionId === week.id}
                  onClick={() => {
                    setActionId(week.id);
                    startAction(async () => {
                      await postDayBornToAccounting(week.id);
                      router.refresh();
                      toast("Posted to Accounting");
                      setActionId(null);
                    });
                  }}
                >
                  {actionPending && actionId === week.id && (
                    <span className="whq-spin inline-block h-3 w-3 border-2 border-current border-t-transparent rounded-full mr-1" />
                  )}
                  Post to Accounting
                </Button>
              )}
              {canDelete && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-500 hover:text-red-700 hover:bg-red-50"
                  disabled={actionPending && actionId === `del-${week.id}`}
                  onClick={() => {
                    if (!confirm(`Delete Day Born record for ${formatWeekRange(sundayIso)}?\n\nThis cannot be undone.`)) return;
                    setActionId(`del-${week.id}`);
                    startAction(async () => {
                      await deleteDayBornWeek(week.id);
                      router.refresh();
                      toast("Record deleted");
                      setActionId(null);
                    });
                  }}
                >
                  {actionPending && actionId === `del-${week.id}` ? (
                    <span className="whq-spin inline-block h-3 w-3 border-2 border-current border-t-transparent rounded-full mr-1" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                  )}
                  Delete
                </Button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
