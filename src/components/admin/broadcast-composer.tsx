"use client";

import { Megaphone, Trash2, Eye, EyeOff } from "lucide-react";
import { createAnnouncement, toggleAnnouncement, deleteAnnouncement } from "@/app/actions/admin";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFeedback } from "@/components/ui/feedback";

interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  level: string;
  active: boolean;
  endsAt: Date | null;
  createdAt: Date;
}

const LEVEL_STYLES: Record<string, string> = {
  info: "bg-sky-500/15 text-sky-300",
  warning: "bg-amber-500/15 text-amber-300",
  success: "bg-emerald-500/15 text-emerald-300",
};

export function BroadcastComposer({ announcements }: { announcements: AnnouncementRow[] }) {
  const { run } = useFeedback();
  const field =
    "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-400/60 focus:outline-none";

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Composer */}
      <form action={createAnnouncement} className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Megaphone className="size-4 text-teal-400" /> New announcement
        </h2>
        <input name="title" required placeholder="Title" className={field} />
        <textarea name="body" required rows={3} placeholder="Message shown to every church admin…" className={field} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Level</label>
            <select name="level" defaultValue="info" className={field}>
              <option value="info" className="bg-slate-800">Info</option>
              <option value="warning" className="bg-slate-800">Warning</option>
              <option value="success" className="bg-slate-800">Success</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Ends (optional)</label>
            <input name="endsAt" type="date" className={field} />
          </div>
        </div>
        <SubmitButton
          pendingLabel="Publishing…"
          successMessage="Announcement published"
          className="rounded-xl bg-teal-500 px-5 py-2.5 text-sm font-semibold text-white shadow-none hover:bg-teal-400"
        >
          Publish to all churches
        </SubmitButton>
      </form>

      {/* Existing */}
      <div>
        <h2 className="mb-4 text-sm font-semibold text-slate-200">
          Announcements <span className="text-slate-500">({announcements.length})</span>
        </h2>
        <div className="space-y-3">
          {announcements.map((a) => (
            <div key={a.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] capitalize ${LEVEL_STYLES[a.level] ?? LEVEL_STYLES.info}`}>
                      {a.level}
                    </span>
                    <span className="font-medium text-slate-100">{a.title}</span>
                    {!a.active && <span className="text-xs text-slate-500">(hidden)</span>}
                  </div>
                  <p className="mt-1 text-sm text-slate-400">{a.body}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      run(() => toggleAnnouncement(a.id, !a.active), {
                        pending: a.active ? "Hiding…" : "Showing…",
                        success: a.active ? "Hidden" : "Now visible",
                      })
                    }
                    title={a.active ? "Hide" : "Show"}
                    className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white"
                  >
                    {a.active ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Delete this announcement?"))
                        run(() => deleteAnnouncement(a.id), { pending: "Deleting…", success: "Deleted" });
                    }}
                    className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-red-500/10 hover:text-red-300"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {announcements.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-slate-500">
              No announcements yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
