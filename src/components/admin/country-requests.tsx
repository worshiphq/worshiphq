"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Globe2, Loader2 } from "lucide-react";
import { approveCountryChange, rejectCountryChange } from "@/app/actions/admin";
import { useFeedback } from "@/components/ui/feedback";
import { noticeMessage } from "@/components/admin/church-table";

export type CountryRequestRow = { id: string; name: string; city: string | null; country: string; requested: string; at: string };

/** Churches waiting for a country change. Nothing changes for them until it is approved here. */
export function CountryRequests({ rows }: { rows: CountryRequestRow[] }) {
  const { run, toast } = useFeedback();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  if (rows.length === 0) return null;

  const act = (r: CountryRequestRow, approve: boolean) => {
    if (!confirm(approve ? `Change ${r.name} from ${r.country} to ${r.requested}? Their plan price and SMS follow the new country.` : `Reject ${r.name}'s request to move to ${r.requested}?`)) return;
    setBusy(`${r.id}:${approve}`);
    run(async () => {
      try {
        const n = approve ? await approveCountryChange(r.id) : await rejectCountryChange(r.id);
        const m = noticeMessage(approve ? `${r.name} is now in ${r.requested}` : "Request rejected", n);
        toast(m.text, m.type);
        router.refresh();
      } finally {
        setBusy(null);
      }
    }, { pending: approve ? "Changing the country and texting the church..." : "Rejecting and texting the church..." });
  };

  return (
    <div className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-500/[0.06] p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-200">
        <Globe2 className="size-4" /> Country change requests ({rows.length})
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/[0.04] px-4 py-3">
            <div className="min-w-0">
              <div className="truncate font-medium text-slate-100">{r.name}</div>
              <div className="text-xs text-slate-400">
                {r.city ? `${r.city} · ` : ""}{r.country} <span className="text-slate-500">to</span> <span className="font-semibold text-amber-200">{r.requested}</span>
                <span className="text-slate-500"> · asked {new Date(r.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button type="button" disabled={!!busy} onClick={() => act(r, true)} className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-60">
                {busy === `${r.id}:true` && <Loader2 className="size-3.5 animate-spin" />}
                {busy === `${r.id}:true` ? "Approving..." : "Approve"}
              </button>
              <button type="button" disabled={!!busy} onClick={() => act(r, false)} className="inline-flex items-center gap-1.5 rounded-md bg-red-500/15 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/25 disabled:opacity-60">
                {busy === `${r.id}:false` && <Loader2 className="size-3.5 animate-spin" />}
                {busy === `${r.id}:false` ? "Rejecting..." : "Reject"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
