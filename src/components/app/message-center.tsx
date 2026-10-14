"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Loader2, MessageSquareText, RotateCcw, Search, ShieldAlert, UserRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { CATALOG, GROUPS, SAMPLE, type CatalogItem, type GroupId } from "@/lib/messages/catalog";
import { renderTemplate } from "@/lib/messages/registry";
import { saveMessageTemplate } from "@/app/actions/message-templates";
import { cn } from "@/lib/utils";

/** SMS segments: 160 characters each, or 70 once an emoji or special character is in the text. */
function segments(text: string) {
  const unicode = /[^\u0000-\u007F]/.test(text);
  const per = unicode ? 70 : 160;
  return Math.max(1, Math.ceil(text.length / per));
}

/**
 * Every text WorshipHQ sends for the church in one tidy editor: a searchable list
 * grouped by topic on the left, and on the right the message with its fields, a
 * live preview as it will look on a phone, and save or reset.
 */
export function MessageCenter({
  values, automations, canWrite, focus, className,
}: {
  values: Record<string, string>;
  automations: string[];
  canWrite: boolean;
  /** A message key (or group id) to open first. */
  focus?: string;
  className?: string;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [saved, setSaved] = useState<Record<string, string>>(values);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const startKey = CATALOG.find((c) => c.key === focus)?.key ?? CATALOG.find((c) => c.group === focus)?.key ?? CATALOG[0].key;
  const [selected, setSelected] = useState(startKey);
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const g = CATALOG.find((c) => c.key === startKey)?.group;
    return Object.fromEntries(GROUPS.map((x) => [x.id, x.id === g || !!focus === false && x.id === "members"]));
  });
  const [pending, start] = useTransition();
  const area = useRef<HTMLTextAreaElement>(null);

  const item = CATALOG.find((c) => c.key === selected)!;
  const current = drafts[item.key] ?? saved[item.key] ?? item.default;
  const dirty = (k: string) => k in drafts && drafts[k] !== (saved[k] ?? CATALOG.find((c) => c.key === k)!.default);
  const isCustom = (k: string) => !!saved[k];

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () => CATALOG.filter((c) => !q || `${c.label} ${c.description}`.toLowerCase().includes(q)),
    [q],
  );
  const needsAutomation = item.store === "automation" && !automations.includes(item.field!);

  function insert(tag: string) {
    const el = area.current;
    const text = `{${tag}}`;
    if (!el) return setDrafts((d) => ({ ...d, [item.key]: current + text }));
    const a = el.selectionStart ?? current.length, b = el.selectionEnd ?? current.length;
    const next = current.slice(0, a) + text + current.slice(b);
    setDrafts((d) => ({ ...d, [item.key]: next }));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + text.length, a + text.length); });
  }

  function save(text: string | null) {
    start(async () => {
      const res = await saveMessageTemplate(item.key, text);
      if (!res.ok) return toast(res.error, "error");
      setSaved((s) => {
        const n = { ...s };
        if (res.reset) delete n[item.key]; else n[item.key] = (text ?? "").trim();
        return n;
      });
      setDrafts((d) => { const n = { ...d }; delete n[item.key]; return n; });
      toast(res.reset ? "Back to the standard message" : "Message saved", "success");
      router.refresh();
    });
  }

  const preview = renderTemplate(current, SAMPLE);
  const groupItems = (g: GroupId) => visible.filter((c) => c.group === g);

  return (
    <div className={cn("grid gap-4 lg:grid-cols-[19rem_1fr]", className)}>
      {/* ── List ── */}
      <Card className="h-fit overflow-hidden p-0 lg:sticky lg:top-4">
        <div className="border-b border-line p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search messages…"
              className="h-10 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-sm outline-none focus:border-primary/50"
            />
          </div>
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          {GROUPS.map((g) => {
            const list = groupItems(g.id);
            if (list.length === 0) return null;
            const expanded = q ? true : open[g.id];
            return (
              <div key={g.id} className="border-b border-line-soft last:border-0">
                <button
                  type="button"
                  onClick={() => setOpen((o) => ({ ...o, [g.id]: !o[g.id] }))}
                  className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-surface-2"
                >
                  <span>
                    <span className="block text-sm font-semibold">{g.label}</span>
                    <span className="block text-[11px] text-ink-faint">{g.hint}</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-ink-faint">
                    {list.length}
                    <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />
                  </span>
                </button>
                {expanded && (
                  <ul className="pb-1.5">
                    {list.map((c) => (
                      <li key={c.key}>
                        <button
                          type="button"
                          onClick={() => setSelected(c.key)}
                          className={cn(
                            "flex w-full items-center gap-2 px-4 py-2 text-left text-sm",
                            selected === c.key ? "bg-primary/10 font-medium text-primary" : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate">{c.label}</span>
                          {dirty(c.key) ? (
                            <span className="size-2 shrink-0 rounded-full bg-warning" title="Unsaved changes" />
                          ) : isCustom(c.key) ? (
                            <span className="size-2 shrink-0 rounded-full bg-primary" title="Your own wording" />
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
          {visible.length === 0 && <p className="p-4 text-sm text-ink-faint">No message matches that search.</p>}
        </div>
        <div className="flex items-center gap-3 border-t border-line px-4 py-2.5 text-[11px] text-ink-faint">
          <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-primary" /> Your wording</span>
          <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-warning" /> Unsaved</span>
        </div>
      </Card>

      {/* ── Editor ── */}
      <Card className="p-0">
        <div className="border-b border-line p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-lg font-semibold">{item.label}</h3>
            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", item.toAdmins ? "bg-gold/15 text-gold" : "bg-primary/10 text-primary")}>
              {item.toAdmins ? <><ShieldAlert className="size-3" /> Goes to your team</> : <><UserRound className="size-3" /> Goes to the person</>}
            </span>
            {isCustom(item.key) && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-ink-muted">Your wording</span>}
          </div>
          <p className="mt-1 text-sm text-ink-muted">{item.description}</p>
        </div>

        <div className="grid gap-5 p-5 xl:grid-cols-[1fr_16rem]">
          <div>
            {needsAutomation && (
              <div className="mb-3 rounded-xl border border-gold/30 bg-gold-soft px-3 py-2.5 text-sm text-gold">
                You can write this message now. It is only sent once you switch the reminder on.{" "}
                <Link href="/app/reminders" className="font-semibold underline">Switch it on under Reminders</Link>
              </div>
            )}
            <div className="mb-1.5 flex items-center justify-between text-xs text-ink-faint">
              <span className="font-medium text-ink-muted">Message</span>
              <span>{current.length} characters · {segments(current)} SMS</span>
            </div>
            <textarea
              ref={area}
              value={current}
              disabled={!canWrite}
              onChange={(e) => setDrafts((d) => ({ ...d, [item.key]: e.target.value }))}
              rows={8}
              maxLength={1000}
              className="w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-[0.95rem] leading-relaxed text-ink outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
            />
            <div className="mt-2.5">
              <div className="mb-1.5 text-xs font-medium text-ink-muted">Tap to put a name, date or amount in</div>
              <div className="flex flex-wrap gap-1.5">
                {item.placeholders.map((p) => (
                  <button
                    key={p}
                    type="button"
                    disabled={!canWrite}
                    onClick={() => insert(p)}
                    className="rounded-lg bg-surface-2 px-2 py-1 text-xs font-medium text-ink-muted hover:bg-primary/10 hover:text-primary disabled:opacity-50"
                  >
                    {"{"}{p}{"}"}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button onClick={() => save(current)} disabled={!canWrite || pending || !dirty(item.key)}>
                {pending ? <><Loader2 className="animate-spin" /> Saving…</> : <><Check /> Save message</>}
              </Button>
              {(isCustom(item.key) || dirty(item.key)) && (
                <Button variant="secondary" disabled={!canWrite || pending} onClick={() => (isCustom(item.key) ? save(null) : setDrafts((d) => { const n = { ...d }; delete n[item.key]; return n; }))}>
                  <RotateCcw /> {isCustom(item.key) ? "Back to the standard message" : "Undo changes"}
                </Button>
              )}
            </div>
          </div>

          {/* Preview */}
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-muted"><MessageSquareText className="size-3.5" /> How it looks</div>
            <div className="rounded-[1.6rem] border border-line bg-surface-2 p-3">
              <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-line" />
              <div className="rounded-2xl rounded-tl-md bg-surface px-3.5 py-2.5 text-sm leading-relaxed shadow-sm whitespace-pre-line">
                {preview || <span className="text-ink-faint">Nothing yet</span>}
              </div>
              <p className="mt-2 text-center text-[10px] text-ink-faint">Example names and amounts</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
