"use client";

import { useState, useTransition } from "react";
import { Gift, Loader2 } from "lucide-react";
import { savePromotions } from "@/app/actions/admin-promotions";
import type { Promotions, Window } from "@/lib/promotions";

const input =
  "h-10 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white focus-visible:border-teal-400/60 focus-visible:outline-none";

function status(w: Window): { text: string; tone: string } {
  if (!w.on) return { text: "Off", tone: "bg-white/10 text-white/60" };
  const today = new Date().toISOString().slice(0, 10);
  if (today < w.start) return { text: `Starts ${w.start}`, tone: "bg-amber-400/15 text-amber-300" };
  if (w.end && today > w.end) return { text: "Finished", tone: "bg-white/10 text-white/60" };
  return { text: "Running now", tone: "bg-teal-400/15 text-teal-300" };
}

function Dates({ w, set, endOptional }: { w: Window; set: (w: Window) => void; endOptional?: boolean }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex items-center gap-2 text-sm text-white">
        <input type="checkbox" checked={w.on} onChange={(e) => set({ ...w, on: e.target.checked })} className="size-4 accent-teal-400" /> Switched on
      </label>
      <label className="grid gap-1 text-xs text-white/60">From
        <input type="date" value={w.start} onChange={(e) => set({ ...w, start: e.target.value })} className={input} />
      </label>
      <label className="grid gap-1 text-xs text-white/60">Until (last day){endOptional && " · empty = no end"}
        <input type="date" value={w.end ?? ""} onChange={(e) => set({ ...w, end: e.target.value || null })} className={input} />
      </label>
    </div>
  );
}

function Card({ title, w, children }: { title: string; w: Window; children: React.ReactNode }) {
  const s = status(w);
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="flex-1 font-semibold text-white">{title}</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.tone}`}>{s.text}</span>
      </div>
      {children}
    </div>
  );
}

/** SuperAdmin › Pricing › Promotions. Each promotion runs by itself between its dates. */
export function PromotionsEditor({ initial }: { initial: Promotions }) {
  const [p, setP] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [testers, setTesters] = useState(initial.launch.testers.join("\n"));

  const save = () => start(async () => {
    const r = await savePromotions({ ...p, launch: { ...p.launch, testers: testers.split(/[\s,;]+/).filter(Boolean) } });
    setMsg(r.ok ? { ok: true, text: "Saved. Churches see it within a minute." } : { ok: false, text: r.error ?? "Couldn't save." });
  });

  return (
    <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <h2 className="flex items-center gap-2 font-semibold text-white"><Gift className="size-4" /> Promotions</h2>
      <p className="mt-1 text-sm text-white/50">
        Offers for every church that switch on and off by themselves on the dates you choose. No codes to hand out.
      </p>

      <div className="mt-4 grid gap-3">
        <div className={`rounded-xl border p-4 ${p.launch.on ? "border-teal-400/40 bg-teal-400/5" : "border-amber-400/40 bg-amber-400/5"}`}>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="flex-1 font-semibold text-white">WorshipHQ Live launch</h3>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${p.launch.on ? "bg-teal-400/15 text-teal-300" : "bg-amber-400/15 text-amber-300"}`}>{p.launch.on ? "Open to every church" : "Closed: testers only"}</span>
          </div>
          <p className="mb-3 text-sm text-white/50">
            While closed, nobody can sign in to WorshipHQ Live, create an account in it, buy it, download it or use its AI, backgrounds,
            Bibles and backup, except the tester emails below. Switch it on when you are ready to launch.
          </p>
          <p className="mb-3 text-sm text-white/50">
            Launching also puts the WorshipHQ Live page (/live), its prices on the pricing page and a menu link on the website.{" "}
            <a href="/admin/live-preview" target="_blank" className="font-semibold text-teal-300 underline">See the page first</a>.
          </p>
          <label className="mb-3 flex items-center gap-2 text-sm text-white">
            <input type="checkbox" checked={p.launch.on} onChange={(e) => setP({ ...p, launch: { ...p.launch, on: e.target.checked } })} className="size-4 accent-teal-400" />
            Launched: open to every church
          </label>
          <label className="grid gap-1 text-xs text-white/60">Testers (one email per line; they can use WorshipHQ Live before launch)
            <textarea value={testers} onChange={(e) => setTesters(e.target.value)} rows={3} placeholder="you@yourchurch.org"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus-visible:border-teal-400/60 focus-visible:outline-none" />
          </label>
        </div>

        <Card title="Plan step-up (everyone uses the next plan up)" w={p.stepUp}>
          <p className="mb-3 text-sm text-white/50">Free uses Starter, Starter uses Pro, Pro uses Max. Churches keep paying for their own plan; billing does not change. When it ends, everyone goes back to their own plan.</p>
          <Dates w={p.stepUp} set={(stepUp) => setP({ ...p, stepUp })} />
        </Card>

        <Card title="WorshipHQ Live free for a while" w={p.mediaFree}>
          <p className="mb-3 text-sm text-white/50">
            Churches use WorshipHQ Live free until the last day (it counts as their free trial). They still sign up in the app;
            nothing to pay until it ends.
          </p>
          <label className="mb-3 flex items-center gap-2 text-sm text-white">
            <input type="checkbox" checked={p.mediaFree.everyone} onChange={(e) => setP({ ...p, mediaFree: { ...p.mediaFree, everyone: e.target.checked } })} className="size-4 accent-teal-400" />
            Every church (untick: only churches paying for Starter, Pro or Max)
          </label>
          <Dates w={p.mediaFree} set={(w) => setP({ ...p, mediaFree: { ...p.mediaFree, ...w } })} />
        </Card>

        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <h3 className="mb-1 font-semibold text-white">WorshipHQ Live prices (cedis)</h3>
          <p className="mb-3 text-sm text-white/50">
            What a church pays for WorshipHQ Live, by its WorshipHQ plan. &ldquo;Free plan or none&rdquo; is also for churches that only use
            WorshipHQ Live. A running percentage discount below comes off these prices.
          </p>
          <table className="w-full max-w-xl text-sm">
            <thead className="text-left text-white/50"><tr><th className="py-1.5 pr-3">WorshipHQ plan</th><th className="py-1.5 pr-3">Per month (GHS)</th><th className="py-1.5">Per year (GHS)</th></tr></thead>
            <tbody>
              {(["free", "starter", "pro", "max"] as const).map((k) => (
                <tr key={k} className="border-t border-white/5">
                  <td className="py-1.5 pr-3 text-white">{k === "free" ? "Free plan or none" : k[0].toUpperCase() + k.slice(1)}</td>
                  {(["monthly", "yearly"] as const).map((iv) => (
                    <td key={iv} className="py-1.5 pr-3">
                      <input type="number" min={0} step="0.01" value={p.livePrices[k][iv]}
                        onChange={(e) => setP({ ...p, livePrices: { ...p.livePrices, [k]: { ...p.livePrices[k], [iv]: Number(e.target.value) } } })}
                        className={`${input} w-32`} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Card title="WorshipHQ Live discount by plan" w={p.mediaDiscount}>
          <p className="mb-3 text-sm text-white/50">Percent off the WorshipHQ Live price, by the plan the church pays for. Free churches pay the full price.</p>
          <div className="mb-3 flex flex-wrap gap-3">
            {(["starter", "pro", "max"] as const).map((k) => (
              <label key={k} className="grid gap-1 text-xs capitalize text-white/60">{k} (% off)
                <input type="number" min={0} max={100} value={p.mediaDiscount[k]}
                  onChange={(e) => setP({ ...p, mediaDiscount: { ...p.mediaDiscount, [k]: Number(e.target.value) } })} className={`${input} w-28`} />
              </label>
            ))}
          </div>
          <Dates w={p.mediaDiscount} set={(w) => setP({ ...p, mediaDiscount: { ...p.mediaDiscount, ...w } })} endOptional />
        </Card>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button onClick={save} disabled={pending} className="flex h-10 items-center gap-2 rounded-lg bg-teal-500 px-4 text-sm font-semibold text-white hover:bg-teal-400 disabled:opacity-60">
          {pending && <Loader2 className="size-4 animate-spin" />} Save promotions
        </button>
        {msg && <span className={`text-sm ${msg.ok ? "text-teal-300" : "text-red-300"}`}>{msg.text}</span>}
      </div>
    </section>
  );
}
