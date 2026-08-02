"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Check, Loader2, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { MESSAGE_TEMPLATES } from "@/lib/messages/registry";
import { saveSystemTemplates } from "@/app/actions/message-templates";

/** Edit the app's automatic SMS templates. `saved` is Church.messageTemplates. */
export function SystemMessagesDialog({ saved, onClose }: { saved: Record<string, string>; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const t of MESSAGE_TEMPLATES) v[t.key] = saved[t.key] ?? t.default;
    return v;
  });

  const seg = (t: string) => Math.max(1, Math.ceil(t.length / 160));

  const save = () => {
    // Only persist values that differ from the default (so defaults can evolve).
    const out: Record<string, string> = {};
    for (const t of MESSAGE_TEMPLATES) {
      const val = (values[t.key] ?? "").trim();
      if (val && val !== t.default) out[t.key] = val;
    }
    const fd = new FormData();
    fd.set("templates", JSON.stringify(out));
    start(async () => {
      const res = await saveSystemTemplates(fd);
      if (res?.ok) { toast("Messages saved", "success"); router.refresh(); onClose(); }
      else toast(res?.error ?? "Failed", "error");
    });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <Card className="max-h-[88vh] w-full max-w-lg overflow-y-auto p-0" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between border-b border-line bg-surface p-5">
          <div>
            <h3 className="font-display text-lg font-semibold">Automatic messages</h3>
            <p className="text-sm text-ink-muted">Edit the texts the app sends for you.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-faint hover:bg-surface-2"><X className="size-4" /></button>
        </div>

        <div className="space-y-5 p-5">
          {MESSAGE_TEMPLATES.map((t) => (
            <div key={t.key}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{t.label}</span>
                <span className="text-xs text-ink-faint">{(values[t.key] ?? "").length} chars · {seg(values[t.key] ?? "")} SMS</span>
              </div>
              <p className="mb-1.5 text-xs text-ink-muted">{t.description}</p>
              <textarea
                value={values[t.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [t.key]: e.target.value }))}
                rows={3}
                className="w-full rounded-lg border border-line bg-surface p-2.5 text-sm outline-none focus:border-primary/50"
              />
              <div className="mt-1 flex items-center justify-between">
                <div className="flex flex-wrap gap-1">
                  {t.placeholders.map((p) => (
                    <button key={p} type="button"
                      onClick={() => setValues((v) => ({ ...v, [t.key]: `${v[t.key] ?? ""}{${p}}` }))}
                      className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-muted hover:bg-primary/10 hover:text-primary">
                      {"{"}{p}{"}"}
                    </button>
                  ))}
                </div>
                {(values[t.key] ?? "") !== t.default && (
                  <button type="button" onClick={() => setValues((v) => ({ ...v, [t.key]: t.default }))}
                    className="flex items-center gap-1 text-[11px] text-ink-faint hover:text-ink">
                    <RotateCcw className="size-3" /> Reset to default
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-line bg-surface p-4">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Save messages
          </Button>
        </div>
      </Card>
    </div>
  );
}
