"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2, MessageSquareText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFeedback } from "@/components/ui/feedback";
import { saveMessageName } from "@/app/actions/message-name";
import { cleanMessageName, MAX_MESSAGE_NAME, SAMPLE_MESSAGE, suggestShortName } from "@/lib/sms/message-name";
import { segmentsFor } from "@/config/sms";
import { cn } from "@/lib/utils";

type Choice = "full" | "short" | "custom";

/**
 * Communications: how the church's name appears at the start of every text. It counts toward the 160 characters in one
 * text, so this is shown plainly, with examples of how the message will look. Until a church chooses, the dashboard
 * shows an urgent reminder and its texts keep starting with its full name.
 */
export function MessageNameCard({ churchName, chosen, canWrite }: { churchName: string; chosen: string | null; canWrite: boolean }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [saving, startSave] = useTransition();
  const full = cleanMessageName(churchName);
  const short = suggestShortName(churchName);
  const shortDiffers = short.length > 0 && short.toLowerCase() !== full.toLowerCase();

  const initial: Choice = chosen == null ? (shortDiffers ? "short" : "full") : chosen === full ? "full" : chosen === short ? "short" : "custom";
  const [choice, setChoice] = useState<Choice>(initial);
  const [custom, setCustom] = useState(chosen && initial === "custom" ? chosen : "");
  const [editing, setEditing] = useState(chosen == null);

  const name = choice === "full" ? full : choice === "short" ? short : cleanMessageName(custom);
  const text = `${name}\n${SAMPLE_MESSAGE}`;
  const used = name.length + 1 + SAMPLE_MESSAGE.length;
  const credits = segmentsFor(text);
  const urgent = chosen == null;

  const options: { key: Choice; label: string; value: string }[] = [
    { key: "full", label: "My full church name", value: full },
    ...(shortDiffers ? [{ key: "short" as const, label: "A shorter name", value: short }] : []),
  ];

  function save() {
    startSave(async () => {
      const r = await saveMessageName(name);
      if (!r.ok) { toast(r.error, "error"); return; }
      toast("Saved. Your texts now start with this name.", "success");
      setEditing(false);
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex min-w-0 items-center gap-3 text-sm">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><MessageSquareText className="size-4" /></span>
          <div className="min-w-0">
            <div className="text-xs text-ink-muted">Your texts start with</div>
            <div className="truncate font-semibold">{chosen}</div>
          </div>
        </div>
        {canWrite && <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(true)}>Change</Button>}
      </Card>
    );
  }

  return (
    <Card className={cn("mb-4 p-5", urgent && "border-warning/50 bg-warning/5")}>
      <div className="flex flex-wrap items-start gap-3">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", urgent ? "bg-warning/15 text-warning" : "bg-primary/10 text-primary")}>
          {urgent ? <AlertTriangle className="size-5" /> : <MessageSquareText className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-semibold">
            {urgent ? "Choose how your church name shows on your texts" : "How your church name shows on your texts"}
          </h3>
          <p className="mt-1 text-sm text-ink-muted">
            Your texts are sent from <b className="text-ink">WorshipHQ</b>. So people know a message is from you, every text starts with a name line. <b className="text-ink">That line is part of the 160 characters in one text.</b> If a message goes past 160 characters it is sent as 2 texts and costs 2 credits for every person. A shorter name leaves more room for your message.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="space-y-2.5">
          {options.map((o) => {
            const left = 160 - o.value.length - 1;
            return (
              <label key={o.key} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors", choice === o.key ? "border-primary bg-primary/5" : "border-line hover:bg-surface-2")}>
                <input type="radio" name="message-name" checked={choice === o.key} onChange={() => setChoice(o.key)} className="mt-1 size-4 accent-primary" disabled={!canWrite} />
                <span className="min-w-0">
                  <span className="block text-xs text-ink-muted">{o.label}</span>
                  <span className="block break-words font-semibold">{o.value}</span>
                  <span className="mt-0.5 block text-xs text-ink-faint">{o.value.length} characters. Leaves {left} for your message.</span>
                </span>
              </label>
            );
          })}
          <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors", choice === "custom" ? "border-primary bg-primary/5" : "border-line hover:bg-surface-2")}>
            <input type="radio" name="message-name" checked={choice === "custom"} onChange={() => setChoice("custom")} className="mt-1 size-4 accent-primary" disabled={!canWrite} />
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-ink-muted">Your own wording (up to {MAX_MESSAGE_NAME} characters)</span>
              <Input
                value={custom}
                maxLength={MAX_MESSAGE_NAME}
                placeholder="For example: Grace Temple"
                aria-label="Your own name line"
                disabled={!canWrite}
                className="mt-1.5"
                onFocus={() => setChoice("custom")}
                onChange={(e) => { setCustom(e.target.value); setChoice("custom"); }}
              />
              {choice === "custom" && name && <span className="mt-1 block text-xs text-ink-faint">{name.length} characters. Leaves {160 - name.length - 1} for your message.</span>}
            </span>
          </label>
        </div>

        {/* How a text will look */}
        <div>
          <div className="mb-1.5 text-xs font-medium text-ink-muted">How your text will look</div>
          <div className="rounded-2xl border border-line bg-surface-2 p-3">
            <div className="mb-2 text-xs text-ink-faint">From <b className="text-ink-muted">WorshipHQ</b></div>
            <div className="whitespace-pre-line rounded-2xl rounded-tl-md bg-surface px-3.5 py-2.5 text-sm shadow-sm ring-1 ring-line">
              <b>{name || "Your name here"}</b>{"\n"}{SAMPLE_MESSAGE}
            </div>
          </div>
          <p className={cn("mt-2 text-xs", credits > 1 ? "text-warning" : "text-ink-muted")}>
            This example is {used} characters, so it costs <b>{credits} {credits === 1 ? "credit" : "credits"}</b> for each person.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="button" onClick={save} disabled={!canWrite || saving || name.length < 2}>
          {saving ? <><Loader2 className="animate-spin" /> Saving…</> : <><Check /> Use this name</>}
        </Button>
        {!urgent && <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>}
        {!canWrite && <span className="text-xs text-ink-faint">Only people who can send texts can change this.</span>}
      </div>
    </Card>
  );
}
