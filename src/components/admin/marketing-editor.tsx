"use client";

import { useState } from "react";
import { Plus, Trash2, Save } from "lucide-react";
import type { Testimonial } from "@/config/marketing";
import { saveMarketing } from "@/app/actions/admin";
import { SubmitButton } from "@/components/ui/submit-button";

export function MarketingEditor({
  heroSubhead,
  testimonials,
}: {
  heroSubhead: string;
  testimonials: Testimonial[];
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

      {/* Testimonials */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">Testimonials</h2>
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
                {rows.length > 1 && (
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
        successMessage="Content saved — live now"
        className="rounded-xl bg-teal-500 px-5 py-2.5 text-sm font-semibold text-white shadow-none hover:bg-teal-400"
      >
        <Save className="size-4" /> Save changes
      </SubmitButton>
    </form>
  );
}
