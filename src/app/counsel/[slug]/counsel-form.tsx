"use client";

import { useTransition } from "react";
import { submitCounselingRequest } from "@/app/actions/public-submissions";

export function CounselForm({ churchSlug, accentColor }: { churchSlug: string; accentColor: string | null }) {
  const [pending, start] = useTransition();
  const accent = accentColor ?? "#0d7377";
  const field = "w-full rounded-xl border border-[#e5e0db] bg-white px-4 py-3 text-sm text-[#1c1a16] shadow-sm outline-none focus:ring-2";

  return (
    <form action={(fd) => { fd.set("churchSlug", churchSlug); start(() => submitCounselingRequest(fd)); }} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-[#1c1a16]">Your name *</label>
        <input name="name" required placeholder="Full name" className={field} style={{ "--tw-ring-color": accent } as React.CSSProperties} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-[#1c1a16]">Phone (so we can reach you)</label>
        <input name="phone" type="tel" placeholder="024 000 0000" className={field} style={{ "--tw-ring-color": accent } as React.CSSProperties} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-[#1c1a16]">What is it about?</label>
        <select name="type" className={field}>
          <option value="general">General / not sure</option>
          <option value="marriage">Marriage / family</option>
          <option value="spiritual">Spiritual growth</option>
          <option value="grief">Grief / loss</option>
          <option value="financial">Financial</option>
          <option value="health">Health</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-[#1c1a16]">Briefly, how can we help? *</label>
        <textarea name="reason" required rows={5} placeholder="Share as much or as little as you're comfortable with. This is kept confidential." className={field} style={{ "--tw-ring-color": accent } as React.CSSProperties} />
      </div>
      <button type="submit" disabled={pending} className="flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-md transition disabled:opacity-60" style={{ backgroundColor: accent }}>
        {pending && <span className="inline-block size-4 rounded-full border-2 border-white/30 border-t-white" style={{ animation: "spin 0.6s linear infinite" }} />}
        {pending ? "Sending..." : "Request counselling"}
      </button>
      <p className="text-center text-xs text-[#a09890]">Your request is private. Powered by <span className="font-semibold">WorshipHQ</span></p>
    </form>
  );
}
