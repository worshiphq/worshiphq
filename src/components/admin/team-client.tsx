"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus, ShieldCheck, Send, Unlock, Trash2 } from "lucide-react";
import { AdminCard } from "@/components/admin/admin-shell";
import { createSuperAdmin, resendAdminInvite, unlockSuperAdmin, removeSuperAdmin } from "@/app/actions/admin-team";

export type TeamAdmin = { id: string; name: string; email: string; phone: string | null; active: boolean; invited: boolean; lastLoginAt: string | null; locked: boolean };

const btn = "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50";
const ghost = `${btn} border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10`;
const input = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-500/60 focus:outline-none";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "never");

export function TeamClient({ isOwner, ready, ownerEmail, admins }: { isOwner: boolean; ready: boolean; ownerEmail: string; admins: TeamAdmin[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(key: string, fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    setBusy(key); setMsg(null);
    try {
      const r = await fn();
      setMsg({ ok: r.ok, text: (r.ok ? r.message : r.error) ?? "" });
      if (r.ok) router.refresh();
      return r.ok;
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message || "Something went wrong." });
      return false;
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      {!ready && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          The admin team table is not in the database yet. Run the database update first (<code>npx prisma db push</code>), then come back.
        </div>
      )}
      {msg && (
        <div role="status" className={`rounded-lg border px-3 py-2 text-sm ${msg.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-red-500/30 bg-red-500/10 text-red-200"}`}>{msg.text}</div>
      )}

      <AdminCard className="divide-y divide-white/10">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-medium text-slate-100"><ShieldCheck className="size-4 text-teal-400" /> Owner</div>
            <div className="text-xs text-slate-500">{ownerEmail}</div>
          </div>
          <span className="rounded-full bg-teal-500/15 px-2.5 py-0.5 text-xs font-medium text-teal-300">Cannot be removed</span>
        </div>
        {admins.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 font-medium text-slate-100">
                {a.name}
                {a.invited && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-300">Invite not used yet</span>}
                {a.locked && <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-medium text-red-300">Locked for 24 hours</span>}
              </div>
              <div className="text-xs text-slate-500">{a.email}{a.phone ? ` · text codes to ${a.phone}` : " · email codes only"}</div>
              <div className="text-xs text-slate-500">Last signed in: {when(a.lastLoginAt)}</div>
            </div>
            {isOwner && (
              <div className="flex flex-wrap gap-2">
                <button className={ghost} disabled={!!busy} onClick={() => run(`re-${a.id}`, () => resendAdminInvite(a.id))}>
                  {busy === `re-${a.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} {a.invited ? "Send the link again" : "Send a password link"}
                </button>
                {a.locked && (
                  <button className={ghost} disabled={!!busy} onClick={() => run(`un-${a.id}`, () => unlockSuperAdmin(a.id))}>
                    {busy === `un-${a.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <Unlock className="size-3.5" />} Unlock
                  </button>
                )}
                <button className={`${btn} border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20`} disabled={!!busy}
                  onClick={() => { if (window.confirm(`Remove ${a.name}? Their sign-in stops working at once.`)) void run(`rm-${a.id}`, () => removeSuperAdmin(a.id)); }}>
                  {busy === `rm-${a.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />} Remove
                </button>
              </div>
            )}
          </div>
        ))}
        {admins.length === 0 && <div className="p-4 text-sm text-slate-400">No other admins yet.</div>}
      </AdminCard>

      {isOwner ? (
        <AdminCard className="p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200"><UserPlus className="size-4 text-teal-400" /> Add an admin</div>
          <p className="mt-1 text-sm text-slate-400">They get an email with a link to choose their own password, and a code to their email (or phone) each time they sign in. They can do everything in this area except add, remove or unlock admins. They can never remove you.</p>
          <form
            className="mt-4 grid gap-3 sm:grid-cols-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const ok = await run("add", () => createSuperAdmin(new FormData(form)));
              if (ok) form.reset();
            }}
          >
            <label className="text-xs font-medium text-slate-400">Name
              <input name="name" required className={`${input} mt-1`} placeholder="Their name" />
            </label>
            <label className="text-xs font-medium text-slate-400">Email
              <input name="email" type="email" required className={`${input} mt-1`} placeholder="name@example.com" />
            </label>
            <label className="text-xs font-medium text-slate-400">Phone for text codes (optional)
              <input name="phone" inputMode="tel" className={`${input} mt-1`} placeholder="+233..." />
            </label>
            <div className="sm:col-span-3">
              <button type="submit" disabled={!!busy || !ready} className={`${btn} bg-teal-500 text-slate-950 hover:bg-teal-400`}>
                {busy === "add" ? <><Loader2 className="size-3.5 animate-spin" /> Adding…</> : <><UserPlus className="size-3.5" /> Add and email the link</>}
              </button>
            </div>
          </form>
        </AdminCard>
      ) : (
        <p className="text-sm text-slate-500">Only the owner can add, remove or unlock admins.</p>
      )}
    </div>
  );
}
