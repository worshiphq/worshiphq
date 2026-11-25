"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { changeRelease, finishReleaseUpload, startReleaseUpload } from "@/app/actions/admin-live-releases";
import type { LiveRelease } from "@/lib/live-release";

type Row = Pick<LiveRelease, "version" | "notes" | "bytes" | "status" | "audience" | "log">;
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const quiet = "rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/10 disabled:opacity-50";

export function LiveReleasesAdmin({ releases, testers }: { releases: Row[]; testers: number }) {
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [sure, setSure] = useState("");
  const [open, setOpen] = useState("");
  const newest = releases.find((r) => r.status === "published" && r.audience === "all");
  const run = (version: string, change: Parameters<typeof changeRelease>[1], good: string) => start(async () => {
    const r = await changeRelease(version, change).catch(() => ({ ok: false, error: "That didn't work. Try again." }));
    setNote({ ok: r.ok, text: r.ok ? good : r.error ?? "That didn't work." });
    setSure("");
  });
  return (
    <>
      <Upload />
      {note && <p role="status" className={`mt-4 text-sm font-semibold ${note.ok ? "text-teal-300" : "text-amber-300"}`}>{note.text}</p>}
      <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <h2 className="font-semibold">Every version</h2>
        {releases.length === 0 && <p className="mt-3 text-sm text-white/50">None yet.</p>}
        <ul className="mt-2">
          {releases.map((r) => {
            const live = r.status === "published";
            return (
              <li key={r.version} className="border-t border-white/5 py-3 first:border-0">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-base font-bold">{r.version}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${live ? "bg-teal-500/20 text-teal-300" : "bg-white/10 text-white/60"}`}>
                    {live ? (r.audience === "testers" ? "Published to testers" : r === newest ? "Published: the one apps get" : "Published") : r.status === "draft" ? "Not published" : "Unpublished"}
                  </span>
                  <span className="flex-1 text-xs text-white/50">{(r.bytes / 1e6).toFixed(0)} MB</span>
                  {sure === r.version ? (
                    <>
                      <span className="text-xs text-white/70">{live ? "Stop offering it? Computers that have it keep it." : "Offer it to:"}</span>
                      {live ? (
                        <button disabled={pending} onClick={() => run(r.version, { status: "withdrawn" }, `${r.version} is no longer offered.`)} className={quiet}>Yes, unpublish</button>
                      ) : (
                        <>
                          <button disabled={pending || !testers} title={testers ? undefined : "No testers are set in Pricing › Promotions"} onClick={() => run(r.version, { status: "published", audience: "testers" }, `${r.version} is offered to testers.`)} className={quiet}>Testers ({testers})</button>
                          <button disabled={pending} onClick={() => run(r.version, { status: "published", audience: "all" }, `${r.version} is offered to everyone.`)} className="rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-semibold hover:bg-teal-400 disabled:opacity-50">Everyone</button>
                        </>
                      )}
                      <button onClick={() => setSure("")} className="px-2 text-xs text-white/60 hover:text-white">Cancel</button>
                    </>
                  ) : (
                    <>
                      {live && r.audience === "testers" && <button disabled={pending} onClick={() => run(r.version, { status: "published", audience: "all" }, `${r.version} is offered to everyone.`)} className={quiet}>Offer to everyone</button>}
                      <button disabled={pending} onClick={() => { setNote(null); setSure(r.version); }} className={quiet}>{live ? "Unpublish" : r.status === "draft" ? "Publish" : "Publish again"}</button>
                      <button onClick={() => setOpen(open === r.version ? "" : r.version)} className={quiet} aria-expanded={open === r.version}>History</button>
                    </>
                  )}
                </div>
                {r.notes && <p className="mt-1 whitespace-pre-line text-sm text-white/60">{r.notes}</p>}
                {open === r.version && <ul className="mt-2 space-y-0.5 rounded-lg bg-white/5 p-3 text-xs text-white/60">{r.log.map((l, i) => <li key={i}>{when(l.at)} · {l.what}{l.by ? ` · ${l.by}` : ""}</li>)}</ul>}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-white/40">Unpublishing doesn&apos;t take a version off computers. To undo a bad one, publish a newer number with the fix.</p>
      </section>
    </>
  );
}

function Upload() {
  const [exe, setExe] = useState<File | null>(null);
  const [sig, setSig] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const version = exe?.name.match(/_(\d+\.\d+\.\d+)_/)?.[1] ?? "";

  async function upload() {
    if (!exe) return;
    setMsg(null);
    setBusy("Starting…");
    try {
      const s = await startReleaseUpload(version, sig);
      if (!s.ok || !s.url) throw new Error(s.error);
      await new Promise<void>((done, fail) => {
        const x = new XMLHttpRequest();
        x.open("PUT", s.url!);
        x.setRequestHeader("Content-Type", s.contentType!);
        x.upload.onprogress = (e) => { if (e.lengthComputable) setBusy(`Uploading ${Math.round((e.loaded / e.total) * 100)}%`); };
        x.onload = () => (x.status < 300 ? done() : fail(new Error(`The upload was refused (${x.status}).`)));
        x.onerror = () => fail(new Error("The upload was blocked. Add the CORS setting to the storage bucket in Cloudflare, then try again."));
        x.send(exe);
      });
      setBusy("Checking…");
      const r = await finishReleaseUpload(version, sig, notes, exe.size);
      if (!r.ok) throw new Error(r.error);
      setMsg({ ok: true, text: `${version} is uploaded. Nobody gets it until you publish it below.` });
      setExe(null);
      setSig("");
      setNotes("");
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error && e.message ? e.message : "That didn't work. Try again." });
    }
    setBusy("");
  }

  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <h2 className="font-semibold">Upload a version</h2>
      <p className="mt-1 text-sm text-white/50">Choose the installer and the .sig file made with it. It stays unpublished until you publish it.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <label className="cursor-pointer rounded-lg border border-white/10 px-4 py-2 font-semibold hover:bg-white/10">{exe ? exe.name : "Installer (.exe)"}
          <input type="file" accept=".exe" className="sr-only" onChange={(e) => setExe(e.target.files?.[0] ?? null)} />
        </label>
        <label className="cursor-pointer rounded-lg border border-white/10 px-4 py-2 font-semibold hover:bg-white/10">{sig ? "Signature chosen" : "Signature (.sig)"}
          <input type="file" accept=".sig" className="sr-only" onChange={async (e) => setSig((await e.target.files?.[0]?.text()) ?? "")} />
        </label>
        {exe && <span className="text-white/60">{version ? `Version ${version}` : "No version in that file name"}</span>}
      </div>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={3} placeholder="What's new (churches see this)" aria-label="What's new" className="mt-3 w-full rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white focus-visible:border-teal-400/60 focus-visible:outline-none" />
      <button disabled={!exe || !version || !sig || !!busy} onClick={upload} className="mt-3 flex h-10 items-center gap-2 rounded-lg bg-teal-500 px-4 text-sm font-semibold hover:bg-teal-400 disabled:opacity-50">{busy && <Loader2 className="size-4 animate-spin" />} {busy || "Upload"}</button>
      {msg && <p role="status" className={`mt-2 text-sm font-semibold ${msg.ok ? "text-teal-300" : "text-amber-300"}`}>{msg.text}</p>}
    </section>
  );
}
