"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Save, Headphones, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useFeedback } from "@/components/ui/feedback";
import { LongText } from "@/components/app/long-text";
import { ScriptureInput } from "@/components/app/scripture-input";
import { saveSermon } from "@/app/actions/sermons";

export type SermonDraft = {
  id?: string;
  title: string;
  preacher: string;
  series: string;
  scripture: string;
  date: string;
  audioUrl: string;
  videoUrl: string;
  notes: string;
  published: boolean;
};

const Label = ({ children, hint }: { children: React.ReactNode; hint?: string }) => (
  <div className="mb-1.5">
    <span className="text-sm font-medium text-ink-muted">{children}</span>
    {hint && <span className="ml-2 text-[11px] text-ink-faint">{hint}</span>}
  </div>
);

/** Full-page sermon writer: roomy notes, several scriptures, editable any time. */
export function SermonEditor({ initial, canWrite, seriesSuggestions, preacherSuggestions }: {
  initial: SermonDraft; canWrite: boolean; seriesSuggestions: string[]; preacherSuggestions: string[];
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [d, setD] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(d) !== JSON.stringify(saved);
  const set = <K extends keyof SermonDraft>(k: K, v: SermonDraft[K]) => setD((x) => ({ ...x, [k]: v }));

  // A long sermon should survive an accidental tab close.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const save = () => {
    if (!canWrite) return;
    setError("");
    start(async () => {
      const res = await saveSermon(d);
      if (!res.ok) return setError(res.error);
      toast(d.id ? "Sermon saved" : "Sermon added", "success");
      const done = { ...d, id: res.id };
      setD(done);
      setSaved(done);
      if (!d.id) router.replace(`/app/sermons/${res.id}`);
      else router.refresh();
    });
  };

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link href="/app/sermons" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink">
          <ArrowLeft className="size-4" /> All sermons
        </Link>
        <span className="text-xs text-ink-faint">{!canWrite ? "View only" : dirty ? "Unsaved changes" : d.id ? "All changes saved" : "New sermon"}</span>
      </div>

      <div className="space-y-5">
        <input
          value={d.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="Sermon title"
          disabled={!canWrite}
          className="w-full bg-transparent font-display text-3xl font-bold tracking-tight text-ink outline-none placeholder:text-ink-faint/60"
        />

        <Card className="grid gap-4 p-5 sm:grid-cols-2">
          <div>
            <Label>Preacher</Label>
            <Input value={d.preacher} onChange={(e) => set("preacher", e.target.value)} list="preacher-list" placeholder="Pastor name" disabled={!canWrite} />
            <datalist id="preacher-list">{preacherSuggestions.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
          <div>
            <Label>Date preached</Label>
            <Input type="date" value={d.date} onChange={(e) => set("date", e.target.value)} disabled={!canWrite} />
          </div>
          <div>
            <Label hint="Optional">Series</Label>
            <Input value={d.series} onChange={(e) => set("series", e.target.value)} list="series-list" placeholder="e.g. Faith that moves" disabled={!canWrite} />
            <datalist id="series-list">{seriesSuggestions.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
          <div>
            <Label hint="Add as many as you like">Scripture(s)</Label>
            <ScriptureInput value={d.scripture} onChange={(v) => set("scripture", v)} />
          </div>
        </Card>

        <div>
          <Label hint="Outline, manuscript, points, prayer points, anything you want to keep">Sermon notes</Label>
          <LongText
            value={d.notes}
            onChange={(v) => set("notes", v)}
            minRows={22}
            label="Sermon notes"
            placeholder={"Write or paste your sermon here.\n\nIntroduction\n\nPoint 1\n\nPoint 2\n\nConclusion and call to action"}
          />
        </div>

        <Card className="grid gap-4 p-5 sm:grid-cols-2">
          <div>
            <Label><span className="inline-flex items-center gap-1.5"><Headphones className="size-3.5" /> Audio link</span></Label>
            <Input value={d.audioUrl} onChange={(e) => set("audioUrl", e.target.value)} placeholder="https://..." disabled={!canWrite} />
          </div>
          <div>
            <Label><span className="inline-flex items-center gap-1.5"><Video className="size-3.5" /> Video link</span></Label>
            <Input value={d.videoUrl} onChange={(e) => set("videoUrl", e.target.value)} placeholder="https://youtube.com/..." disabled={!canWrite} />
          </div>
        </Card>
      </div>

      {error && <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>}

      <div className="sticky bottom-0 -mx-1 mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-base/95 px-1 py-3 backdrop-blur">
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input type="checkbox" checked={d.published} onChange={(e) => set("published", e.target.checked)} disabled={!canWrite} className="size-4 rounded border-line accent-primary" />
          Published (untick to keep it as a draft)
        </label>
        <div className="flex gap-2">
          <Link href="/app/sermons"><Button variant="secondary" disabled={pending}>{dirty ? "Discard" : "Close"}</Button></Link>
          <Button onClick={save} disabled={!canWrite || pending || !d.title.trim() || (!dirty && !!d.id)}>
            {pending ? <><Loader2 className="animate-spin" /> Saving sermon…</> : <><Save /> {d.id ? "Save changes" : "Save sermon"}</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
