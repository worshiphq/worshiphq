"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useFeedback } from "@/components/ui/feedback";
import { LongText } from "@/components/app/long-text";
import { ScriptureInput } from "@/components/app/scripture-input";
import { DevotionalSendDialog, type AudienceOption } from "@/components/app/devotional-send-dialog";
import type { PickerOption } from "@/components/app/multi-picker";
import { saveDevotional } from "@/app/actions/devotionals";

export type DevotionalDraft = {
  id?: string;
  title: string;
  scripture: string;
  author: string;
  date: string;
  body: string;
  published: boolean;
};

const Label = ({ children, hint }: { children: React.ReactNode; hint?: string }) => (
  <div className="mb-1.5">
    <span className="text-sm font-medium text-ink-muted">{children}</span>
    {hint && <span className="ml-2 text-[11px] text-ink-faint">{hint}</span>}
  </div>
);

/** Full-page devotional writer, with a one-click way to text it to the church. */
export function DevotionalEditor({ initial, canWrite, audiences, members, authorSuggestions }: {
  initial: DevotionalDraft; canWrite: boolean; audiences: AudienceOption[]; members: PickerOption[]; authorSuggestions: string[];
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [d, setD] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState("");
  const [sendFor, setSendFor] = useState<{ id: string; title: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(d) !== JSON.stringify(saved);
  const set = <K extends keyof DevotionalDraft>(k: K, v: DevotionalDraft[K]) => setD((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const save = (thenSend: boolean) => {
    if (!canWrite) return;
    setError("");
    start(async () => {
      const res = await saveDevotional(d);
      if (!res.ok) return setError(res.error);
      toast(d.id ? "Devotional saved" : "Devotional added", "success");
      const done = { ...d, id: res.id };
      setD(done);
      setSaved(done);
      if (thenSend) setSendFor({ id: res.id, title: d.title });
      if (!d.id) router.replace(`/app/devotionals/${res.id}`);
      else router.refresh();
    });
  };

  const ready = !!d.title.trim() && !!d.body.trim();

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link href="/app/devotionals" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink">
          <ArrowLeft className="size-4" /> All devotionals
        </Link>
        <span className="text-xs text-ink-faint">{!canWrite ? "View only" : dirty ? "Unsaved changes" : d.id ? "All changes saved" : "New devotional"}</span>
      </div>

      <div className="space-y-5">
        <input
          value={d.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="Devotional title"
          disabled={!canWrite}
          className="w-full bg-transparent font-display text-3xl font-bold tracking-tight text-ink outline-none placeholder:text-ink-faint/60"
        />

        <Card className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label hint="Add as many as you like">Scripture(s)</Label>
            <ScriptureInput value={d.scripture} onChange={(v) => set("scripture", v)} placeholder="e.g. Psalm 23:1-6, then press Enter" />
          </div>
          <div>
            <Label>Author</Label>
            <Input value={d.author} onChange={(e) => set("author", e.target.value)} list="author-list" placeholder="Writer's name" disabled={!canWrite} />
            <datalist id="author-list">{authorSuggestions.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" value={d.date} onChange={(e) => set("date", e.target.value)} disabled={!canWrite} />
          </div>
        </Card>

        <div>
          <Label>Devotional</Label>
          <LongText value={d.body} onChange={(v) => set("body", v)} minRows={16} label="Devotional body" placeholder="Write today's devotional here..." />
        </div>
      </div>

      {error && <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>}

      <div className="sticky bottom-0 -mx-1 mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-base/95 px-1 py-3 backdrop-blur">
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input type="checkbox" checked={d.published} onChange={(e) => set("published", e.target.checked)} disabled={!canWrite} className="size-4 rounded border-line accent-primary" />
          Published (untick to keep it as a draft)
        </label>
        <div className="flex flex-wrap gap-2">
          <Link href="/app/devotionals"><Button variant="secondary" disabled={pending}>{dirty ? "Discard" : "Close"}</Button></Link>
          {d.id && !dirty && canWrite && (
            <Button variant="secondary" onClick={() => setSendFor({ id: d.id!, title: d.title })} disabled={pending}>
              <Send /> Text to members
            </Button>
          )}
          <Button onClick={() => save(false)} disabled={!canWrite || pending || !ready || (!dirty && !!d.id)}>
            {pending ? <><Loader2 className="animate-spin" /> Saving devotional…</> : <><Save /> {d.id ? "Save changes" : "Save devotional"}</>}
          </Button>
          {canWrite && dirty && ready && !pending && (
            <Button variant="secondary" onClick={() => save(true)}>
              <Send /> Save and text members
            </Button>
          )}
        </div>
      </div>

      {sendFor && <DevotionalSendDialog devotional={sendFor} audiences={audiences} members={members} onClose={() => setSendFor(null)} />}
    </div>
  );
}
