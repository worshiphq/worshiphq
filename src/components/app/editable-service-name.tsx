"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X, Loader2 } from "lucide-react";
import { useFeedback } from "@/components/ui/feedback";
import { renameService } from "@/app/actions/attendance";

/** Inline-editable service title. Click the pencil to rename a session — handy
 *  for turning "Wednesday Service" into "Convention Day 1" after check-in has
 *  already started. */
export function EditableServiceName({
  sessionId, name, canWrite,
}: {
  sessionId: string; name: string; canWrite: boolean;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [pending, start] = useTransition();

  function save() {
    const next = value.trim();
    if (!next) { toast("Name can't be empty", "error"); return; }
    if (next === name) { setEditing(false); return; }
    start(async () => {
      const res = await renameService(sessionId, next);
      if (res?.ok) { toast("Service renamed", "success"); setEditing(false); router.refresh(); }
      else { toast(res?.error ?? "Couldn't rename", "error"); }
    });
  }

  if (!canWrite) {
    return <h1 className="font-display text-2xl font-bold tracking-tight">{name}</h1>;
  }

  if (!editing) {
    return (
      <div className="group flex items-center gap-2">
        <h1 className="font-display text-2xl font-bold tracking-tight">{name}</h1>
        <button
          onClick={() => { setValue(name); setEditing(true); }}
          title="Rename service"
          className="grid size-8 place-items-center rounded-lg text-ink-faint opacity-0 transition-opacity hover:bg-surface-2 hover:text-ink group-hover:opacity-100"
        >
          <Pencil className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
        placeholder="e.g. Convention Day 1"
        className="h-10 w-full max-w-sm rounded-xl border border-line bg-surface px-3 font-display text-xl font-bold focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      />
      <button onClick={save} disabled={pending} title="Save" className="grid size-9 place-items-center rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-60">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
      </button>
      <button onClick={() => setEditing(false)} disabled={pending} title="Cancel" className="grid size-9 place-items-center rounded-lg border border-line text-ink-muted hover:bg-surface-2">
        <X className="size-4" />
      </button>
    </div>
  );
}
