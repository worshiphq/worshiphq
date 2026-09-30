"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input, Textarea } from "@/components/ui/input";
import { sendBroadcast } from "@/app/actions/communications";

export function Composer({
  departments,
  groups = [],
  canWrite,
}: {
  departments: { id: string; name: string }[];
  groups?: { id: string; name: string }[];
  canWrite: boolean;
}) {
  // Email is off for now - the Resend account is on the free tier (100/day),
  // too easy for a church-wide broadcast to blow through. SMS only until
  // that's upgraded.
  const channel = "SMS" as const;
  const [target, setTarget] = useState("all");
  const [message, setMessage] = useState(
    "Shalom! Join us this Sunday at 8am for our Celebration Service. God bless you!",
  );

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
            <option value="visitor">Visitors</option>
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
              {message.length}/160 · {Math.ceil(message.length / 160) || 1} SMS
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
