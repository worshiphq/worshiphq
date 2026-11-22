import { useEffect, useState, type ReactNode } from "react";
import { Check, Copy, Eye, EyeOff, FolderOpen, Pencil } from "lucide-react";
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
  const [showKey, setShowKey] = useState(false);
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

  const status = !info ? "—" : info.is_licensed ? "Licensed: full version" : info.is_trial ? `Free trial: ${info.trial_days_remaining} day${info.trial_days_remaining === 1 ? "" : "s"} left` : "Trial ended";
  const masked = info?.license_key ? (showKey ? info.license_key : info.license_key.replace(/(?<=WHQ-.{4}-).+(?=-.{4}$)/, "••••-••••")) : null;

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="mx-auto grid max-w-3xl gap-3">
        <section className="flex flex-wrap items-center gap-5 rounded-xl border border-line bg-surface-2 p-5 shadow-sm">
          <div className="grid size-20 place-items-center rounded-2xl bg-white p-2.5 ring-1 ring-line">
            <img src={logoMark} alt="" className="h-full w-full object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[22px] font-bold tracking-tight text-ink">WorshipHQ <span className="text-primary">Media</span></h2>
            <p className="text-[14px] text-ink-muted">Songs, Bible verses, pictures and videos on your church screen.</p>
            <p className="mt-1 text-[13px] text-ink-faint">Version {pkg.version} · Made by WorshipHQ · worshiphq.app</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-[13px] font-bold ${info?.is_licensed ? "bg-success/15 text-success" : "bg-gold/15 text-gold"}`}>{status}</span>
        </section>

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
          {info?.activated_epoch && <Row label="Activated on">{new Date(info.activated_epoch * 1000).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</Row>}
          <Row label="Licence key">
            {masked ? (
              <span className="font-mono">
                {masked}
                <button onClick={() => setShowKey(!showKey)} className="ml-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-sans text-[12px] font-semibold text-primary-bright hover:bg-primary-soft">
                  {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />} {showKey ? "Hide" : "Show"}
                </button>
                {showKey && <CopyButton text={info!.license_key!} />}
              </span>
            ) : <span className="text-ink-faint">No licence key on this computer</span>}
          </Row>
          <Row label="This computer's ID">
            <span className="break-all font-mono text-[13px]">{info?.hwid ?? "—"}</span>{info?.hwid && <CopyButton text={info.hwid} />}
            <span className="mt-0.5 block text-[12px] text-ink-faint">Send this to WorshipHQ when you buy or move a licence. Each licence covers 2 computers.</span>
          </Row>
          <Row label="Your files">
            <button onClick={async () => { const { invoke } = await import("@tauri-apps/api/core"); invoke("open_data_folder"); }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line-bright px-3 py-1.5 text-[13px] font-semibold text-ink hover:bg-surface-4">
              <FolderOpen className="size-4" /> Open the WorshipHQ Media folder
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
            <li>Public-domain and openly licensed Bibles from eBible.org (Biblica Open versions under CC BY-SA 4.0). Other versions are provided under licences held by WorshipHQ or your church.</li>
            <li>Hymns in the song library are in the public domain.</li>
            <li>Free backgrounds are original work by WorshipHQ.</li>
          </ul>
          <p className="mt-3 text-[12px] text-ink-faint">© {new Date().getFullYear()} WorshipHQ. All rights reserved.</p>
        </section>
      </div>
    </div>
  );
}
