import { ask } from "./Dialogs";
import { useEffect, useState, type ReactNode } from "react";
import { Check, Copy, Download, FolderOpen, Loader2, LogIn, LogOut, Pencil, RefreshCw } from "lucide-react";
import { accountActive, trialDaysLeft, useAccountStore } from "../lib/account";
import { useUpdateStore } from "../lib/updates";
import { useProjectionStore } from "../stores/projection-store";
import { BuyMedia } from "./SignIn";
import logoMark from "../assets/worshiphq-mark.png";
import { isDesktopApp } from "../lib/media-src";
import { useBibleStore } from "../stores/bible-store";
import { useVoiceStore } from "../stores/voice-store";
import pkg from "../../package.json";

interface LicenseInfo {
  is_licensed: boolean;
  is_trial: boolean;
  trial_days_remaining: number;
  hwid: string;
  license_key: string | null;
  registered_to: string | null;
  activated_epoch: number | null;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-line py-3 last:border-0 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-4">
      <span className="text-[13px] font-medium text-ink-muted">{label}</span>
      <div className="min-w-0 text-[14px] text-ink">{children}</div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => { await navigator.clipboard.writeText(text).catch(() => {}); setDone(true); setTimeout(() => setDone(false), 1500); }}
      className="ml-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] font-semibold text-primary-bright hover:bg-primary-soft"
    >
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {done ? "Copied" : "Copy"}
    </button>
  );
}

/** Settings › About: version, who this copy is registered to, the licence, and credits. */
export function AboutView() {
  const [info, setInfo] = useState<LicenseInfo | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const packs = useBibleStore((s) => s.packs);
  const loadPacks = useBibleStore((s) => s.loadPacks);
  const whisperInstalled = useVoiceStore((s) => s.whisperInstalled);
  const checkWhisper = useVoiceStore((s) => s.checkWhisper);

  async function load() {
    if (!isDesktopApp()) return;
    const { invoke } = await import("@tauri-apps/api/core");
    const i = await invoke<LicenseInfo>("license_info").catch(() => null);
    setInfo(i);
    setName(i?.registered_to ?? "");
  }
  useEffect(() => { load(); if (!packs.length) loadPacks(); checkWhisper(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveName() {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("set_registered_to", { name });
    setEditing(false);
    load();
  }

  const account = useAccountStore((s) => s.account);
  const subscribed = accountActive(account);
  const days = trialDaysLeft(account);
  const isLicensed = useProjectionStore((s) => s.isLicensed);
  const status = days !== null ? `Free trial: ${days} day${days === 1 ? "" : "s"} left` : isLicensed ? `Licensed to ${account?.church.name ?? "this church"}` : subscribed ? `WorshipHQ subscription: ${account!.church.name}` : "Not signed in";

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="mx-auto grid max-w-3xl gap-3">
        <section className="flex flex-wrap items-center gap-5 rounded-xl border border-line bg-surface-2 p-5 shadow-sm">
          <div className="grid size-20 place-items-center rounded-2xl bg-white p-2.5 ring-1 ring-line">
            <img src={logoMark} alt="" className="h-full w-full object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[22px] font-bold tracking-tight text-ink">WorshipHQ <span className="text-primary">Live</span></h2>
            <p className="text-[14px] text-ink-muted">Songs, Bible verses, pictures and videos on your church screen.</p>
            <p className="mt-1 text-[13px] text-ink-faint">Version {pkg.version} · Made by WorshipHQ · worshiphq.app</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-[13px] font-bold ${isLicensed || subscribed ? "bg-success/15 text-success" : "bg-gold/15 text-gold"}`}>{status}</span>
        </section>

        <AccountSection />
        <UpdatesSection />

        <section className="rounded-xl border border-line bg-surface-2 px-5 py-2 shadow-sm">
          <h3 className="pt-3 text-[16px] font-bold text-ink">Licence</h3>
          <Row label="Registered to">
            {editing ? (
              <span className="flex flex-wrap gap-2">
                <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveName()}
                  placeholder="e.g. Grace Baptist Church, Accra" className="h-9 min-w-[240px] flex-1 rounded-lg border border-line-bright px-2 text-[14px]" />
                <button onClick={saveName} className="h-9 rounded-lg bg-primary px-3 text-[13px] font-bold text-white hover:bg-primary-bright">Save</button>
                <button onClick={() => { setEditing(false); setName(info?.registered_to ?? ""); }} className="h-9 rounded-lg px-3 text-[13px] font-semibold text-ink-muted hover:bg-surface-4">Cancel</button>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <b>{info?.registered_to || <span className="font-normal text-ink-faint">Not set</span>}</b>
                <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] font-semibold text-primary-bright hover:bg-primary-soft">
                  <Pencil className="size-3.5" /> {info?.registered_to ? "Change" : "Add your church name"}
                </button>
              </span>
            )}
          </Row>
          <Row label="Status">{status}</Row>
          <Row label="This computer's ID">
            <span className="break-all font-mono text-[13px]">{info?.hwid ?? "—"}</span>{info?.hwid && <CopyButton text={info.hwid} />}
            <span className="mt-0.5 block text-[12px] text-ink-faint">WorshipHQ support may ask for this. Each church's subscription covers 2 computers; signing out of one frees its place.</span>
          </Row>
          <Row label="Your files">
            <button onClick={async () => { const { invoke } = await import("@tauri-apps/api/core"); invoke("open_data_folder"); }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line-bright px-3 py-1.5 text-[13px] font-semibold text-ink hover:bg-surface-4">
              <FolderOpen className="size-4" /> Open the WorshipHQ Live folder
            </button>
            <span className="mt-1 block text-[12px] text-ink-faint">Your pictures, videos, presentations, Bibles and licence are kept here.</span>
          </Row>
        </section>

        <section className="rounded-xl border border-line bg-surface-2 px-5 py-2 shadow-sm">
          <h3 className="pt-3 text-[16px] font-bold text-ink">On this computer</h3>
          <Row label="Bible versions">{packs.length} installed</Row>
          <Row label="Speech recognition">{whisperInstalled ? "Whisper (OpenAI) installed, works offline" : "Whisper not downloaded yet (Settings › Audio & microphone)"}</Row>
        </section>

        <section className="rounded-xl border border-line bg-surface-2 px-5 py-4 shadow-sm">
          <h3 className="text-[16px] font-bold text-ink">Credits</h3>
          <ul className="mt-2 space-y-1.5 text-[13px] text-ink-muted">
            <li>Speech recognition: Whisper by OpenAI, running on this computer with whisper.cpp (MIT licence).</li>
            <li>Twi / Akan speech model: “gha-whisper-small-twi-v6” by teckedd (Apache Licence 2.0), trained on Google WAXAL, Common Voice and GhanaNLP community Twi speech; converted for this app by WorshipHQ.</li>
            <li>WorshipHQ AI runs on gpt-oss (OpenAI, Apache Licence 2.0) through Groq, or Claude by Anthropic, through the WorshipHQ server.</li>
            <li>Public-domain and openly licensed Bibles from eBible.org (Biblica Open versions under CC BY-SA 4.0). Other versions are provided under licences held by WorshipHQ or your church.</li>
            <li>Hymns in the song library are in the public domain.</li>
            <li>Free backgrounds are original work by WorshipHQ.</li>
            <li>Akan Times New Roman is made by WorshipHQ from the Tinos font by Steve Matteson (Apache Licence 2.0).</li>
          </ul>
          <p className="mt-3 text-[12px] text-ink-faint">© {new Date().getFullYear()} WorshipHQ. All rights reserved.</p>
        </section>
      </div>
    </div>
  );
}

const longDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

/** The church's WorshipHQ account on this computer. */
function AccountSection() {
  const { account, signOut, checkIn } = useAccountStore();
  const [busy, setBusy] = useState(false);
  if (!account) {
    return (
      <section className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface-2 p-5 shadow-sm">
        <div className="min-w-0 flex-1">
          <h3 className="text-[16px] font-bold text-ink">WorshipHQ account</h3>
          <p className="text-[13px] text-ink-muted">Sign in with your church's WorshipHQ account, or make one here if your church doesn't have one yet (you don't need to use anything else from WorshipHQ). Then buy WorshipHQ Live for your church: it covers 2 computers, with the AI helper, free backgrounds and cloud backup.</p>
        </div>
        <button onClick={() => window.dispatchEvent(new Event("whq-sign-in"))}
          className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[14px] font-bold text-white hover:bg-primary-bright"><LogIn className="size-4" /> Sign in</button>
      </section>
    );
  }
  const m = account.media;
  const active = accountActive(account);
  return (
    <section className="rounded-xl border border-line bg-surface-2 px-5 py-2 shadow-sm">
      <h3 className="pt-3 text-[16px] font-bold text-ink">WorshipHQ account</h3>
      <Row label="Church">{account.church.name}</Row>
      <Row label="Signed in as">{account.user.name || account.user.email || "—"}{account.user.name && account.user.email && <span className="text-ink-faint"> · {account.user.email}</span>}</Row>
      <Row label="WorshipHQ Live">
        {active
          ? <span className="font-semibold text-success">{m.isTrial ? "Free trial" : "Active"}{m.until ? ` until ${longDate(m.until)}` : ""}</span>
          : <span className="font-semibold text-danger">Not active{m.until ? ` (ended ${longDate(m.until)})` : ""}.</span>}
        <span className="mt-0.5 block text-[12px] text-ink-faint">Covers {m.seats} computer{m.seats === 1 ? "" : "s"}. Works without internet for up to 30 days at a time.</span>
      </Row>
      <Row label={active && !m.isTrial ? "Pay ahead" : "Buy WorshipHQ Live"}>
        <BuyMedia />
        {active && !m.isTrial && <span className="mt-1 block text-[12px] text-ink-faint">Paying early adds the time on after {m.until ? longDate(m.until) : "the current period"}; no days are lost.</span>}
      </Row>
      <Row label="Last checked">
        {new Date(account.checkedAt).toLocaleString()}
        <button disabled={busy} onClick={async () => { setBusy(true); await checkIn(); setBusy(false); }}
          className="ml-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] font-semibold text-primary-bright hover:bg-primary-soft">
          {busy ? <Loader2 className="size-3.5 whq-spin" /> : <RefreshCw className="size-3.5" />} Check now
        </button>
      </Row>
      <Row label="This computer">
        <button onClick={async () => { if (await ask("Sign this computer out of WorshipHQ? That frees its place so another computer can sign in.", "Sign out")) signOut(); }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line-bright px-3 py-1.5 text-[13px] font-semibold text-ink hover:bg-surface-4">
          <LogOut className="size-4" /> Sign out
        </button>
      </Row>
    </section>
  );
}

/** Automatic updates: what version is here, and whether a newer one is waiting. */
function UpdatesSection() {
  const { phase, version, progress, error, checkedAt, check, install, download, mode, setMode } = useUpdateStore();
  const line =
    phase === "checking" ? "Looking for a new version…"
    : phase === "available" ? `Version ${version} is available.${error ? ` The last download didn't finish: ${error}` : ""}`
    : phase === "downloading" ? `Downloading version ${version}… ${progress}%`
    : phase === "ready" ? `Version ${version} is downloaded. Restart when you're not in a service.`
    : phase === "installing" ? "Updating… WorshipHQ Live will restart."
    : phase === "none" ? "You have the newest version."
    : phase === "error" ? `Couldn't check for updates: ${error ?? "no internet?"}`
    : "Choose below how updates are handled. Nothing is installed until you press Restart and update.";
  return (
    <section className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface-2 p-5 shadow-sm">
      <div className="min-w-0 flex-1">
        <h3 className="text-[16px] font-bold text-ink">Updates</h3>
        <p className="text-[13px] text-ink-muted">This is version {pkg.version}. {line}</p>
        {phase === "downloading" && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-4"><div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} /></div>}
        {checkedAt && phase !== "checking" && <p className="mt-0.5 text-[12px] text-ink-faint">Last checked {new Date(checkedAt).toLocaleTimeString()}</p>}
      </div>
      <div role="radiogroup" aria-label="How updates are handled" className="basis-full border-t border-line pt-3">
        {([["auto", "Automatic", "Looks by itself and downloads in the background. You press Restart and update."], ["ask", "Ask me", "Looks by itself and tells you. You press Download."], ["manual", "Manual", "Only looks when you press Check for updates."]] as const).map(([v, name, detail]) => (
          <label key={v} className="flex cursor-pointer items-start gap-2.5 py-1">
            <input type="radio" name="update-mode" checked={mode === v} onChange={() => setMode(v)} className="mt-1 size-4 accent-[var(--color-primary)]" />
            <span><span className="block text-[14px] font-semibold text-ink">{name}</span><span className="block text-[12px] text-ink-muted">{detail}</span></span>
          </label>
        ))}
      </div>
      {phase === "available" || phase === "downloading" ? (
        <button onClick={download} disabled={phase === "downloading"} className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[14px] font-bold text-white hover:bg-primary-bright disabled:opacity-60">
          {phase === "downloading" ? <Loader2 className="size-4 whq-spin" /> : <Download className="size-4" />} {phase === "downloading" ? "Downloading…" : `Download ${version}`}
        </button>
      ) : phase === "ready" || phase === "installing" ? (
        <button onClick={install} disabled={phase === "installing"} className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[14px] font-bold text-white hover:bg-primary-bright disabled:opacity-60">
          {phase === "installing" ? <Loader2 className="size-4 whq-spin" /> : <RefreshCw className="size-4" />} Restart and update
        </button>
      ) : (
        <button onClick={() => check(true)} disabled={phase === "checking"}
          className="flex h-10 items-center gap-2 rounded-lg border border-line-bright px-4 text-[14px] font-semibold text-ink hover:bg-surface-4 disabled:opacity-60">
          {phase === "checking" ? <Loader2 className="size-4 whq-spin" /> : <RefreshCw className="size-4" />} Check for updates
        </button>
      )}
    </section>
  );
}
