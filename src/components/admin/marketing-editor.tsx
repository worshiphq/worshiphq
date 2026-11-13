"use client";

import { useState } from "react";
import { Plus, Trash2, Save } from "lucide-react";
import type { Testimonial } from "@/config/marketing";
import { STAT_KEYS, STAT_LABELS, niceFloor, shownValue, type StatSettings, type RealStats } from "@/lib/landing-stats-shared";
import { saveMarketing } from "@/app/actions/admin";
import { SubmitButton } from "@/components/ui/submit-button";

export function MarketingEditor({
  heroSubhead,
  testimonials,
  stats,
  real,
  contactPhone,
}: {
  heroSubhead: string;
  testimonials: Testimonial[];
  stats: StatSettings;
  real: RealStats;
  contactPhone: string;
}) {
  const [rows, setRows] = useState<Testimonial[]>(
    testimonials.length ? testimonials : [{ quote: "", name: "", role: "", church: "" }],
  );

  const field =
    "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-400/60 focus:outline-none";

  return (
    <form action={saveMarketing} className="space-y-8">
      {/* Hero */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">Hero subheading</h2>
        <textarea
          name="heroSubhead"
          defaultValue={heroSubhead}
          rows={2}
          className={field}
          placeholder="One calm headquarters for everything your church runs."
        />
      </section>

      {/* Contact page number */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-sm font-semibold text-slate-200">Phone on the Contact page</h2>
        <p className="mb-3 mt-1 text-xs text-slate-500">Shown on worshiphq.app/contact as a WhatsApp and call link. Clear the box and save to hide it.</p>
        <input name="contactPhone" defaultValue={contactPhone} inputMode="tel" placeholder="No number shown" className={`${field} max-w-xs`} />
      </section>

      {/* Numbers */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-sm font-semibold text-slate-200">Numbers on the homepage</h2>
        <p className="mb-4 mt-1 text-xs text-slate-500">Empty box = live data: the real figure, rounded down with a plus. Type a number to show your own: it then keeps growing as real ones come in (type 300 with 271 real, 5 more join, it shows 305). Clear the box to go back to live data. Untick to hide it.</p>
        <div className="divide-y divide-white/5 rounded-xl border border-white/10">
          {STAT_KEYS.map((k) => (
            <div key={k} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <label className="flex w-56 items-center gap-2 text-sm text-slate-200">
                <input type="checkbox" name={`stat_${k}_show`} defaultChecked={stats[k].show} className="size-4 accent-teal-500" />
                {STAT_LABELS[k]}
              </label>
              <span className="w-52 text-xs text-slate-500">Real: {real[k].toLocaleString()} · showing {(stats[k].override == null ? niceFloor(real[k]) : shownValue(k, real, stats[k])).toLocaleString()}+{stats[k].override == null ? " (live)" : " (yours, growing)"}</span>
              <input name={`stat_${k}`} inputMode="numeric" defaultValue={stats[k].override == null ? "" : shownValue(k, real, stats[k])} placeholder="Live data" className={`${field} w-36`} />
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">Testimonials</h2>
            <p className="mt-1 text-xs text-slate-500">Real quotes from real people who agreed to be named. The section is hidden while this list is empty.</p>
          </div>
          <button
            type="button"
            onClick={() => setRows((r) => [...r, { quote: "", name: "", role: "", church: "" }])}
            className="flex items-center gap-1.5 rounded-lg bg-teal-500/15 px-3 py-1.5 text-xs font-medium text-teal-300 hover:bg-teal-500/25"
          >
            <Plus className="size-3.5" /> Add
          </button>
        </div>

        <div className="space-y-4">
          {rows.map((t, i) => (
            <div key={i} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">#{i + 1}</span>
                {(

                  <button
                    type="button"
                    onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))}
                    className="text-slate-500 hover:text-red-300"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
              <textarea
                name="t_quote"
                defaultValue={t.quote}
                rows={2}
                placeholder="Quote…"
                className={`${field} mb-2`}
              />
              <div className="grid gap-2 sm:grid-cols-3">
                <input name="t_name" defaultValue={t.name} placeholder="Name" className={field} />
                <input name="t_role" defaultValue={t.role} placeholder="Role" className={field} />
                <input name="t_church" defaultValue={t.church} placeholder="Church · Country" className={field} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <SubmitButton
        pendingLabel="Saving…"
        successMessage="Content saved - live now"
        className="rounded-xl bg-teal-500 px-5 py-2.5 text-sm font-semibold text-white shadow-none hover:bg-teal-400"
      >
        <Save className="size-4" /> Save changes
      </SubmitButton>
    </form>
  );
}
