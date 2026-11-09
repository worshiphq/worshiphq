"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HeartHandshake, Loader2, Search, MessageSquare } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { ListPager } from "@/components/ui/list-pager";
import { toastNow } from "@/components/ui/feedback";
import { loadAbsentees, followUpAbsentees } from "@/app/actions/absentees";
import type { AbsenteeRow } from "@/lib/attendance/absentees";

type Grouping = { key: string; label: string; groups: { id: string; name: string }[] };
type User = { id: string; name: string };
const PAGE = 25;
const input = "h-10 rounded-lg border border-line bg-base px-3 text-sm text-ink outline-none focus:border-primary/60";

export function AbsenteeFollowUpButton(props: {
  sessionId: string;
  serviceName: string;
  groupings: Grouping[];
  users: User[];
  smsDefault: string;
  canSms: boolean;
  smsBalance: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <HeartHandshake /> Follow up absentees
      </Button>
      {open && <AbsenteeDialog {...props} onClose={() => setOpen(false)} />}
    </>
  );
}

function AbsenteeDialog({ sessionId, serviceName, groupings, users, smsDefault, canSms, smsBalance, onClose }: Parameters<typeof AbsenteeFollowUpButton>[0] & { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [grouping, setGrouping] = useState("");
  const [groupId, setGroupId] = useState("");
  const [regularsOnly, setRegularsOnly] = useState(true);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AbsenteeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [allIds, setAllIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [perPerson, setPerPerson] = useState<Record<string, string>>({});
  const [bulkUser, setBulkUser] = useState("");
  const [sms, setSms] = useState(false);
  const [smsText, setSmsText] = useState(smsDefault);
  const [saving, setSaving] = useState(false);
  const lastClick = useRef<number | null>(null);
  const seq = useRef(0);

  const fetchPage = useCallback(async (p: number) => {
    const my = ++seq.current;
    setLoading(true);
    const res = await loadAbsentees(sessionId, { q, grouping: grouping || undefined, groupId: groupId || undefined, regularsOnly }, p);
    if (my !== seq.current) return;
    setLoading(false);
    if (!res.ok) { setError(res.error); return; }
    setError(null);
    setRows(res.rows); setTotal(res.total); setAllIds(res.allIds);
  }, [sessionId, q, grouping, groupId, regularsOnly]);

  // Filters apply at once; typing waits 300ms. Any change goes back to page 1.
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); fetchPage(1); }, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q, grouping, groupId, regularsOnly, fetchPage]);

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const groupOpts = groupings.find((g) => g.key === grouping)?.groups ?? [];
  const pageIds = rows.map((r) => r.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => chosen.has(id));

  const toggle = (idx: number, shift: boolean) => {
    const id = rows[idx].id;
    const next = new Set(chosen);
    const on = !next.has(id);
    if (shift && lastClick.current !== null) {
      const [a, b] = [Math.min(lastClick.current, idx), Math.max(lastClick.current, idx)];
      for (let i = a; i <= b; i++) { if (on) next.add(rows[i].id); else next.delete(rows[i].id); }
    } else if (on) next.add(id);
    else next.delete(id);
    lastClick.current = idx;
    setChosen(next);
  };

  const applyBulk = () => {
    if (!bulkUser) return;
    const next = { ...perPerson };
    for (const id of chosen) next[id] = bulkUser;
    setPerPerson(next);
    toastNow(`Assigned ${chosen.size} ${chosen.size === 1 ? "person" : "people"} to ${users.find((u) => u.id === bulkUser)?.name ?? "them"}.`, "success");
  };

  const submit = async () => {
    if (chosen.size === 0) return;
    if (sms && !window.confirm(`Text ${chosen.size} ${chosen.size === 1 ? "person" : "people"} now? This uses SMS credits (you have ${smsBalance}).`)) return;
    setSaving(true);
    try {
      const res = await followUpAbsentees({
        sessionId, personIds: [...chosen],
        perPerson: Object.fromEntries([...chosen].filter((id) => perPerson[id]).map((id) => [id, perPerson[id]])),
        smsText: sms ? smsText : undefined,
      });
      if (!res.ok) { toastNow(res.error, "error"); setSaving(false); return; }
      const bits = [`${res.created} follow-up${res.created === 1 ? "" : "s"} added`];
      if (res.texted) bits.push(`${res.texted} texted`);
      if (res.noPhone) bits.push(`${res.noPhone} had no phone`);
      if (res.insufficient) bits.push("SMS credits ran out");
      if (res.skipped) bits.push(`${res.skipped} skipped (checked in or already followed up)`);
      toastNow(bits.join(", ") + ".", res.insufficient ? "error" : "success");
      router.push("/app/follow-ups");
    } catch (e) {
      toastNow(e instanceof Error ? e.message : "Could not add them.", "error");
      setSaving(false);
    }
  };

  const assigned = [...chosen].filter((id) => perPerson[id]).length;

  return (
    <Modal open onClose={saving ? () => {} : onClose} wide title={`Follow up absentees: ${serviceName}`} description="Members who did not check in to this service. People who already have an open follow-up are left out.">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or phone" className={`${input} w-full pl-9`} />
        </div>
        {groupings.length > 0 && (
          <select value={grouping} onChange={(e) => { setGrouping(e.target.value); setGroupId(""); }} className={input} aria-label="Filter by">
            <option value="">Everyone</option>
            {groupings.map((g) => <option key={g.key} value={g.key}>By {g.label.toLowerCase()}</option>)}
          </select>
        )}
        {grouping && (
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={input} aria-label="Group">
            <option value="">All {groupings.find((g) => g.key === grouping)?.label.toLowerCase()}s</option>
            {groupOpts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-ink-muted">
        <input type="checkbox" checked={regularsOnly} onChange={(e) => setRegularsOnly(e.target.checked)} className="size-4 accent-[var(--color-primary)]" />
        Only regulars (came at least once in the last 8 weeks)
      </label>

      {/* Selection bar */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-base px-3 py-2 text-sm">
        <span className="text-ink-muted">
          <strong className="text-ink">{chosen.size}</strong> chosen
          {total > 0 && chosen.size < total && (
            <button type="button" className="ml-2 text-primary-bright hover:underline" onClick={() => setChosen(new Set(allIds))}>Select all {total}</button>
          )}
          {chosen.size > 0 && <button type="button" className="ml-2 text-ink-muted hover:underline" onClick={() => setChosen(new Set())}>Clear</button>}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <select value={bulkUser} onChange={(e) => setBulkUser(e.target.value)} className={`${input} h-9`} aria-label="Assign chosen to">
            <option value="">Assign chosen to...</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <Button type="button" size="sm" variant="outline" disabled={!bulkUser || chosen.size === 0} onClick={applyBulk}>Apply</Button>
        </span>
      </div>

      {/* List */}
      <div className="mt-3 overflow-hidden rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="w-10 px-3 py-2">
                <input type="checkbox" aria-label="Choose everyone on this page" checked={allOnPage} onChange={(e) => {
                  const next = new Set(chosen);
                  for (const id of pageIds) { if (e.target.checked) next.add(id); else next.delete(id); }
                  setChosen(next);
                }} className="size-4 accent-[var(--color-primary)]" />
              </th>
              <th className="px-2 py-2">Name</th>
              <th className="hidden px-2 py-2 sm:table-cell">Last seen</th>
              <th className="px-2 py-2">Assign to</th>
            </tr>
          </thead>
          <tbody className={loading ? "opacity-50" : ""}>
            {rows.map((r, i) => (
              <tr key={r.id} className="border-t border-line">
                <td className="px-3 py-2">
                  <input type="checkbox" checked={chosen.has(r.id)} onChange={() => {}} onClick={(e) => toggle(i, e.shiftKey)} aria-label={`Choose ${r.name}`} className="size-4 accent-[var(--color-primary)]" />
                </td>
                <td className="px-2 py-2">
                  <div className="font-medium text-ink">{r.name}</div>
                  <div className="text-xs text-ink-faint">{[r.groups.join(", "), r.phone ? null : "no phone"].filter(Boolean).join(" · ") || " "}</div>
                </td>
                <td className="hidden px-2 py-2 text-ink-muted sm:table-cell">
                  {r.lastSeen ? new Date(r.lastSeen).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "Never"}
                </td>
                <td className="px-2 py-2">
                  <select value={perPerson[r.id] ?? ""} onChange={(e) => {
                    setPerPerson({ ...perPerson, [r.id]: e.target.value });
                    if (e.target.value && !chosen.has(r.id)) setChosen(new Set(chosen).add(r.id));
                  }} className={`${input} h-9 w-full max-w-44`} aria-label={`Assign ${r.name}`}>
                    <option value="">Nobody yet</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-ink-muted">{error ?? (regularsOnly ? "No regulars missed this service. Untick \"Only regulars\" to see everyone." : "Everyone is accounted for.")}</td></tr>
            )}
            {loading && rows.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-ink-muted"><Loader2 className="mr-2 inline size-4 animate-spin" />Finding who was missing...</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {total > PAGE && <ListPager page={page} pages={pages} total={total} size={PAGE} onPage={(p) => { setPage(p); fetchPage(p); }} />}

      {/* Optional check-in text */}
      <div className="mt-4 rounded-xl border border-line p-3">
        <label className={`flex items-center gap-2 text-sm font-medium ${canSms ? "text-ink" : "text-ink-faint"}`}>
          <input type="checkbox" checked={sms} disabled={!canSms} onChange={(e) => setSms(e.target.checked)} className="size-4 accent-[var(--color-primary)]" />
          <MessageSquare className="size-4" /> Also send them a quiet check-in text
          {!canSms && <span className="text-xs font-normal">(SMS is on the Starter plan)</span>}
        </label>
        {sms && (
          <>
            <textarea value={smsText} onChange={(e) => setSmsText(e.target.value)} rows={3} maxLength={640} className="mt-2 w-full rounded-lg border border-line bg-base p-3 text-sm text-ink outline-none focus:border-primary/60" />
            <p className="mt-1 text-xs text-ink-faint">{"{name}"} becomes their first name, {"{service}"} the service, {"{church}"} your church. Only people with a phone number are texted. Balance: {smsBalance} credits. Change the default wording in Settings, Messages.</p>
          </>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-ink-muted">{chosen.size > 0 && `${assigned} of ${chosen.size} assigned. Unassigned ones still go on the list.`}</span>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={saving || chosen.size === 0}>
            {saving ? <><Loader2 className="animate-spin" /> Adding to follow-ups...</> : `Add ${chosen.size || ""} to follow-ups`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
