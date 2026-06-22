import { useState } from "react";
import {
  LogIn, Monitor, Book, Music, Palette, ChevronRight,
  CheckCircle2, Download, Loader2, Church,
} from "lucide-react";

type Step = "sign-in" | "displays" | "bibles" | "songs" | "theme" | "ready";

const STEPS: { id: Step; label: string; icon: typeof LogIn }[] = [
  { id: "sign-in", label: "Sign In", icon: LogIn },
  { id: "displays", label: "Displays", icon: Monitor },
  { id: "bibles", label: "Bible Packs", icon: Book },
  { id: "songs", label: "Song Library", icon: Music },
  { id: "theme", label: "Theme", icon: Palette },
  { id: "ready", label: "Ready!", icon: CheckCircle2 },
];

const BIBLE_TRANSLATIONS = [
  { code: "KJV", name: "King James Version", lang: "English", size: "2.1 MB", free: true },
  { code: "NIV", name: "New International Version", lang: "English", size: "2.3 MB", free: false },
  { code: "ESV", name: "English Standard Version", lang: "English", size: "2.2 MB", free: false },
  { code: "NKJV", name: "New King James Version", lang: "English", size: "2.2 MB", free: false },
  { code: "NLT", name: "New Living Translation", lang: "English", size: "2.4 MB", free: false },
  { code: "NASB", name: "New American Standard Bible", lang: "English", size: "2.3 MB", free: false },
  { code: "AMP", name: "Amplified Bible", lang: "English", size: "3.1 MB", free: false },
  { code: "MSG", name: "The Message", lang: "English", size: "2.5 MB", free: false },
  { code: "TWI", name: "Twi Bible (Asante)", lang: "Twi", size: "1.8 MB", free: true },
  { code: "GA", name: "Ga Bible", lang: "Ga", size: "1.7 MB", free: true },
  { code: "EWE", name: "Ewe Bible", lang: "Ewe", size: "1.9 MB", free: true },
  { code: "FRA", name: "Louis Segond (French)", lang: "French", size: "2.0 MB", free: true },
];

export function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const [currentStep, setCurrentStep] = useState<Step>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [selectedBibles, setSelectedBibles] = useState<Set<string>>(new Set(["KJV"]));
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState("classic-dark");

  const stepIndex = STEPS.findIndex((s) => s.id === currentStep);

  function nextStep() {
    const next = STEPS[stepIndex + 1];
    if (next) setCurrentStep(next.id);
  }

  function handleSignIn() {
    setSigningIn(true);
    setTimeout(() => {
      setSigningIn(false);
      nextStep();
    }, 1500);
  }

  function handleDownloadBibles() {
    setDownloading(true);
    setDownloadProgress(0);
    const interval = setInterval(() => {
      setDownloadProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          setDownloading(false);
          nextStep();
          return 100;
        }
        return p + 5;
      });
    }, 200);
  }

  return (
    <div className="flex h-full bg-surface">
      {/* Sidebar */}
      <div className="flex w-64 flex-col border-r border-line bg-surface-2 p-6">
        <div className="mb-8 flex items-center gap-2">
          <div className="grid size-8 place-items-center rounded-lg bg-primary/20">
            <Church className="size-4 text-primary-bright" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-ink">WorshipHQ Media</h1>
            <p className="text-[10px] text-ink-faint">Setup Wizard</p>
          </div>
        </div>

        <nav className="space-y-1">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            const isCurrent = step.id === currentStep;
            const isDone = i < stepIndex;
            return (
              <div
                key={step.id}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                  isCurrent
                    ? "bg-primary/10 text-primary-bright"
                    : isDone
                      ? "text-success"
                      : "text-ink-faint"
                }`}
              >
                {isDone ? (
                  <CheckCircle2 className="size-4" />
                ) : (
                  <Icon className="size-4" />
                )}
                {step.label}
              </div>
            );
          })}
        </nav>
      </div>

      {/* Content */}
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-lg">
          {currentStep === "sign-in" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-ink">Welcome to WorshipHQ Media</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  Sign in with your WorshipHQ account to sync your church's data.
                </p>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-muted">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="pastor@church.org"
                    className="h-10 w-full rounded-xl border border-line bg-surface-3 px-3 text-sm text-ink placeholder:text-ink-faint focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-muted">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-10 w-full rounded-xl border border-line bg-surface-3 px-3 text-sm text-ink placeholder:text-ink-faint focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <button
                  onClick={handleSignIn}
                  disabled={signingIn || !email || !password}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-white transition-colors hover:bg-primary-bright disabled:opacity-50"
                >
                  {signingIn ? (
                    <><Loader2 className="size-4 animate-spin" /> Signing in...</>
                  ) : (
                    <>Sign In <ChevronRight className="size-4" /></>
                  )}
                </button>
              </div>
            </div>
          )}

          {currentStep === "displays" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-ink">Select Displays</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  Choose which monitor to use for the projection output.
                </p>
              </div>
              <div className="space-y-2">
                {[
                  { id: 0, name: "Primary Display (1920x1080)", primary: true },
                  { id: 1, name: "HDMI Output (1920x1080)", primary: false },
                ].map((display) => (
                  <button
                    key={display.id}
                    className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface-3 p-4 text-left transition-colors hover:border-primary/40"
                  >
                    <Monitor className="size-5 text-ink-muted" />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-ink">{display.name}</div>
                      <div className="text-xs text-ink-faint">
                        {display.primary ? "Operator view" : "Projection output"}
                      </div>
                    </div>
                    <div className="rounded-full border border-primary bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary-bright">
                      {display.primary ? "Operator" : "Projection"}
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-xs text-ink-faint">
                Connect a projector or second monitor to see a separate projection output.
                You can change this later in settings.
              </p>
              <button
                onClick={nextStep}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-white transition-colors hover:bg-primary-bright"
              >
                Continue <ChevronRight className="size-4" />
              </button>
            </div>
          )}

          {currentStep === "bibles" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-ink">Download Bible Packs</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  Select the Bible translations your church uses. They'll be stored locally for instant access.
                </p>
              </div>
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {BIBLE_TRANSLATIONS.map((bible) => {
                  const selected = selectedBibles.has(bible.code);
                  return (
                    <button
                      key={bible.code}
                      onClick={() => {
                        const next = new Set(selectedBibles);
                        if (selected) next.delete(bible.code);
                        else next.add(bible.code);
                        setSelectedBibles(next);
                      }}
                      className={`flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition-colors ${
                        selected ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-surface-3"
                      }`}
                    >
                      <div
                        className={`grid size-5 place-items-center rounded border ${
                          selected
                            ? "border-primary bg-primary text-white"
                            : "border-line bg-surface-3"
                        }`}
                      >
                        {selected && <CheckCircle2 className="size-3" />}
                      </div>
                      <div className="flex-1">
                        <div className="text-xs font-medium text-ink">
                          {bible.code} — {bible.name}
                        </div>
                        <div className="text-[10px] text-ink-faint">
                          {bible.lang} &middot; {bible.size}
                          {bible.free && " &middot; Free"}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {downloading && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-ink-muted">
                    <span>Downloading {selectedBibles.size} translations...</span>
                    <span>{downloadProgress}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-200"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                </div>
              )}
              <button
                onClick={handleDownloadBibles}
                disabled={downloading || selectedBibles.size === 0}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-white transition-colors hover:bg-primary-bright disabled:opacity-50"
              >
                {downloading ? (
                  <><Loader2 className="size-4 animate-spin" /> Downloading...</>
                ) : (
                  <><Download className="size-4" /> Download {selectedBibles.size} Translations</>
                )}
              </button>
            </div>
          )}

          {currentStep === "songs" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-ink">Song Library</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  Your church's songs are being synced. We've also included a starter pack of popular worship songs.
                </p>
              </div>
              <div className="rounded-xl border border-line bg-surface-3 p-6 text-center">
                <Music className="mx-auto size-10 text-gold" />
                <h3 className="mt-3 text-lg font-semibold text-ink">Songs Ready</h3>
                <div className="mt-2 flex justify-center gap-6 text-sm">
                  <div>
                    <div className="text-2xl font-bold text-primary-bright">142</div>
                    <div className="text-xs text-ink-faint">Church songs</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gold">500+</div>
                    <div className="text-xs text-ink-faint">Starter pack</div>
                  </div>
                </div>
              </div>
              <button
                onClick={nextStep}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-white transition-colors hover:bg-primary-bright"
              >
                Continue <ChevronRight className="size-4" />
              </button>
            </div>
          )}

          {currentStep === "theme" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-ink">Choose Default Theme</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  Select how your projected slides will look. You can customize per slide later.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: "classic-dark", name: "Classic Dark", preview: "bg-black" },
                  { id: "modern-gradient", name: "Modern Gradient", preview: "bg-gradient-to-br from-[#0f0c29] via-[#302b63] to-[#24243e]" },
                  { id: "midnight-blue", name: "Midnight Blue", preview: "bg-gradient-to-b from-[#000428] to-[#004e92]" },
                  { id: "sunrise-gold", name: "Sunrise Gold", preview: "bg-gradient-to-br from-[#0c0c1d] via-[#1a1a2e] to-[#16213e]" },
                ].map((theme) => (
                  <button
                    key={theme.id}
                    onClick={() => setSelectedTemplate(theme.id)}
                    className={`overflow-hidden rounded-xl border transition-all ${
                      selectedTemplate === theme.id
                        ? "border-primary ring-2 ring-primary/30"
                        : "border-line hover:border-ink-faint"
                    }`}
                  >
                    <div className={`aspect-video ${theme.preview} flex items-center justify-center`}>
                      <p className="text-xs font-semibold text-white" style={{ textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>
                        Sample Text
                      </p>
                    </div>
                    <div className="bg-surface-3 p-2 text-center text-[11px] font-medium text-ink-muted">
                      {theme.name}
                    </div>
                  </button>
                ))}
              </div>
              <button
                onClick={nextStep}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-white transition-colors hover:bg-primary-bright"
              >
                Continue <ChevronRight className="size-4" />
              </button>
            </div>
          )}

          {currentStep === "ready" && (
            <div className="space-y-6 text-center">
              <div className="mx-auto grid size-20 place-items-center rounded-2xl bg-success/10">
                <CheckCircle2 className="size-10 text-success" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-ink">You're All Set!</h2>
                <p className="mt-2 text-sm text-ink-muted">
                  Your church is ready for Sunday. Everything has been downloaded
                  and configured for offline use.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-3">
                <div className="rounded-lg bg-surface-3 px-3 py-2 text-xs">
                  <span className="text-primary-bright">{selectedBibles.size}</span>
                  <span className="text-ink-faint"> Bible translations</span>
                </div>
                <div className="rounded-lg bg-surface-3 px-3 py-2 text-xs">
                  <span className="text-gold">642+</span>
                  <span className="text-ink-faint"> songs ready</span>
                </div>
                <div className="rounded-lg bg-surface-3 px-3 py-2 text-xs">
                  <span className="text-success">8</span>
                  <span className="text-ink-faint"> slide templates</span>
                </div>
              </div>
              <button
                onClick={onComplete}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-white transition-colors hover:bg-primary-bright"
              >
                Start Using WorshipHQ Media <ChevronRight className="size-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
