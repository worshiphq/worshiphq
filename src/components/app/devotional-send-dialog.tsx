"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Send, Wallet, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { previewDevotionalBlast, blastDevotional } from "@/app/actions/devotionals";
import { MultiPicker, type PickerOption } from "@/components/app/multi-picker";

export type AudienceOption = { value: string; label: string };

type Preview = {
  message: string;
  audienceLabel: string;
  recipients: number;
  segmentsEach: number;
  cost: number;
  balance: number;
  remaining: number;
  enough: boolean;
};

/** Text a devotional to the whole church (or a department / group) by SMS. */
export function DevotionalSendDialog({
  devotional, audiences, members = [], onClose,
}: {
  devotional: { id: string; title: string };
  audiences: AudienceOption[];
  /** Members with a phone number, for choosing specific people. */
  members?: PickerOption[];
  onClose: () => void;
}) {
  const [audience, setAudience] = useState("all");
  const [people, setPeople] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null); // null = use the generated text
  const [got, setGot] = useState<{ key: string; p: Preview } | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const generated = useRef<string | null>(null);

  // Re-price whenever the audience or the text changes (debounced for typing).
  const key = `${audience}|${audience === "people" ? people.join(",") : ""}|${message ?? ""}`;
  useEffect(() => {
    if (message !== null && message === generated.current && got?.key === key) return;
    let live = true;
    const t = setTimeout(async () => {
      const res = await previewDevotionalBlast(devotional.id, audience, message ?? undefined, people);
      if (!live) return;
      if (res.ok) {
        if (message === null) {
          generated.current = res.message;
          setMessage(res.message);
          setGot({ key: `${audience}|${audience === "people" ? people.join(",") : ""}|${res.message}`, p: res });
        } else setGot({ key, p: res });
      } else setResult({ ok: false, text: res.error });
    }, message === null ? 0 : 350);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devotional.id, audience, message, people]);

  const preview = got?.p ?? null;
  const loading = got?.key !== key;

  async function send() {
    setSending(true);
    const res = await blastDevotional(devotional.id, audience, message ?? undefined, people);
    setSending(false);
    setResult(res.ok
      ? { ok: true, text: `Sent to ${res.sent} ${res.sent === 1 ? "person" : "people"} (${res.audienceLabel}).` }
      : { ok: false, text: res.error });
  }

  const close = () => { if (!sending) onClose(); };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={close}>
      <Card className="max-h-[90vh] w-full max-w-lg overflow-y-auto p-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-line p-5">
          <div className="min-w-0">
            <h3 className="font-display text-lg font-semibold">Text this devotional</h3>
            <p className="mt-0.5 truncate text-sm text-ink-muted">“{devotional.title}”</p>
          </div>
          <button onClick={close} disabled={sending} className="rounded-lg p-1 text-ink-faint hover:bg-surface-2 disabled:opacity-40" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {result ? (
            <div className={`flex items-start gap-2 rounded-xl border p-4 text-sm ${result.ok ? "border-success/30 bg-success/10 text-success" : "border-danger/30 bg-danger/10 text-danger"}`}>
              {result.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
              <span>{result.text}</span>
            </div>
          ) : (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink-muted">Send to</label>
                <select
                  value={audience}
                  onChange={(e) => { setAudience(e.target.value); setConfirming(false); }}
                  disabled={sending}
                  className="h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-sm text-ink focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  {audiences.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
                {audience === "people" && (
                  <div className="mt-2">
                    <MultiPicker
                      options={members}
                      defaultValue={people}
                      onChange={(v) => { setPeople(v); setConfirming(false); }}
                      placeholder="Search your members..."
                      emptyLabel="Pick who should receive it"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1.5 flex items-center justify-between text-sm font-medium text-ink-muted">
                  <span>The text message</span>
                  {preview && <span className="text-xs font-normal text-ink-faint">{(message ?? "").length} characters · {preview.segmentsEach} SMS each</span>}
                </label>
                <textarea
                  value={message ?? ""}
                  onChange={(e) => { setMessage(e.target.value); setConfirming(false); }}
                  rows={8}
                  disabled={sending || message === null}
                  maxLength={1200}
                  className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm leading-relaxed text-ink outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
                />
                <p className="mt-1 text-[11px] text-ink-faint">Long devotionals are shortened for SMS. Edit the text here to make it shorter or sweeter. Fewer segments cost fewer credits.</p>
              </div>

              {loading && !preview ? (
                <div className="flex items-center gap-2 py-3 text-sm text-ink-muted"><Loader2 className="size-4 animate-spin" /> Working out the cost…</div>
              ) : preview ? (
                preview.recipients === 0 ? (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Nobody in that group has a phone number on file.
                  </div>
                ) : (
                  <div className={`space-y-2 rounded-xl border border-line bg-surface-2/40 p-4 text-sm ${loading ? "opacity-60" : ""}`}>
                    <Row label="Recipients" value={`${preview.recipients} ${preview.recipients === 1 ? "person" : "people"} (${preview.audienceLabel})`} />
                    <Row label="Current balance" value={`${preview.balance.toLocaleString()} credits`} icon={<Wallet className="size-3.5" />} />
                    <Row label="This costs" value={`${preview.cost.toLocaleString()} credits`} strong />
                    <Row label="Balance after" value={`${preview.remaining.toLocaleString()} credits`} strong tone={preview.enough ? "ok" : "bad"} />
                    {!preview.enough && (
                      <p className="flex items-start gap-2 pt-1 text-danger"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> Not enough credits. Top up first, or pick a smaller group.</p>
                    )}
                  </div>
                )
              ) : null}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line p-4">
          {result?.ok ? (
            <Button variant="secondary" size="sm" onClick={onClose}>Done</Button>
          ) : (
            <>
              {confirming && preview ? (
                <>
                  <span className="mr-auto text-sm font-medium">Send to {preview.recipients} {preview.recipients === 1 ? "person" : "people"} for {preview.cost.toLocaleString()} credits?</span>
                  <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={sending}>Go back</Button>
                  <Button size="sm" onClick={send} disabled={sending}>
                    {sending ? <><Loader2 className="animate-spin" /> Sending to {preview.recipients}…</> : <><Send /> Yes, send it</>}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" size="sm" onClick={close} disabled={sending}>Cancel</Button>
                  <Button size="sm" onClick={() => setConfirming(true)} disabled={sending || loading || !preview || !preview.enough || preview.recipients === 0 || !(message ?? "").trim()}>
                    <Send /> Send now
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value, strong, tone, icon }: { label: string; value: string; strong?: boolean; tone?: "ok" | "bad"; icon?: React.ReactNode }) {
  const color = tone === "ok" ? "text-success" : tone === "bad" ? "text-danger" : "text-ink";
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-ink-muted">{icon}{label}</span>
      <span className={`text-right ${strong ? "font-semibold" : ""} ${color}`}>{value}</span>
    </div>
  );
}
