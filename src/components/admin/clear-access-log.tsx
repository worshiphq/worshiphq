"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { clearAccessLog } from "@/app/actions/admin";

/** Owner only. Removes finished entries for good; anyone inside a church right now is left alone. */
export function ClearAccessLog() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  const clear = () => {
    if (!confirm("Permanently delete all finished entries from the access log? This cannot be undone. Entries for anyone currently inside a church are kept.")) return;
    setNote(null);
    start(async () => {
      const r = await clearAccessLog();
      setNote(r.ok ? `Cleared ${r.count} ${r.count === 1 ? "entry" : "entries"}.` : r.error);
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-2">
      {note && <span className="text-xs text-slate-400">{note}</span>}
      <button type="button" onClick={clear} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-500/25 disabled:opacity-50">
        {pending ? <><Loader2 className="size-3.5 animate-spin" /> Clearing...</> : <><Trash2 className="size-3.5" /> Clear access log</>}
      </button>
    </div>
  );
}
