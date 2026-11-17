"use client";

import { useEffect, useMemo, useState } from "react";
import { Banknote, Smartphone, Landmark, Plus, Trash2, Users, ChevronDown } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { getUntaggedGifts, saveServiceSheet } from "@/app/actions/service-income";
import { COLLECTION_METHODS, type Channel } from "@/lib/giving/channels";
import { GIFT_METHOD_LABEL, WEEKDAY_NAMES, weekdayOf, type ServiceCard, type ServiceWeekData, type UntaggedGift } from "@/lib/service-income/types";
import { cn } from "@/lib/utils";
import { BusyButton, ghs, inputCls, labelCls, useLevyAction } from "@/components/app/levies/shared";

const CHANNELS: { key: Channel; label: string; icon: typeof Banknote }[] = [
  { key: "cash", label: "Cash", icon: Banknote },
  { key: "momo", label: "Mobile Money", icon: Smartphone },
  { key: "bank", label: "Bank / card", icon: Landmark },
];
const ACCOUNT_TYPE: Record<Channel, string> = { cash: "cash", momo: "mobile-money", bank: "bank" };
const NOT_BANKED = "none";
const fmtTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

type Cell = { amount: string; method: string; account: string };

/**
 * One service's counted income: a row per kind of income with cash, Mobile Money and bank amounts (the same split as
 * Giving's collection form, cash starting as "not banked yet"), linked to that day's attendance, plus gifts already
 * recorded in Giving that day which can be counted in this service.
 */
export function ServiceSheetDialog({ open, onClose, week, existing, defaultDate }: {
  open: boolean; onClose: () => void; week: ServiceWeekData; existing: ServiceCard | null; defaultDate: string;
}) {
  const { pending, run } = useLevyAction();
  const [date, setDate] = useState(existing?.dateYmd ?? defaultDate);
  const [serviceName, setServiceName] = useState(existing?.serviceName ?? "");
  const [slotId, setSlotId] = useState<string | null>(existing?.slotId ?? null);
  const [sessionId, setSessionId] = useState<string | null>(existing?.sessionId ?? null);
  const [headcount, setHeadcount] = useState(existing?.headcount ? String(existing.headcount) : "");
  const [countedBy, setCountedBy] = useState(existing?.countedBy ?? "");
  const [note, setNote] = useState(existing?.note ?? "");

  const sheetFunds = useMemo(() => {
    const flagged = week.funds.filter((f) => f.inServiceSheet);
    if (flagged.length) return flagged;
    const usual = week.funds.filter((f) => f.kind !== "other");
    return usual.length ? usual : week.funds.slice(0, 3);
  }, [week.funds]);
  const [extraFunds, setExtraFunds] = useState<string[]>([]);
  const rows = [...sheetFunds, ...week.funds.filter((f) => extraFunds.includes(f.id) && !sheetFunds.some((s) => s.id === f.id))];

  const fallback = week.accounts.find((a) => a.isDefault)?.id ?? week.accounts[0]?.id ?? NOT_BANKED;
  const pickAccount = (c: Channel) => (c === "cash" ? NOT_BANKED : week.accounts.find((a) => a.type === ACCOUNT_TYPE[c])?.id ?? fallback);
  const blank = (c: Channel): Cell => ({ amount: "", method: COLLECTION_METHODS[c][0].value, account: pickAccount(c) });
  const [cells, setCells] = useState<Record<string, Record<Channel, Cell>>>({});
  const cell = (fundId: string, c: Channel) => cells[fundId]?.[c] ?? blank(c);
  const setCell = (fundId: string, c: Channel, patch: Partial<Cell>) =>
    setCells((p) => ({ ...p, [fundId]: { ...(p[fundId] ?? { cash: blank("cash"), momo: blank("momo"), bank: blank("bank") }), [c]: { ...(p[fundId]?.[c] ?? blank(c)), ...patch } } }));

  // This record's own gifts (when editing): change amounts or remove.
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  // Gifts already in Giving that day, not tied to a service.
  const [got, setGot] = useState<{ date: string; gifts: UntaggedGift[] } | null>(null);
  const untagged = got?.date === date ? got.gifts : null;
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [showUntagged, setShowUntagged] = useState(false);
  useEffect(() => {
    let live = true;
    getUntaggedGifts(date).then((g) => { if (live) setGot({ date, gifts: g }); }).catch(() => { if (live) setGot({ date, gifts: [] }); });
    return () => { live = false; };
  }, [date]);

  const weekday = weekdayOf(date);
  const slotChoices = week.slots.filter((s) => s.weekday === weekday);
  const sessionChoices = week.sessions.filter((s) => s.dateYmd === date);
  const matchedSession = sessionChoices.find((s) => s.id === sessionId) ?? sessionChoices.find((s) => s.serviceName.toLowerCase() === serviceName.trim().toLowerCase());

  const newTotal = rows.reduce((t, f) => t + CHANNELS.reduce((s, c) => s + (Number(cell(f.id, c.key).amount) || 0), 0), 0);
  const keptTotal = (existing?.gifts ?? []).filter((g) => !removed.has(g.id)).reduce((t, g) => t + (edits[g.id] !== undefined ? Number(edits[g.id]) || 0 : g.amount), 0);
  const tagTotal = (untagged ?? []).filter((g) => tags.has(g.id)).reduce((t, g) => t + g.amount, 0);
  const total = Math.round((newTotal + keptTotal + tagTotal) * 100) / 100;
  const people = matchedSession?.total || Number(headcount) || 0;

  const save = () => {
    const lines = rows.flatMap((f) => CHANNELS.filter((c) => Number(cell(f.id, c.key).amount) > 0).map((c) => {
      const x = cell(f.id, c.key);
      return { fundId: f.id, method: x.method, amount: Number(x.amount), accountId: x.account === NOT_BANKED ? null : x.account, notBanked: x.account === NOT_BANKED };
    }));
    run(() => saveServiceSheet({
      id: existing?.id ?? null, dateYmd: date, serviceName, slotId, sessionId: matchedSession?.id ?? null, headcount: Number(headcount) || null, countedBy, note,
      lines, edits: Object.entries(edits).filter(([id]) => !removed.has(id)).map(([giftId, amount]) => {
        const g = existing!.gifts.find((x) => x.id === giftId)!;
        return { giftId, amount: Number(amount), method: g.method, accountId: g.pending ? NOT_BANKED : g.accountId, notBanked: g.pending };
      }),
      removeGiftIds: [...removed], tagGiftIds: [...tags],
    }), (r) => String(r.message), onClose);
  };

  return (
    <Modal open={open} onClose={onClose} wide title={existing ? `Edit ${existing.serviceName}` : "Add service record"} description="What one service brought in. It is saved as ordinary giving, so Giving, Accounting and Levies all see it once.">
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
          <div>
            <label className={labelCls} htmlFor="ss-date">Date</label>
            <input id="ss-date" type="date" max={week.todayYmd} value={date} onChange={(e) => { setDate(e.target.value); setTags(new Set()); }} className={inputCls} />
            <p className="mt-1 text-xs text-ink-faint">{WEEKDAY_NAMES[weekday]}</p>
          </div>
          <div>
            <label className={labelCls} htmlFor="ss-name">Service</label>
            <input id="ss-name" value={serviceName} onChange={(e) => { setServiceName(e.target.value); setSlotId(null); setSessionId(null); }} placeholder="e.g. Sunday 1st service" maxLength={80} className={inputCls} />
            {(slotChoices.length > 0 || sessionChoices.length > 0) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {slotChoices.map((s) => (
                  <button key={s.id} type="button" onClick={() => { setServiceName(s.name); setSlotId(s.id); setSessionId(null); }} className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", slotId === s.id ? "border-primary bg-primary text-white" : "border-line text-ink-muted hover:bg-surface-2")}>{s.name} · {fmtTime(s.startMinute)}</button>
                ))}
                {sessionChoices.filter((s) => !slotChoices.some((x) => x.name === s.serviceName)).map((s) => (
                  <button key={s.id} type="button" onClick={() => { setServiceName(s.serviceName); setSessionId(s.id); }} className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", sessionId === s.id ? "border-primary bg-primary text-white" : "border-line text-ink-muted hover:bg-surface-2")}>{s.serviceName}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-2 px-4 py-3 text-sm">
          <Users className="size-4 text-primary" />
          {matchedSession ? (
            <span>Linked to attendance: <b>{matchedSession.total} people</b> at {matchedSession.serviceName}</span>
          ) : (
            <>
              <span className="text-ink-muted">No attendance taken for this service. How many came?</span>
              <input type="number" min="0" value={headcount} onChange={(e) => setHeadcount(e.target.value)} placeholder="Headcount" className={`${inputCls} h-9 w-28`} aria-label="Headcount" />
            </>
          )}
        </div>

        {/* Counted money */}
        <div className="space-y-3">
          {rows.map((f) => {
            const sum = CHANNELS.reduce((s, c) => s + (Number(cell(f.id, c.key).amount) || 0), 0);
            return (
              <div key={f.id} className={cn("rounded-xl border p-3", sum > 0 ? "border-primary/40 bg-primary/5" : "border-line")}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold">{f.name}</span>
                  <span className="text-sm font-semibold tabular-nums">{sum > 0 ? ghs(sum) : ""}</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {CHANNELS.map((c) => {
                    const x = cell(f.id, c.key);
                    const Icon = c.icon;
                    return (
                      <div key={c.key}>
                        <div className="relative">
                          <Icon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
                          <input type="number" inputMode="decimal" min="0" step="0.01" value={x.amount} onChange={(e) => setCell(f.id, c.key, { amount: e.target.value })} placeholder={c.label} aria-label={`${f.name} ${c.label}`}
                            className={`${inputCls} pl-9 text-right tabular-nums`} />
                        </div>
                        {Number(x.amount) > 0 && (
                          <div className="mt-1.5 flex gap-1">
                            {COLLECTION_METHODS[c.key].length > 1 && (
                              <select value={x.method} onChange={(e) => setCell(f.id, c.key, { method: e.target.value })} className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-surface px-1.5 text-xs" aria-label="Network">
                                {COLLECTION_METHODS[c.key].map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                              </select>
                            )}
                            {week.accounts.length > 0 && (
                              <select value={x.account} onChange={(e) => setCell(f.id, c.key, { account: e.target.value })} className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-surface px-1.5 text-xs" aria-label="Into account">
                                <option value={NOT_BANKED}>Not banked yet</option>
                                {week.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                              </select>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {week.funds.some((f) => !rows.some((r) => r.id === f.id)) && (
            <label className="flex items-center gap-2 text-sm">
              <Plus className="size-4 text-primary" />
              <select value="" onChange={(e) => e.target.value && setExtraFunds((p) => [...p, e.target.value])} className="h-9 rounded-lg border border-line bg-surface px-2 text-sm" aria-label="Add another kind of income">
                <option value="">Add another kind of income</option>
                {week.funds.filter((f) => !rows.some((r) => r.id === f.id)).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </label>
          )}
        </div>

        {existing && existing.gifts.length > 0 && (
          <div>
            <div className="mb-1.5 text-sm font-semibold">Already in this record</div>
            <ul className="divide-y divide-line-soft rounded-xl border border-line text-sm">
              {existing.gifts.map((g) => (
                <li key={g.id} className={cn("flex flex-wrap items-center gap-2 px-3 py-2", removed.has(g.id) && "opacity-40 line-through")}>
                  <span className="min-w-0 flex-1">{g.fund} <span className="text-xs text-ink-faint">{GIFT_METHOD_LABEL[g.method] ?? g.method}{g.counted ? "" : `, ${g.donorName ?? "named gift"}`}{g.pending ? ", not banked yet" : ""}</span></span>
                  {g.counted && !removed.has(g.id) ? (
                    <input type="number" min="0" step="0.01" value={edits[g.id] ?? String(g.amount)} onChange={(e) => setEdits((p) => ({ ...p, [g.id]: e.target.value }))} className="h-8 w-28 rounded-lg border border-line bg-surface px-2 text-right text-sm tabular-nums" aria-label="Amount" />
                  ) : <span className="tabular-nums">{ghs(g.amount)}</span>}
                  {g.counted && (
                    <button type="button" onClick={() => setRemoved((p) => { const n = new Set(p); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n; })} className="rounded p-1 text-ink-faint hover:text-danger" aria-label={removed.has(g.id) ? "Keep" : "Remove"}><Trash2 className="size-4" /></button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-xl border border-line">
          <button type="button" onClick={() => setShowUntagged(!showUntagged)} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm">
            <span><span className="font-medium">Already recorded in Giving that day</span> <span className="text-ink-muted">{untagged === null ? "" : `(${untagged.length})`}</span></span>
            {untagged === null ? <Spinner size="sm" /> : <ChevronDown className={cn("size-4 text-ink-faint transition-transform", showUntagged && "rotate-180")} />}
          </button>
          {showUntagged && untagged && (
            untagged.length === 0 ? <p className="border-t border-line px-3 py-2.5 text-sm text-ink-muted">Nothing else recorded that day.</p> : (
              <ul className="max-h-56 divide-y divide-line-soft overflow-y-auto border-t border-line text-sm">
                {untagged.map((g) => (
                  <li key={g.id}>
                    <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2">
                      <input type="checkbox" checked={tags.has(g.id)} onChange={() => setTags((p) => { const n = new Set(p); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n; })} className="size-4 accent-[var(--color-primary)]" />
                      <span className="min-w-0 flex-1 truncate">{g.fund} <span className="text-xs text-ink-faint">{g.donorName ?? ""}</span></span>
                      <span className="tabular-nums">{ghs(g.amount)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )
          )}
          {showUntagged && untagged && untagged.length > 0 && <p className="border-t border-line px-3 py-2 text-xs text-ink-muted">Tick the ones that came in at this service to count them here. They are not entered twice.</p>}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={labelCls} htmlFor="ss-by">Counted by</label><input id="ss-by" value={countedBy} onChange={(e) => setCountedBy(e.target.value)} placeholder="e.g. Ama and Kojo" maxLength={120} className={inputCls} /></div>
          <div><label className={labelCls} htmlFor="ss-note">Note</label><input id="ss-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className={inputCls} /></div>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm text-ink-muted">Service total</div>
            <div className="font-display text-2xl font-bold tabular-nums">{ghs(total)}</div>
            {people > 0 && total > 0 && <div className="text-xs text-ink-muted">{ghs(total / people)} per person ({people} people)</div>}
          </div>
          <BusyButton size="lg" busy={pending} busyLabel="Saving service record..." onClick={save} disabled={!serviceName.trim() || !date}>Save service record</BusyButton>
        </div>
      </div>
    </Modal>
  );
}
