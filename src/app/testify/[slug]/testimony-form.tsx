"use client";

import { useState, useTransition } from "react";
import { submitPublicTestimony } from "@/app/actions/public-submissions";

export function TestimonyForm({ churchSlug, accentColor }: { churchSlug: string; accentColor: string | null }) {
  const [pending, start] = useTransition();
  const [anonymous, setAnonymous] = useState(false);
  const [category, setCategory] = useState("praise");
  const accent = accentColor ?? "#0d7377";
  const field = "w-full rounded-xl border border-[#e5e0db] bg-white px-4 py-3 text-sm text-[#1c1a16] shadow-sm outline-none focus:ring-2";

  return (
    <form action={(fd) => { fd.set("churchSlug", churchSlug); if (anonymous) fd.set("anonymous", "on"); start(() => submitPublicTestimony(fd)); }} className="space-y-4">
      {!anonymous && (
        <div>
          <label className="mb-1 block text-sm font-medium text-[#1c1a16]">Your name</label>
          <input name="name" placeholder="Full name" className={field} style={{ "--tw-ring-color": accent } as React.CSSProperties} />
        </div>
      )}
      <div>
        <label className="mb-1 block text-sm font-medium text-[#1c1a16]">Title *</label>
        <input name="title" required placeholder="e.g. Healed after prayer" className={field} style={{ "--tw-ring-color": accent } as React.CSSProperties} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-[#1c1a16]">Category</label>
        <select name="category" value={category} onChange={(e) => setCategory(e.target.value)} className={field}>
          <option value="praise">Praise report</option>
          <option value="healing">Healing</option>
          <option value="provision">Provision</option>
          <option value="deliverance">Deliverance</option>
          <option value="salvation">Salvation</option>
          <option value="other">Other</option>
        </select>
      </div>
      {category === "other" && (
        <div>
          <label className="mb-1 block text-sm font-medium text-[#1c1a16]">Tell us the category</label>
          <input name="categoryOther" placeholder="e.g. Restored relationship" className={field} style={{ "--tw-ring-color": accent } as React.CSSProperties} />
        </div>
      )}
      <div>
        <label className="mb-1 block text-sm font-medium text-[#1c1a16]">Your testimony *</label>
        <textarea name="body" required rows={6} placeholder="Share the full story — take as much space as you need…" className={field} style={{ "--tw-ring-color": accent } as React.CSSProperties} />
      </div>
      <label className="flex items-center gap-2 text-sm text-[#6b6560]">
        <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="size-4 rounded border-[#e5e0db]" />
        Share anonymously
      </label>
      <button type="submit" disabled={pending} className="flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-md transition disabled:opacity-60" style={{ backgroundColor: accent }}>
        {pending && <span className="inline-block size-4 rounded-full border-2 border-white/30 border-t-white" style={{ animation: "spin 0.6s linear infinite" }} />}
        {pending ? "Submitting..." : "Share testimony"}
      </button>
      <p className="text-center text-xs text-[#a09890]">Powered by <span className="font-semibold">WorshipHQ</span></p>
    </form>
  );
}
