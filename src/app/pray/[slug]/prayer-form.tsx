"use client";

import { useState, useTransition } from "react";
import { submitPublicPrayerRequest } from "@/app/actions/prayer-public";

export function PrayerForm({
  churchSlug,
  accentColor,
}: {
  churchSlug: string;
  accentColor: string | null;
}) {
  const [pending, start] = useTransition();
  const [anonymous, setAnonymous] = useState(false);
  const accent = accentColor ?? "#6366f1";

  const handleSubmit = (formData: FormData) => {
    formData.set("churchSlug", churchSlug);
    if (anonymous) formData.set("isAnonymous", "on");
    start(() => submitPublicPrayerRequest(formData));
  };

  return (
    <form action={handleSubmit} className="space-y-4">
      {!anonymous && (
        <div>
          <label className="mb-1 block text-sm font-medium text-[#1c1a16]">Your name</label>
          <input
            name="name"
            placeholder="Full name"
            className="w-full rounded-xl border border-[#e5e0db] bg-white px-4 py-3 text-sm text-[#1c1a16] shadow-sm outline-none focus:ring-2"
            style={{ "--tw-ring-color": accent } as React.CSSProperties}
          />
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-[#1c1a16]">Prayer request *</label>
        <textarea
          name="request"
          required
          rows={4}
          placeholder="Share what you'd like prayer for..."
          className="w-full rounded-xl border border-[#e5e0db] bg-white px-4 py-3 text-sm text-[#1c1a16] shadow-sm outline-none focus:ring-2"
          style={{ "--tw-ring-color": accent } as React.CSSProperties}
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-[#6b6560]">
        <input
          type="checkbox"
          checked={anonymous}
          onChange={(e) => setAnonymous(e.target.checked)}
          className="size-4 rounded border-[#e5e0db]"
        />
        Submit anonymously
      </label>

      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-md transition disabled:opacity-60"
        style={{ backgroundColor: accent }}
      >
        {pending && (
          <span
            className="inline-block size-4 rounded-full border-2 border-white/30 border-t-white"
            style={{ animation: "spin 0.6s linear infinite" }}
          />
        )}
        {pending ? "Submitting..." : "Submit prayer request"}
      </button>

      <p className="text-center text-xs text-[#a09890]">
        Powered by <span className="font-semibold">WorshipHQ</span>
      </p>
    </form>
  );
}
