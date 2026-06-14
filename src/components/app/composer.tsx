"use client";

import { useState } from "react";
import { Mail, Send, Smartphone } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input, Textarea } from "@/components/ui/input";
import { sendBroadcast } from "@/app/actions/communications";
import { cn } from "@/lib/utils";

export function Composer({ segments, canWrite }: { segments: string[]; canWrite: boolean }) {
  const [channel, setChannel] = useState<"SMS" | "Email">("SMS");
  const [message, setMessage] = useState(
    "Shalom! Join us this Sunday at 8am for our Celebration Service. God bless you!",
  );

  return (
    <Card>
      <div className="border-b border-line p-5">
        <h3 className="font-display text-lg font-semibold">New broadcast</h3>
      </div>
      <form action={sendBroadcast} className="space-y-4 p-5">
        <input type="hidden" name="channel" value={channel} />
        <div className="grid grid-cols-2 gap-2">
          {(["SMS", "Email"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setChannel(c)}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition-colors",
                channel === c ? "border-primary/50 bg-primary/10 text-ink" : "border-line text-ink-muted hover:bg-surface-2",
              )}
            >
              {c === "SMS" ? <Smartphone className="size-4" /> : <Mail className="size-4" />} {c}
            </button>
          ))}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink-muted">Campaign name</label>
          <Input name="name" defaultValue="Sunday service reminder" required />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink-muted">Send to</label>
          <select
            name="segment"
            className="flex h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            {segments.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="font-medium text-ink-muted">Message</span>
            {channel === "SMS" && (
              <span className="text-xs text-ink-faint">
                {message.length}/160 · {Math.ceil(message.length / 160) || 1} SMS
              </span>
            )}
          </div>
          <Textarea name="message" value={message} onChange={(e) => setMessage(e.target.value)} className="min-h-28" required />
        </div>

        <SubmitButton
          className="w-full"
          disabled={!canWrite}
          pendingLabel={`Sending ${channel}…`}
          successMessage={`${channel} broadcast sent`}
        >
          <Send /> Send {channel} broadcast
        </SubmitButton>
        <p className="text-center text-xs text-ink-faint">
          Sender ID: WorshipHQ · GHS billing{" "}
          {channel === "SMS" ? "· SMS logs to console until an Arkesel key is added" : "· email logs to console until a Resend key is added"}
        </p>
      </form>
    </Card>
  );
}
