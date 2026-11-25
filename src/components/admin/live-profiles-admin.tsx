"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { addLiveProfile, changeLiveProfile } from "@/app/actions/admin-live-profiles";
import type { ProfileInfo } from "@/lib/live-profiles";

interface FileSong { title: string; author?: string }
interface ProfileFile { kind?: string; name?: string; songs?: FileSong[]; looks?: unknown; noteLook?: unknown }

const input = "h-10 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white focus-visible:border-teal-400/60 focus-visible:outline-none";

/** SuperAdmin › WorshipHQ Live: songs and looks a church can start with. */
export function LiveProfilesAdmin({ profiles }: { profiles: ProfileInfo[] }) {
  const [file, setFile] = useState<ProfileFile | null>(null);
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [looks, setLooks] = useState(true);
  const [mayShare, setMayShare] = useState(false);
  const [note, setNote] = useState("");
  const [sure, setSure] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (f: () => Promise<{ ok: boolean; error?: string }>, good: string) => start(async () => {
    const r = await f().catch(() => ({ ok: false, error: "That didn't work. Try again." }));
    setNote(r.ok ? good : r.error ?? "That didn't work.");
    if (r.ok) { setFile(null); setSure(null); }
  });
  const songs = file?.songs ?? [];
  const share = () => run(() => addLiveProfile(JSON.stringify({
    name, about, songs: songs.filter((_, i) => picked.has(i)), looks: looks ? file!.looks ?? null : null, noteLook: looks ? file!.noteLook ?? null : null,
  }), mayShare), "Shared with churches.");

  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-white">
      <h2 className="font-semibold">Template profiles</h2>
      <p className="mt-1 text-sm text-white/50">
        Songs and looks a new church can start with. In the app, press Profiles › Save this profile as a file, then upload
        the file here. Churches load it with Profiles › Templates from WorshipHQ; their own songs and settings stay.
      </p>
      <label className="mt-4 inline-flex h-10 cursor-pointer items-center rounded-lg bg-teal-500 px-4 text-sm font-semibold hover:bg-teal-400">
        Upload a profile
        <input type="file" accept=".whqprofile,.json" className="sr-only" onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setNote("");
          try {
            const p = JSON.parse(await f.text()) as ProfileFile;
            if (p.kind !== "profile" || !Array.isArray(p.songs)) throw new Error("not a profile");
            setFile(p); setName((p.name ?? "").slice(0, 40)); setAbout(""); setPicked(new Set()); setMayShare(false); setLooks(!!p.looks);
          } catch { setNote("That isn't a WorshipHQ Live profile file."); }
        }} />
      </label>
      {note && <p className="mt-2 text-sm font-semibold text-teal-300">{note}</p>}

      {file && (
        <div className="mt-4 rounded-xl border border-white/10 p-4">
          <div className="flex flex-wrap gap-3">
            <label className="grid flex-1 gap-1 text-xs text-white/60">Name churches see
              <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className={input} />
            </label>
            <label className="grid flex-[2] gap-1 text-xs text-white/60">In a few words (optional)
              <input value={about} maxLength={200} onChange={(e) => setAbout(e.target.value)} className={input} />
            </label>
          </div>
          {!!file.looks && <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={looks} onChange={(e) => setLooks(e.target.checked)} className="size-4 accent-teal-400" /> Share the looks, fonts and transitions</label>}
          <div className="mt-4 flex items-center gap-3 text-sm">
            <span className="flex-1 font-semibold">{picked.size} of {songs.length} songs ticked</span>
            <button onClick={() => setPicked(new Set(songs.map((_, i) => i)))} className="rounded-lg border border-white/10 px-3 py-1 text-xs font-semibold hover:bg-white/10">Tick all</button>
            <button onClick={() => setPicked(new Set())} className="rounded-lg border border-white/10 px-3 py-1 text-xs font-semibold hover:bg-white/10">Tick none</button>
          </div>
          <div className="mt-2 grid max-h-80 gap-x-4 overflow-y-auto rounded-lg bg-white/5 p-2 text-sm sm:grid-cols-2">
            {songs.map((s, i) => (
              <label key={i} className="flex items-center gap-2 px-1 py-1">
                <input type="checkbox" checked={picked.has(i)} onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n; })} className="size-4 shrink-0 accent-teal-400" />
                <span className="truncate">{s.title}{s.author && <span className="text-white/50"> · {s.author}</span>}</span>
              </label>
            ))}
          </div>
          {picked.size > 0 && (
            <label className="mt-3 flex items-start gap-2 text-sm">
              <input type="checkbox" checked={mayShare} onChange={(e) => setMayShare(e.target.checked)} className="mt-0.5 size-4 accent-teal-400" />
              <span>The words of the ticked songs are ours, out of copyright, or we have permission to share them. A church&apos;s CCLI licence covers that church only, not passing songs on to others.</span>
            </label>
          )}
          <div className="mt-4 flex gap-2">
            <button disabled={pending || !name.trim() || (!picked.size && !looks) || (picked.size > 0 && !mayShare)} onClick={share} className="flex h-10 items-center gap-2 rounded-lg bg-teal-500 px-4 text-sm font-semibold hover:bg-teal-400 disabled:opacity-50">{pending && <Loader2 className="size-4 animate-spin" />} Share with churches</button>
            <button onClick={() => setFile(null)} className="h-10 rounded-lg px-3 text-sm font-semibold text-white/70 hover:text-white">Cancel</button>
          </div>
        </div>
      )}

      <ul className="mt-4 text-sm">
        {profiles.length === 0 && !file && <li className="py-3 text-white/50">None yet.</li>}
        {profiles.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 border-t border-white/5 py-2">
            <span className="min-w-0 flex-1"><span className="font-semibold">{p.name}</span> <span className="text-white/50">{p.songs} songs{p.looks ? " and looks" : ""}{p.hidden ? " · hidden" : ""}</span>{p.about && <span className="block text-xs text-white/50">{p.about}</span>}</span>
            <button disabled={pending} onClick={() => run(() => changeLiveProfile(p.id, p.hidden ? "show" : "hide"), p.hidden ? "Shown to churches." : "Hidden.")} className="rounded-lg border border-white/10 px-3 py-1 text-xs font-semibold hover:bg-white/10">{p.hidden ? "Show" : "Hide"}</button>
            <button disabled={pending} onClick={() => (sure === p.id ? run(() => changeLiveProfile(p.id, "delete"), "Deleted.") : setSure(p.id))} className="rounded-lg border border-white/10 px-3 py-1 text-xs font-semibold hover:bg-white/10">{sure === p.id ? "Really delete?" : "Delete"}</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
