"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Settings2, Loader2 } from "lucide-react";
import { updateFeaturedLeaderCount } from "@/app/actions/leaders";

export function FeaturedLeaderCountSetting({ current }: { current: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(current);
  const [saving, startSave] = useTransition();

  function save() {
    startSave(async () => {
      await updateFeaturedLeaderCount(count);
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-xs text-ink-faint hover:text-primary-bright transition-colors"
        title="Change number of featured leaders"
      >
        <Settings2 className="size-3" />
        {current} shown
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <label className="text-xs text-ink-faint">Show</label>
      <input
        type="number"
        min={1}
        max={50}
        value={count}
        onChange={(e) => setCount(Number(e.target.value) || 1)}
        className="h-7 w-14 rounded border border-line bg-surface px-2 text-center text-xs focus:border-primary/60 focus:outline-none"
      />
      <button
        onClick={save}
        disabled={saving}
        className="rounded bg-primary/10 px-2 py-1 text-xs font-medium text-primary-bright hover:bg-primary/20 disabled:opacity-50"
      >
        {saving ? <Loader2 className="size-3 animate-spin" /> : "Save"}
      </button>
      <button
        onClick={() => { setCount(current); setOpen(false); }}
        className="text-xs text-ink-faint hover:text-ink"
      >
        ✕
      </button>
    </div>
  );
}
