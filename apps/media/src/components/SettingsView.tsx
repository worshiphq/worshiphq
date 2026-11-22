import { useEffect, useRef, useState, type ReactNode } from "react";
import { BookOpen, Keyboard, Mic, Palette, TvMinimal, Volume2 } from "lucide-react";
import { LooksView } from "./LooksView";
import { ScreensView } from "./ScreensView";
import { useVoiceStore, type VoiceMode } from "../stores/voice-store";
import { useBibleStore } from "../stores/bible-store";
import { isDesktopApp } from "../lib/media-src";

export type SettingsTab = "looks" | "screens" | "audio" | "bibles" | "shortcuts";

const TABS: { id: SettingsTab; label: string; Icon: typeof Palette }[] = [
  { id: "looks", label: "Look & fonts", Icon: Palette },
  { id: "screens", label: "Screens & stage display", Icon: TvMinimal },
  { id: "audio", label: "Audio & microphone", Icon: Mic },
  { id: "bibles", label: "Bible versions", Icon: BookOpen },
  { id: "shortcuts", label: "Keyboard shortcuts", Icon: Keyboard },
];

export function SettingsView({ tab, onTab, onOpenMedia }: { tab: SettingsTab; onTab: (t: SettingsTab) => void; onOpenMedia: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-line bg-surface-2 px-3 py-2" role="tablist" aria-label="Settings">
        <span className="mr-3 text-[16px] font-bold text-ink">Settings</span>
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => onTab(id)}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[14px] ${tab === id ? "bg-primary-soft font-semibold text-primary-bright" : "text-ink-muted hover:bg-surface-4 hover:text-ink"}`}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "looks" && <LooksView />}
        {tab === "screens" && <ScreensView onOpenMedia={onOpenMedia} />}
        {tab === "audio" && <AudioSettings />}
        {tab === "bibles" && <BibleSettings />}
        {tab === "shortcuts" && <Shortcuts />}
      </div>
    </div>
  );
}

/* ─────────────────────────── Audio & microphone ─────────────────────────── */

function AudioSettings() {
  const v = useVoiceStore();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>("default");
  const [level, setLevel] = useState(0);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  async function loadDevices() {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(list.filter((d) => d.kind === "audioinput"));
    } catch { /* not allowed yet */ }
  }
  useEffect(() => { loadDevices(); return () => stopRef.current?.(); }, []);

  async function startTest() {
    stopRef.current?.();
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: deviceId === "default" ? true : { deviceId: { exact: deviceId } } });
      await loadDevices(); // names appear once the mic is allowed
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      src.connect(an);
      const buf = new Float32Array(an.fftSize);
      let raf = 0;
      const tick = () => {
        an.getFloatTimeDomainData(buf);
        let peak = 0;
        for (const x of buf) peak = Math.max(peak, Math.abs(x));
        setLevel(Math.min(100, Math.round(peak * 140)));
        raf = requestAnimationFrame(tick);
      };
      tick();
      setTesting(true);
      stopRef.current = () => { cancelAnimationFrame(raf); stream.getTracks().forEach((t) => t.stop()); ctx.close(); setTesting(false); setLevel(0); };
    } catch (e) {
      setError("WorshipHQ couldn't use the microphone. Check it is plugged in and that Windows allows apps to use the microphone.");
    }
  }

  const MODES: { id: VoiceMode; label: string }[] = [
    { id: "ask", label: "Ask me first (banner with a Show button)" },
    { id: "auto", label: "Show it automatically after a countdown" },
    { id: "list", label: "Only list it on the Voice assistant page" },
  ];

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="mx-auto grid max-w-4xl gap-3">
        <Card title="Microphone check" icon={<Volume2 className="size-5 text-primary-bright" />}>
          <p className="mb-3 text-[14px] text-ink-muted">Pick a microphone and speak. The bar should move. Use this before the service to make sure the pastor's mic reaches the computer.</p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={deviceId}
              onChange={(e) => { setDeviceId(e.target.value); stopRef.current?.(); }}
              className="h-10 min-w-[260px] flex-1 rounded-lg border border-line-bright bg-surface-2 px-2 text-[14px] text-ink"
            >
              <option value="default">Windows default microphone</option>
              {devices.filter((d) => d.deviceId !== "default" && d.deviceId !== "communications").map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>
              ))}
            </select>
            <button onClick={() => (testing ? stopRef.current?.() : startTest())} className={`h-10 rounded-lg px-4 text-[14px] font-bold text-white ${testing ? "bg-danger" : "bg-primary hover:bg-primary-bright"}`}>
              {testing ? "Stop test" : "Test microphone"}
            </button>
          </div>
          <div className="mt-3 h-4 overflow-hidden rounded-full bg-surface-4">
            <div className={`h-full rounded-full transition-[width] duration-75 ${level > 85 ? "bg-danger" : level > 60 ? "bg-gold" : "bg-success"}`} style={{ width: `${level}%` }} />
          </div>
          <p className="mt-1 text-[12px] text-ink-faint">Green is good. Red means it is too loud and may distort.</p>
          {error && <p className="mt-2 rounded-lg bg-danger/10 p-2 text-[13px] text-danger">{error}</p>}
        </Card>

        <Card title="Speech recognition" icon={<Mic className="size-5 text-primary-bright" />}>
          <WhisperSetup deviceId={deviceId} devices={devices} />
        </Card>

        <Card title="Old Windows recogniser (only if you choose it above)" icon={<Mic className="size-5 text-primary-bright" />}>
          <p className="text-[14px] text-ink">
            The old Windows recogniser always listens on <b>the Windows default microphone</b>. If the pastor's mic or the sound desk feed is a different input, make it the default in Windows, then restart listening.
          </p>
          <button
            onClick={async () => { if (isDesktopApp()) { const { invoke } = await import("@tauri-apps/api/core"); invoke("open_sound_settings"); } }}
            className="mt-3 h-10 rounded-lg border border-line-bright px-4 text-[14px] font-semibold text-ink hover:bg-surface-4"
          >
            Open Windows sound settings
          </button>
          <p className="mt-2 text-[13px] text-ink-muted">Tip: a feed from the sound desk (via a USB audio interface) is clearer than a microphone near the speakers.</p>
        </Card>

        <Card title="When a verse is heard" icon={<BookOpen className="size-5 text-primary-bright" />}>
          <div className="space-y-2">
            {MODES.map((m) => (
              <label key={m.id} className="flex cursor-pointer items-center gap-2.5 text-[14px] text-ink">
                <input type="radio" name="vmode" checked={v.mode === m.id} onChange={() => v.setMode(m.id)} className="size-4 accent-[var(--color-primary)]" />
                {m.label}
              </label>
            ))}
          </div>
          {v.mode === "auto" && (
            <label className="mt-3 block text-[14px] text-ink">
              Wait <b>{v.autoDelay} seconds</b> before showing
              <input type="range" min={1} max={8} value={v.autoDelay} onChange={(e) => v.setAutoDelay(+e.target.value)} className="mt-1 w-full accent-[var(--color-primary)]" />
            </label>
          )}
          <label className="mt-3 block text-[14px] text-ink">
            How sure it must be
            <input type="range" min={0.3} max={0.85} step={0.05} value={v.minConfidence} onChange={(e) => v.setMinConfidence(+e.target.value)} className="mt-1 w-full accent-[var(--color-primary)]" />
          </label>
          <Toggle label="Also catch verses that are read out without the reference" checked={v.matchQuotes} onChange={v.setMatchQuotes} />
        </Card>
      </div>
    </div>
  );
}

/* ─────────────────────────── Bibles ─────────────────────────── */

function BibleSettings() {
  const { packs, loadPacks, activePack, setActivePack } = useBibleStore();
  const [found, setFound] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => { if (!packs.length) loadPacks(); }, [packs.length, loadPacks]);
  useEffect(() => {
    if (!isDesktopApp()) return;
    import("@tauri-apps/api/core").then(({ invoke }) => invoke<string[]>("list_easyworship_bibles").then(setFound).catch(() => {}));
  }, []);
  const fileName = (p: string) => p.split(/[\\/]/).pop()!.replace(/\.ewb$/i, "");
  const installed = new Set(packs.map((p) => p.id));

  async function importOne(path: string) {
    const { invoke } = await import("@tauri-apps/api/core");
    setBusy(fileName(path));
    try { await invoke("import_easyworship_bible", { path }); }
    catch (e) { setNote(`${fileName(path).toUpperCase()}: ${e}`); }
    setBusy(null);
  }
  async function importAll() {
    setNote(null);
    for (const p of found.filter((x) => !installed.has(`ew-${fileName(x).toLowerCase()}`))) await importOne(p);
    await loadPacks();
    setNote("Done. The imported Bibles are now in the Bible screen.");
  }
  async function importFile() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ multiple: true, title: "Choose EasyWorship Bible files (.ewb)", filters: [{ name: "EasyWorship Bible", extensions: ["ewb"] }] });
    if (!picked) return;
    for (const p of (Array.isArray(picked) ? picked : [picked]).map(String)) await importOne(p);
    await loadPacks();
  }

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="mx-auto grid max-w-4xl gap-3">
        {isDesktopApp() && (
          <Card title="Your Bibles from EasyWorship" icon={<BookOpen className="size-5 text-primary-bright" />}>
            <p className="text-[14px] text-ink">
              {found.length
                ? <>EasyWorship on this computer has <b>{found.length} Bibles</b> ({found.map((f) => fileName(f).toUpperCase()).join(", ")}). Import the ones your church owns to use them here.</>
                : "Bring in Bibles your church already owns in EasyWorship (.ewb files)."}
            </p>
            <p className="mt-1 text-[12px] text-ink-muted">Imported Bibles stay on this computer only and are never shared, because versions like NIV and NKJV are licensed to your church.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {found.length > 0 && (
                <button onClick={importAll} disabled={!!busy} className="h-10 rounded-lg bg-primary px-4 text-[14px] font-bold text-white hover:bg-primary-bright disabled:opacity-60">
                  {busy ? `Importing ${busy.toUpperCase()}…` : "Import all of them"}
                </button>
              )}
              <button onClick={importFile} disabled={!!busy} className="h-10 rounded-lg border border-line-bright px-4 text-[14px] font-semibold text-ink hover:bg-surface-4">Choose .ewb files…</button>
            </div>
            {found.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {found.map((f) => {
                  const id = `ew-${fileName(f).toLowerCase()}`;
                  const has = installed.has(id);
                  return (
                    <button key={f} disabled={has || !!busy} onClick={async () => { await importOne(f); await loadPacks(); }}
                      className={`rounded-full px-3 py-1 text-[12px] font-semibold ${has ? "bg-success/10 text-success" : "bg-surface-4 text-ink hover:bg-surface-5"}`}>
                      {has ? "✓ " : "+ "}{fileName(f).toUpperCase()}
                    </button>
                  );
                })}
              </div>
            )}
            {note && <p className="mt-2 text-[13px] text-ink-muted">{note}</p>}
          </Card>
        )}
        <Card title="Installed Bible versions" icon={<BookOpen className="size-5 text-primary-bright" />}>
          <div className="divide-y divide-line">
            {packs.map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-3">
                <span className="w-20 shrink-0 text-[15px] font-bold text-ink">{p.abbreviation}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold text-ink">{p.name}</div>
                  <div className="text-[12px] text-ink-muted">{p.language} · {p.verse_count.toLocaleString()} verses{p.description ? ` · ${p.description}` : ""}</div>
                </div>
                {p.id === activePack ? (
                  <span className="rounded-md bg-primary-soft px-2 py-1 text-[12px] font-semibold text-primary-bright">Main version</span>
                ) : (
                  <button onClick={() => setActivePack(p.id)} className="rounded-md px-2 py-1 text-[12px] font-semibold text-ink-muted hover:bg-surface-4 hover:text-ink">Make main</button>
                )}
              </div>
            ))}
          </div>
        </Card>
        <Card title="About Bible versions" icon={<BookOpen className="size-5 text-primary-bright" />}>
          <p className="text-[14px] text-ink">
            Included free with WorshipHQ: KJV, ASV, WEB, BSB, BBE, YLT, Darby, Webster, Geneva 1599, the full <b>Twi Bible (Akuapem and Asante)</b>, <b>Ewe, Hausa, Yoruba, Igbo, Swahili</b> and French (Louis Segond). The Biblica translations are shared under Creative Commons BY-SA 4.0 (biblica.com · open.bible).
          </p>
          <p className="mt-2 text-[14px] text-ink-muted">
            Versions such as NKJV, NIV and ESV belong to their publishers. If your church owns them in EasyWorship, import them above. WorshipHQ can't include them for everyone without a licence.
          </p>
        </Card>
      </div>
    </div>
  );
}

/* ─────────────────────────── Shortcuts ─────────────────────────── */

const SHORTCUTS: [string, string][] = [
  ["Ctrl + C", "Clear the words (background stays). Press again to bring them back."],
  ["Ctrl + B", "Black screen. Press again to bring the slide back."],
  ["Ctrl + L", "Show the church logo. Press again to go back."],
  ["→  or  Space  or  Page Down", "Next slide (also a presentation clicker)"],
  ["←  or  Page Up", "Previous slide"],
  ["Space (when a verse banner shows)", "Show the verse the voice assistant heard"],
  ["Esc (when a verse banner shows)", "Not now"],
  ["Ctrl + K  or  /", "Jump to the Bible search box"],
  ["Ctrl + 1 … 7", "Service plan, Live, Bible, Songs, Pictures & videos, Voice assistant, Settings"],
];

function Shortcuts() {
  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="mx-auto max-w-3xl">
        <Card title="Keyboard shortcuts" icon={<Keyboard className="size-5 text-primary-bright" />}>
          <table className="w-full text-left text-[14px]">
            <tbody>
              {SHORTCUTS.map(([k, d]) => (
                <tr key={k} className="border-t border-line-soft first:border-0">
                  <td className="w-[44%] py-2.5 pr-3"><kbd className="rounded-md border border-line-bright bg-surface-4 px-2 py-1 font-sans text-[13px] font-semibold text-ink">{k}</kbd></td>
                  <td className="py-2.5 text-ink">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[13px] text-ink-muted">Ctrl + C still copies text when you have text selected or are typing in a box.</p>
        </Card>
      </div>
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface-2 p-4 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 text-[16px] font-semibold text-ink">{icon}{title}</h3>
      {children}
    </section>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="mt-3 flex cursor-pointer items-center gap-2.5 text-[14px] text-ink">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[var(--color-primary)]" />
      {label}
    </label>
  );
}

/** Choose Whisper (accurate, offline) or the old Windows recogniser, download Whisper, and pick its microphone. */
function WhisperSetup({ deviceId, devices }: { deviceId: string; devices: MediaDeviceInfo[] }) {
  const v = useVoiceStore();
  useEffect(() => { v.checkWhisper(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-3">
      <label className={`flex cursor-pointer gap-3 rounded-lg p-3 ${v.engine === "whisper" ? "bg-primary-soft/70 ring-1 ring-primary/40" : "bg-surface-4/60"}`}>
        <input type="radio" name="engine" checked={v.engine === "whisper"} onChange={() => v.setEngine("whisper")} className="mt-1 size-4 accent-[var(--color-primary)]" />
        <span>
          <span className="flex items-center gap-2 text-[14px] font-semibold text-ink">Whisper by OpenAI <span className="rounded bg-primary-soft px-1.5 py-0.5 text-[11px] font-bold text-primary-bright">Recommended</span></span>
          <span className="block text-[13px] text-ink-muted">Much more accurate, handles accents and headsets, works offline, and listens on the microphone you choose. English only for now.</span>
        </span>
      </label>
      <label className={`flex cursor-pointer gap-3 rounded-lg p-3 ${v.engine === "windows" ? "bg-primary-soft/70 ring-1 ring-primary/40" : "bg-surface-4/60"}`}>
        <input type="radio" name="engine" checked={v.engine === "windows"} onChange={() => v.setEngine("windows")} className="mt-1 size-4 accent-[var(--color-primary)]" />
        <span>
          <span className="block text-[14px] font-semibold text-ink">Windows recogniser (old)</span>
          <span className="block text-[13px] text-ink-muted">Built into Windows, nothing to download, but often mishears.</span>
        </span>
      </label>
      {v.engine === "whisper" && (
        <div className="rounded-lg border border-line p-3">
          {v.whisperInstalled ? (
            <p className="text-[14px] font-medium text-success">✓ Whisper is installed on this computer.</p>
          ) : (
            v.installingWhisper && v.whisperProgress ? (
              <WhisperProgressBar p={v.whisperProgress} />
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <p className="flex-1 text-[14px] text-ink">Whisper needs a one-time download (about 155 MB). After that it works without internet.</p>
                <button onClick={v.installWhisper} className="h-10 rounded-lg bg-primary px-4 text-[14px] font-bold text-white hover:bg-primary-bright">
                  Download Whisper
                </button>
              </div>
            )
          )}
          <label className="mt-3 block">
            <span className="mb-1 block text-[13px] font-medium text-ink-muted">Microphone to listen to</span>
            <select value={v.micId} onChange={(e) => v.setMicId(e.target.value)} className="h-10 w-full rounded-lg border border-line-bright bg-surface-2 px-2 text-[14px] text-ink">
              <option value="default">Windows default microphone</option>
              {devices.filter((d) => d.deviceId !== "default" && d.deviceId !== "communications").map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>
              ))}
            </select>
            <span className="mt-1 block text-[12px] text-ink-faint">If the names are missing, press Test microphone above once so Windows lets WorshipHQ see them.{deviceId ? "" : ""}</span>
          </label>
        </div>
      )}
    </div>
  );
}

function WhisperProgressBar({ p }: { p: { stage: string; done: number; total: number } }) {
  const pct = Math.min(100, Math.round((p.done / Math.max(1, p.total)) * 100));
  const mb = (n: number) => (n / 1048576).toFixed(0);
  const label = p.stage === "program" ? "Downloading the Whisper program…" : p.stage === "model" ? "Downloading the English speech model…" : "Finishing…";
  return (
    <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Downloading Whisper">
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[14px]">
        <span className="font-medium text-ink">{label}</span>
        <span className="tabular-nums text-ink-muted">{mb(p.done)} of {mb(p.total)} MB · <b className="text-ink">{pct}%</b></span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-surface-4">
        <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
      <p className="mt-1.5 text-[12px] text-ink-faint">You can keep using WorshipHQ while this downloads.</p>
    </div>
  );
}
