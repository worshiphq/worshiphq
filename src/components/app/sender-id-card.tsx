"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useFeedback } from "@/components/ui/feedback";
import { requestSenderId } from "@/app/actions/settings";

/** Settings, SMS Settings: ask for your church's own SMS sender name (paid plans only). */
export function SenderIdCard({ current, status, paid, canManage }: { current: string | null; status: string | null; paid: boolean; canManage: boolean }) {
  const { toast } = useFeedback();
  const [value, setValue] = useState(current ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await requestSenderId(value);
      if (r.ok) toast("Request sent. We will let you know when it is approved.", "success");
      else toast(r.error, "error");
    } catch (err) { toast((err as Error).message || "Something went wrong.", "error"); }
    finally { setBusy(false); }
  }

  return (
    <Card className="p-6">
      <h3 className="font-display text-lg font-semibold">SMS Settings</h3>
      <p className="mt-1 text-sm text-ink-muted">
        Texts to your members go out under WorshipHQ&apos;s sender name, with your church&apos;s name at the start of each message. Here you can ask for your own sender name instead.
      </p>

      {!paid ? (
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-line bg-surface-2 p-4">
          <Lock className="mt-0.5 size-5 shrink-0 text-ink-faint" />
          <div className="text-sm">
            <div className="font-medium">SMS and your own sender name come with the paid plans</div>
            <p className="mt-1 text-ink-muted">Upgrade to Starter or higher to send SMS to your members and to request a sender name such as GraceTemple.</p>
            <Link href="/app/settings?tab=billing" className="mt-2 inline-block font-medium text-primary hover:underline">See plans</Link>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-5">
          <Label>Request your own sender name (Sender ID)</Label>
          <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="GraceTemple" maxLength={11} disabled={!canManage} />
          <p className="mt-2 text-xs text-ink-faint">3 to 11 letters and numbers, no spaces or symbols. Networks must approve it, which can take a couple of weeks.</p>
          {current && (
            <div className="mt-4 text-sm">
              Status for <b>{current}</b>: <Badge variant="default">{status ?? "pending"}</Badge>
            </div>
          )}
          <Button type="submit" className="mt-5" disabled={!canManage || busy || value.trim().length < 3}>
            {busy ? <><Loader2 className="size-4 animate-spin" /> Sending…</> : "Submit request"}
          </Button>
        </form>
      )}
    </Card>
  );
}
