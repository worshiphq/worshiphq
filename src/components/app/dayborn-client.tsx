"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Sun, Plus, Trash2, CheckCircle2, Smartphone, Landmark, Calendar,
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
  postDayBornToAccounting,
} from "@/app/actions/dayborn";
import { formatCurrency } from "@/config/brand";
import { cn } from "@/lib/utils";
import type { DayBornWeekRow, DayBornEntryRow } from "@/lib/data/dayborn";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

const DAY_LABELS: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

const DAY_AKAN: Record<string, string> = {
  monday: "Adwoa / Kojo",
  tuesday: "Abena / Kwabena",
  wednesday: "Akua / Kwaku",
  thursday: "Yaa / Yaw",
  friday: "Afia / Kofi",
  saturday: "Ama / Kwame",
  sunday: "Akosua / Kwesi",
};

const METHODS = [
  { value: "MTN_MoMo", label: "MTN MoMo", icon: Smartphone },
  { value: "Telecel_Cash", label: "Telecel Cash", icon: Smartphone },
  { value: "AirtelTigo", label: "AirtelTigo", icon: Smartphone },
  { value: "bank_transfer", label: "Bank Transfer", icon: Landmark },
];

function getMonday(d: Date): string {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().slice(0, 10);
}

function formatWeek(iso: string) {
  const d = new Date(iso);
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  const fmt = (dt: Date) =>
    dt.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${fmt(d)} – ${fmt(end)}, ${d.getFullYear()}`;
}

export function DayBornClient({
  weeks,
  currentMonday,
  canWrite,
}: {
  weeks: DayBornWeekRow[];
  currentMonday: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [tab, setTab] = useState<"record" | "history">("record");
  const [selectedWeek, setSelectedWeek] = useState(getMonday(new Date(currentMonday)));
  const [showMomoForm, setShowMomoForm] = useState(false);
  const [pending, startTransition] = useTransition();

  const currentWeek = weeks.find(
    (w) => new Date(w.weekOf).toISOString().slice(0, 10) === selectedWeek
  );

  const totalCash = weeks.reduce((s, w) => s + w.cashTotal, 0);
  const totalMomo = weeks.reduce((s, w) => s + w.momoTotal, 0);
  const totalAll = weeks.reduce((s, w) => s + w.grandTotal, 0);
  const postedCount = weeks.filter((w) => w.posted).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Day Born</h1>
          <p className="text-muted-fg text-sm">
            Weekly day-born collections by day of the week
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
        <RecordTab
          selectedWeek={selectedWeek}
          setSelectedWeek={setSelectedWeek}
          currentWeek={currentWeek}
          canWrite={canWrite}
          showMomoForm={showMomoForm}
          setShowMomoForm={setShowMomoForm}
          router={router}
          toast={toast}
          pending={pending}
          startTransition={startTransition}
        />
      )}

      {tab === "history" && (
        <HistoryTab
          weeks={weeks}
          canWrite={canWrite}
          router={router}
          toast={toast}
        />
      )}
    </div>
  );
}

/* ── Record tab ──────────────────────────────────────────── */
function RecordTab({
  selectedWeek,
  setSelectedWeek,
  currentWeek,
  canWrite,
  showMomoForm,
  setShowMomoForm,
  router,
  toast,
  pending,
  startTransition,
}: {
  selectedWeek: string;
  setSelectedWeek: (w: string) => void;
  currentWeek: DayBornWeekRow | undefined;
  canWrite: boolean;
  showMomoForm: boolean;
  setShowMomoForm: (v: boolean) => void;
  router: ReturnType<typeof useRouter>;
  toast: (msg: string) => void;
  pending: boolean;
  startTransition: (fn: () => void) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Week selector */}
      <Card className="p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Calendar className="h-5 w-5 text-muted-fg" />
          <Label className="text-sm font-medium">Week of:</Label>
          <input
            type="date"
            value={selectedWeek}
            onChange={(e) => {
              const d = new Date(e.target.value);
              setSelectedWeek(getMonday(d));
            }}
            className="border border-separator rounded-md px-3 py-1.5 text-sm bg-surface"
          />
          <span className="text-sm text-muted-fg">
            {formatWeek(selectedWeek)}
          </span>
        </div>
      </Card>

      {/* Cash amounts per day */}
      <Card className="p-4">
        <h3 className="font-semibold mb-3">Cash Collections by Day</h3>
        <form
          action={async (fd: FormData) => {
            fd.set("weekOf", selectedWeek);
            await saveDayBornAmounts(fd);
            router.refresh();
            toast("Day Born amounts saved");
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
                />
              </div>
            ))}
          </div>
          {canWrite && (
            <div className="mt-4 flex items-center gap-3">
              <SubmitButton>Save Amounts</SubmitButton>
              {currentWeek && (
                <span className="text-xs text-muted-fg">
                  Cash total: {formatCurrency(currentWeek.cashTotal)}
                </span>
              )}
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
          <form
            className="border border-separator rounded-lg p-4 mb-4 space-y-3 bg-surface-raised"
            action={async (fd: FormData) => {
              fd.set("weekOf", selectedWeek);
              await addDayBornEntry(fd);
              router.refresh();
              toast("Entry added");
              setShowMomoForm(false);
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
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Amount</Label>
                <Input name="amount" type="number" min="0.01" step="0.01" required placeholder="0.00" />
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
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setShowMomoForm(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}

        {/* Entries list */}
        {currentWeek && currentWeek.entries.length > 0 ? (
          <div className="divide-y divide-separator">
            {currentWeek.entries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                canWrite={canWrite}
                router={router}
                toast={toast}
              />
            ))}
            <div className="pt-3 text-sm font-medium">
              MoMo/Bank total:{" "}
              <span className="text-accent">
                {formatCurrency(currentWeek.momoTotal)}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-fg py-4 text-center">
            No mobile money or bank entries for this week
          </p>
        )}
      </Card>

      {/* Week summary */}
      {currentWeek && (
        <Card className="p-4">
          <h3 className="font-semibold mb-2">Week Summary</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-muted-fg">Cash</p>
              <p className="text-lg font-bold">{formatCurrency(currentWeek.cashTotal)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-fg">MoMo / Bank</p>
              <p className="text-lg font-bold">{formatCurrency(currentWeek.momoTotal)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-fg">Grand Total</p>
              <p className="text-lg font-bold text-accent">{formatCurrency(currentWeek.grandTotal)}</p>
            </div>
          </div>
          {canWrite && !currentWeek.posted && currentWeek.grandTotal > 0 && (
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
          {currentWeek.posted && (
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
      )}
    </div>
  );
}

/* ── Entry row ───────────────────────────────────────────── */
function EntryRow({
  entry,
  canWrite,
  router,
  toast,
}: {
  entry: DayBornEntryRow;
  canWrite: boolean;
  router: ReturnType<typeof useRouter>;
  toast: (msg: string) => void;
}) {
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
          <span className="text-muted-fg font-normal">
            ({DAY_AKAN[entry.day] ?? entry.day})
          </span>
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

/* ── History tab ─────────────────────────────────────────── */
function HistoryTab({
  weeks,
  canWrite,
  router,
  toast,
}: {
  weeks: DayBornWeekRow[];
  canWrite: boolean;
  router: ReturnType<typeof useRouter>;
  toast: (msg: string) => void;
}) {
  const [posting, startPost] = useTransition();
  const [postingId, setPostingId] = useState<string | null>(null);

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
      {weeks.map((week) => (
        <Card key={week.id} className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="font-semibold text-sm">{formatWeek(week.weekOf)}</h4>
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
              <p className="text-lg font-bold text-accent">
                {formatCurrency(week.grandTotal)}
              </p>
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

          {/* Entries count */}
          {week.entries.length > 0 && (
            <p className="text-xs text-muted-fg">
              + {week.entries.length} MoMo/bank entr{week.entries.length === 1 ? "y" : "ies"} ({formatCurrency(week.momoTotal)})
            </p>
          )}

          {/* Post button */}
          {canWrite && !week.posted && week.grandTotal > 0 && (
            <div className="mt-3">
              <Button
                size="sm"
                variant="outline"
                disabled={posting && postingId === week.id}
                onClick={() => {
                  setPostingId(week.id);
                  startPost(async () => {
                    await postDayBornToAccounting(week.id);
                    router.refresh();
                    toast("Posted to Accounting");
                    setPostingId(null);
                  });
                }}
              >
                {posting && postingId === week.id && (
                  <span className="whq-spin inline-block h-3 w-3 border-2 border-current border-t-transparent rounded-full mr-1" />
                )}
                Post to Accounting
              </Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
