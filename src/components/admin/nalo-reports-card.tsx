"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Send } from "lucide-react";
import { setNaloReportMode, sendNaloReportTest } from "@/app/actions/admin-nalo";
import { useFeedback } from "@/components/ui/feedback";
import type { NaloHealth, NaloReportMode } from "@/lib/sms/nalo-reports";

const btn = "inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-white/10 disabled:opacity-50";
const TONE: Record<string, string> = { delivered: "text-emerald-400", failed: "text-rose-300", pending: "text-amber-300" };
const LABEL: Record<string, string> = { delivered: "Delivered", failed: "Not delivered", pending: "No final answer yet" };
const MODE: Record<NaloReportMode, string> = { off: "Off", get: "On, method 1", json: "On, method 2" };

/** Whether Nalo's texts really arrive: test for reports, switch them on, and see the last day. */
export function NaloReportsCard({ health, testPhone }: { health: NaloHealth; testPhone: string }) {
  const { toast } = useFeedback();
  const router = useRouter();
  const [busy, setBusy] = useState("");

  async function test(method: "get" | "json") {
    if (!testPhone || !confirm(`Send one test text through Nalo to ${testPhone}?`)) return;
    setBusy(method);
    const r = await sendNaloReportTest(method).catch(() => ({ ok: false as const, error: "Something went wrong." }));
    setBusy("");
    toast(r.ok ? "Nalo accepted it. Wait a minute, then press Refresh." : r.error, r.ok ? "success" : "error");
    router.refresh();
  }
  async function mode(m: NaloReportMode) {
    if (m !== "off" && !confirm("Ask for a delivery report on every Nalo text from now on? Do this only after a test report has arrived.")) return;
    setBusy("mode");
    const r = await setNaloReportMode(m).catch(() => ({ ok: false as const, error: "Something went wrong." }));
    setBusy("");
    toast(r.ok ? `Nalo reports: ${MODE[m]}.` : r.error, r.ok ? "success" : "error");
    router.refresh();
  }

  return (
    <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Nalo delivery reports</h2>
          <p className="text-xs text-slate-500">Without these, a Nalo text only shows that Nalo took it, not that it reached the phone.</p>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          {busy === "mode" && <Loader2 className="size-4 animate-spin" />} Reports
          <select value={health.mode} disabled={!!busy || !health.ready} onChange={(e) => mode(e.target.value as NaloReportMode)} className="rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-slate-100">
            {(Object.keys(MODE) as NaloReportMode[]).map((m) => <option key={m} value={m}>{MODE[m]}</option>)}
          </select>
        </label>
      </div>

      {!health.ready ? (
        <p className="mt-3 text-sm text-amber-300">The NaloReport table has not been created yet. Run sql/nalo-reports.sql.</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <span className="text-slate-400">Last 24 hours: <b className="text-slate-200">{health.asked}</b> texts</span>
            <span className="text-emerald-400">{health.delivered} delivered</span>
            <span className={health.failed ? "text-rose-300" : "text-slate-500"}>{health.failed} not delivered</span>
            <span className={health.silent ? "text-amber-300" : "text-slate-500"}>{health.silent} with no report after an hour</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={btn} disabled={!!busy || !testPhone} onClick={() => test("get")}>{busy === "get" ? <><Loader2 className="size-4 animate-spin" /> Sending…</> : <><Send className="size-4" /> Test method 1</>}</button>
            <button type="button" className={btn} disabled={!!busy || !testPhone} onClick={() => test("json")}>{busy === "json" ? <><Loader2 className="size-4 animate-spin" /> Sending…</> : <><Send className="size-4" /> Test method 2</>}</button>
            <button type="button" className={btn} onClick={() => router.refresh()}><RefreshCw className="size-4" /> Refresh</button>
          </div>
          <p className="mt-2 text-xs text-slate-500">{testPhone ? `Tests go to your alert number, ${testPhone}. Method 1 is the one Nalo documents.` : "Save your alert number in Outreach first."}</p>
          {health.recent.length > 0 && (
            <ul className="mt-3 divide-y divide-white/5 text-xs">
              {health.recent.map((r, i) => (
                <li key={i} className="py-2">
                  <span className="text-slate-400">{r.at.slice(0, 16).replace("T", " ")} · {r.to || "unknown number"} · </span>
                  <span className={TONE[r.state]}>{r.raw === null ? "No report yet" : LABEL[r.state] ?? r.state}</span>
                  {r.status && <span className="text-slate-500"> ({r.status})</span>}
                  {r.raw && <details className="mt-1 text-slate-500"><summary className="cursor-pointer">What Nalo sent</summary><code className="mt-1 block break-all rounded bg-black/30 p-2">{r.raw}</code></details>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
