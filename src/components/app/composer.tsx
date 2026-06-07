"use client";

import { useState } from "react";
import { Mail, Send, Check, Smartphone } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function Composer({ segments, canWrite }: { segments: string[]; canWrite: boolean }) {
  const [channel, setChannel] = useState<"SMS" | "Email">("SMS");
  const [message, setMessage] = useState("Shalom! Join us this Sunday at 8am for our Celebration Service. God bless you!");
  const [sent, setSent] = useState(false);

  return (
    <Card>
      <div className="border-b border-line p-5"><h3 className="font-display text-lg font-semibold">New broadcast</h3></div>
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-2">
          {(["SMS", "Email"] as const).map((c) => (
            <button key={c} onClick={() => setChannel(c)}
              className={cn("flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition-colors",
                channel === c ? "border-primary/50 bg-primary/10 text-ink" : "border-line text-ink-muted hover:bg-surface-2")}>
              {c === "SMS" ? <Smartphone className="size-4" /> : <Mail className="size-4" />} {c}
            </button>
          ))}
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink-muted">Send to</label>
          <select className="flex h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
            {segments.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="font-medium text-ink-muted">Message</span>
            {channel === "SMS" && <span className="text-xs text-ink-faint">{message.length}/160 · {Math.ceil(message.length / 160) || 1} SMS</span>}
          </div>
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} className="min-h-28" />
        </div>
        {sent ? (
          <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
            <Check className="size-4" /> Broadcast queued (logged in stub mode — add an SMS key to send for real).
          </div>
        ) : (
          <Button className="w-full" onClick={() => setSent(true)} disabled={!canWrite}><Send /> Send {channel} broadcast</Button>
        )}
        <p className="text-center text-xs text-ink-faint">Sender ID: WorshipHQ · GHS billing</p>
      </div>
    </Card>
  );
}
