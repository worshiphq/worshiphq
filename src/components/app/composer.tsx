"use client";

import { segmentsFor } from "@/config/sms";
import { useEffect, useState } from "react";
import Link from "@/components/ui/app-link";
import { Globe2, Loader2, Send, Sparkles, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input, Textarea } from "@/components/ui/input";
import { sendBroadcast, previewBroadcastCost } from "@/app/actions/communications";

export function Composer({
  departments,
  groups = [],
  canWrite,
  senderTeaser = null,
  nameLine = null,
  initialTarget = "all",
}: {
  departments: { id: string; name: string }[];
  /** Pre-selected audience, e.g. "visitor" when opened from the Visitors page. */
  initialTarget?: string;
  groups?: { id: string; name: string }[];
  canWrite: boolean;
  /** A suggested own sender name, shown as a quiet hint to churches that do not have one yet. */
  senderTeaser?: { suggestion: string; churchName: string } | null;
  /** The name line every text starts with. It counts toward the 160 characters. Null when the church has its own sender name. */
  nameLine?: string | null;
}) {
  // Email is off for now - the Resend account is on the free tier (100/day),
  // too easy for a church-wide broadcast to blow through. SMS only until
  // that's upgraded.
  const channel = "SMS" as const;
  const [hideTeaser, setHideTeaser] = useState(false);
  // Remember a dismissal on this device only. Storage can be blocked, so the hint simply shows again then.
  useEffect(() => {
    try { if (localStorage.getItem("whq-sender-teaser") === "off") setHideTeaser(true); } catch { /* ignore */ }
  }, []);
  function dismissTeaser() {
    setHideTeaser(true);
    try { localStorage.setItem("whq-sender-teaser", "off"); } catch { /* ignore */ }
  }
  const [target, setTarget] = useState(initialTarget);
  const [message, setMessage] = useState(
    "Shalom! Join us this Sunday at 8am for our Celebration Service. God bless you!",
  );
  const [contacts, setContacts] = useState("");

  // What this send will cost, worked out on the server with the same rules the send uses. Numbers outside Ghana cost
  // more, so the church sees them before pressing Send rather than finding the balance gone afterwards.
  type Cost = Awaited<ReturnType<typeof previewBroadcastCost>>;
  const [cost, setCost] = useState<Cost | null>(null);
  const [costing, setCosting] = useState(false);
  useEffect(() => {
    if (!canWrite || !message.trim()) { setCost(null); return; }
    let live = true;
    setCosting(true);
    const t = setTimeout(() => {
      previewBroadcastCost({ target, contacts, message })
        .then((c) => { if (live) setCost(c); })
        .catch(() => { if (live) setCost(null); })
        .finally(() => { if (live) setCosting(false); });
    }, 600);
    return () => { live = false; clearTimeout(t); };
  }, [target, contacts, message, canWrite]);

  const selectCls =
    "flex h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30";

  return (
    <Card>
      <div className="border-b border-line p-5">
        <h3 className="font-display text-lg font-semibold">New broadcast</h3>
      </div>
      <form action={sendBroadcast} className="space-y-4 p-5">
        <input type="hidden" name="channel" value={channel} />

        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink-muted">Campaign name</label>
          <Input name="name" defaultValue="Sunday service reminder" required />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink-muted">Send to</label>
          <select name="target" value={target} onChange={(e) => setTarget(e.target.value)} className={selectCls}>
            <option value="all">Everyone</option>
            <option value="active">Active members</option>
            <option value="visitor">All visitors</option>
            <option value="visitor-30">Visitors from the last 30 days</option>
            <option value="leaders">Church leaders</option>
            <option value="group-leaders">Group / ministry leaders</option>
            <option value="missing-national-id">Adults missing Ghana Card</option>
            {departments.length > 0 && (
              <optgroup label="By department">
                {departments.map((d) => <option key={d.id} value={`dept:${d.id}`}>{d.name}</option>)}
              </optgroup>
            )}
            {groups.length > 0 && (
              <optgroup label="By group">
                {groups.map((g) => <option key={g.id} value={`group:${g.id}`}>{g.name}</option>)}
              </optgroup>
            )}
            <option value="custom">Specific numbers…</option>
          </select>
        </div>

        {target === "custom" && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-muted">Phone numbers</label>
            <Textarea
              name="contacts"
              value={contacts}
              onChange={(e) => setContacts(e.target.value)}
              placeholder="024 000 0000, 020 111 2222"
              className="min-h-16"
            />
            <p className="mt-1 text-xs text-ink-faint">Separate with commas, spaces or new lines.</p>
          </div>
        )}

        <div>
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="font-medium text-ink-muted">Message</span>
            <span className="text-xs text-ink-faint">
              {message.length + (nameLine ? nameLine.length + 1 : 0)}/160 · {segmentsFor(nameLine ? nameLine + "\n" + message : message)} SMS{nameLine ? " (name line included)" : ""}
            </span>
          </div>
          <Textarea name="message" value={message} onChange={(e) => setMessage(e.target.value)} className="min-h-28" required />
          <div className="mt-1.5 flex items-center gap-2 text-xs text-ink-faint">
            <span>Address each person by name:</span>
            <button
              type="button"
              onClick={() => setMessage((m) => `${m}{name}`)}
              className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-muted hover:bg-primary/10 hover:text-primary"
            >
              {"{name}"}
            </button>
            <span>becomes their first name for every recipient.</span>
          </div>
        </div>

        {senderTeaser && !hideTeaser && (
          <div className="flex items-start gap-2.5 rounded-xl border border-dashed border-line bg-surface-2 px-3.5 py-3 text-xs text-ink-muted">
            <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <p className="min-w-0 flex-1">
              Members now see this text from <b className="text-ink">WorshipHQ</b>, with {senderTeaser.churchName} at the start. On Max it could arrive from{" "}
              <b className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-primary">{senderTeaser.suggestion}</b>.{" "}
              <Link href="/app/settings?tab=billing" className="font-medium text-primary hover:underline">See plans</Link>
            </p>
            <button type="button" onClick={dismissTeaser} aria-label="Hide this hint" className="rounded p-0.5 text-ink-faint hover:text-ink"><X className="size-3.5" /></button>
          </div>
        )}

        {canWrite && (costing || cost) && (
          <div className={`rounded-xl border px-3.5 py-3 text-xs ${cost && cost.credits > cost.balance ? "border-danger/30 bg-danger/10 text-danger" : "border-line bg-surface-2/60 text-ink-muted"}`}>
            {costing && !cost ? (
              <span className="inline-flex items-center gap-1.5"><Loader2 className="size-3.5 animate-spin" /> Working out the cost…</span>
            ) : cost ? (
              <>
                <div className="flex items-center gap-1.5">
                  {costing && <Loader2 className="size-3 animate-spin" />}
                  <span>
                    {cost.people.toLocaleString()} {cost.people === 1 ? "person" : "people"} · about <b className="text-ink">{cost.credits.toLocaleString()} credits</b> (you have {cost.balance.toLocaleString()})
                  </span>
                </div>
                {cost.foreign > 0 && (
                  <div className="mt-1.5 flex items-start gap-1.5">
                    <Globe2 className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      {cost.foreign.toLocaleString()} {cost.foreign === 1 ? "number is" : "numbers are"} outside Ghana: {cost.foreignPerSegment} credits per SMS each
                      {" "}({(cost.foreign * cost.foreignPerSegment * cost.segments).toLocaleString()} credits of the total).
                    </span>
                  </div>
                )}
                {cost.credits > cost.balance && (
                  <div className="mt-1.5 font-medium">Not enough credits: nothing will be sent. <Link href="/app/communications/credits" className="underline">Top up</Link></div>
                )}
              </>
            ) : null}
          </div>
        )}

        <SubmitButton
          className="w-full"
          disabled={!canWrite}
          pendingLabel="Sending SMS…"
          successMessage="SMS sent"
        >
          <Send /> Send SMS
        </SubmitButton>
        <p className="text-center text-xs text-ink-faint">SMS is billed to your credits · sender shows your church name</p>
      </form>
    </Card>
  );
}
