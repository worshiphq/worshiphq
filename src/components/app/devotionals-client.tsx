"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search, BookHeart, Trash2, Calendar, User, BookOpen, Eye, EyeOff,
  Send, Wallet, Loader2, AlertTriangle, CheckCircle2, X,
} from "lucide-react";
import {
  deleteDevotional, toggleDevotionalPublished,
  previewDevotionalBlast, blastDevotional,
} from "@/app/actions/devotionals";

type BlastPreview = {
  recipients: number;
  segmentsEach: number;
  cost: number;
  balance: number;
  remaining: number;
  enough: boolean;
};

type DevotionalRow = {
  id: string;
  title: string;
  scripture: string | null;
  body: string;
  author: string | null;
  published: boolean;
  date: string;
};

export function DevotionalsClient({ devotionals }: { devotionals: DevotionalRow[] }) {
  const [search, setSearch] = useState("");
  const [pending, start] = useTransition();

  // SMS-blast confirm flow
  const [blastFor, setBlastFor] = useState<DevotionalRow | null>(null);
  const [preview, setPreview] = useState<BlastPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const openBlast = async (d: DevotionalRow) => {
    setBlastFor(d);
    setPreview(null);
    setResult(null);
    setLoadingPreview(true);
    const res = await previewDevotionalBlast(d.id);
    setLoadingPreview(false);
    if (res.ok) setPreview(res);
    else setResult({ ok: false, message: res.error });
  };

  const closeBlast = () => {
    if (sending) return;
    setBlastFor(null);
    setPreview(null);
    setResult(null);
  };

  const confirmBlast = async () => {
    if (!blastFor) return;
    setSending(true);
    const res = await blastDevotional(blastFor.id);
    setSending(false);
    if (res.ok) setResult({ ok: true, message: `Sent to ${res.sent} member${res.sent === 1 ? "" : "s"}.` });
    else setResult({ ok: false, message: res.error });
  };

  const filtered = devotionals.filter((d) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return d.title.toLowerCase().includes(q) || d.body.toLowerCase().includes(q) || d.scripture?.toLowerCase().includes(q);
  });

  const handleDelete = (id: string) => {
    const fd = new FormData();
    fd.set("id", id);
    start(() => deleteDevotional(fd));
  };

  const handleToggle = (id: string) => {
    const fd = new FormData();
    fd.set("id", id);
    start(() => toggleDevotionalPublished(fd));
  };

  return (
    <div className="mt-5 space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <Input
          placeholder="Search devotionals..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <BookHeart className="mx-auto size-10 text-ink-faint" />
          <p className="mt-3 text-sm text-ink-muted">
            {search ? "No devotionals match your search." : "No devotionals yet. Share daily encouragement with your congregation."}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((d) => (
            <Card key={d.id} className={`p-5 ${pending ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">{d.title}</h3>
                    {!d.published && <Badge variant="default" className="bg-amber-100 text-[10px] text-amber-700">Draft</Badge>}
                  </div>

                  <div className="mt-1.5 flex flex-wrap gap-x-4 text-xs text-ink-faint">
                    <span className="flex items-center gap-1">
                      <Calendar className="size-3" />
                      {new Date(d.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                    {d.scripture && (
                      <span className="flex items-center gap-1">
                        <BookOpen className="size-3" /> {d.scripture}
                      </span>
                    )}
                    {d.author && (
                      <span className="flex items-center gap-1">
                        <User className="size-3" /> {d.author}
                      </span>
                    )}
                  </div>

                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-muted">{d.body}</p>
                </div>

                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => openBlast(d)}
                    className="rounded-lg p-1.5 text-ink-faint hover:bg-brand/10 hover:text-brand"
                    title="Send to congregation by SMS"
                  >
                    <Send className="size-4" />
                  </button>
                  <button
                    onClick={() => handleToggle(d.id)}
                    className="rounded-lg p-1.5 text-ink-faint hover:bg-brand/10 hover:text-brand"
                    title={d.published ? "Unpublish" : "Publish"}
                  >
                    {d.published ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                  </button>
                  <button
                    onClick={() => handleDelete(d.id)}
                    className="rounded-lg p-1.5 text-ink-faint hover:bg-danger/10 hover:text-danger"
                    title="Delete"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {blastFor && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={closeBlast}>
          <Card className="w-full max-w-md p-0" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-line p-5">
              <div className="min-w-0">
                <h3 className="font-display text-lg font-semibold">Send to congregation</h3>
                <p className="mt-0.5 truncate text-sm text-ink-muted">“{blastFor.title}” by SMS</p>
              </div>
              <button onClick={closeBlast} disabled={sending} className="rounded-lg p-1 text-ink-faint hover:bg-surface-2 disabled:opacity-40">
                <X className="size-4" />
              </button>
            </div>

            <div className="p-5">
              {loadingPreview ? (
                <div className="flex items-center gap-2 py-6 text-sm text-ink-muted">
                  <Loader2 className="size-4 animate-spin" /> Working out the cost…
                </div>
              ) : result ? (
                <div className={`flex items-start gap-2 rounded-xl border p-4 text-sm ${result.ok ? "border-success/30 bg-success/10 text-success" : "border-danger/30 bg-danger/10 text-danger"}`}>
                  {result.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
                  <span>{result.message}</span>
                </div>
              ) : preview ? (
                <>
                  {preview.recipients === 0 ? (
                    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                      No active members have a phone number on file, so there’s no one to text.
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2.5 text-sm">
                        <Row label="Recipients" value={`${preview.recipients} member${preview.recipients === 1 ? "" : "s"}`} />
                        <Row label="Length" value={`${preview.segmentsEach} SMS segment${preview.segmentsEach === 1 ? "" : "s"} each`} />
                        <div className="my-1 border-t border-line-soft" />
                        <Row label="Current balance" value={`${preview.balance.toLocaleString()} credits`} icon={<Wallet className="size-3.5" />} />
                        <Row label="This blast costs" value={`− ${preview.cost.toLocaleString()} credits`} strong />
                        <div className="my-1 border-t border-line-soft" />
                        <Row
                          label="Balance after sending"
                          value={`${preview.remaining.toLocaleString()} credits`}
                          strong
                          tone={preview.enough ? "ok" : "bad"}
                        />
                      </div>

                      {!preview.enough && (
                        <div className="mt-4 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
                          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                          Not enough credits for this blast. Top up first.
                        </div>
                      )}
                    </>
                  )}
                </>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-line p-4">
              {result?.ok ? (
                <Button variant="secondary" size="sm" onClick={closeBlast}>Done</Button>
              ) : (
                <>
                  <Button variant="ghost" size="sm" onClick={closeBlast} disabled={sending}>Cancel</Button>
                  <Button
                    size="sm"
                    onClick={confirmBlast}
                    disabled={sending || loadingPreview || !preview || !preview.enough || preview.recipients === 0}
                  >
                    {sending ? <><Loader2 className="size-4 animate-spin" /> Sending…</> : <><Send className="size-4" /> Send now</>}
                  </Button>
                </>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, strong, tone, icon }: {
  label: string; value: string; strong?: boolean; tone?: "ok" | "bad"; icon?: React.ReactNode;
}) {
  const valueColor = tone === "ok" ? "text-success" : tone === "bad" ? "text-danger" : "text-ink";
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-ink-muted">{icon}{label}</span>
      <span className={`${strong ? "font-semibold" : ""} ${valueColor}`}>{value}</span>
    </div>
  );
}
