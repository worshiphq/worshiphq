"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Fingerprint, Check, Loader2, X, Download, Hand } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const AGENT_URL = "http://localhost:23847";

/** Poll the agent a few times before deciding it's missing — a single-threaded
 *  agent can briefly block right after a scan, and one timeout shouldn't nuke
 *  the whole flow to "download installer". */
async function checkAgent(): Promise<{ connected: boolean } | null> {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`${AGENT_URL}/status`, { signal: AbortSignal.timeout(3000) });
      if (r.ok) return await r.json();
    } catch { /* retry */ }
    await new Promise((res) => setTimeout(res, 500));
  }
  return null;
}

const FINGERS = [
  { id: "left_thumb", label: "Thumb", hand: "Left" },
  { id: "left_index", label: "Index", hand: "Left" },
  { id: "left_middle", label: "Middle", hand: "Left" },
  { id: "left_ring", label: "Ring", hand: "Left" },
  { id: "left_little", label: "Little", hand: "Left" },
  { id: "right_thumb", label: "Thumb", hand: "Right" },
  { id: "right_index", label: "Index", hand: "Right" },
  { id: "right_middle", label: "Middle", hand: "Right" },
  { id: "right_ring", label: "Ring", hand: "Right" },
  { id: "right_little", label: "Little", hand: "Right" },
];
const fingerLabel = (id: string) => { const f = FINGERS.find((x) => x.id === id); return f ? `${f.hand} ${f.label.toLowerCase()}` : id; };

type State = "choose" | "connecting" | "scanning" | "saving" | "success" | "error" | "no-agent";

export function BiometricRegisterButton({ personId, personName, isRegistered }: {
  personId: string; personName: string; isRegistered: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<State>("choose");
  const [message, setMessage] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [registered, setRegistered] = useState<string[]>([]);
  const [finger, setFinger] = useState<string | null>(null);

  async function open() {
    setModalOpen(true);
    setState("choose");
    setFinger(null);
    try {
      const r = await fetch(`/api/biometric/register?personId=${personId}`).then((x) => x.json());
      setRegistered(r.fingers ?? []);
    } catch { setRegistered([]); }
  }

  async function startScan(fingerId: string) {
    setFinger(fingerId);
    setState("connecting");
    setMessage("Looking for fingerprint scanner...");
    try {
      const status = await checkAgent();
      if (!status) { setState("no-agent"); return; }
      if (!status.connected) { setState("error"); setMessage("Scanner running but no reader detected. Plug it in and try again."); return; }

      setState("scanning");
      setMessage(`Place ${personName}'s ${fingerLabel(fingerId).toLowerCase()} on the scanner...`);
      const captureRes = await fetch(`${AGENT_URL}/capture`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal: AbortSignal.timeout(30000),
      });
      if (!captureRes.ok) throw new Error("Failed to capture fingerprint");
      const capture = await captureRes.json();
      if (capture.error) throw new Error(capture.error);

      setState("saving");
      setMessage("Saving fingerprint...");
      const saveRes = await fetch("/api/biometric/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personId, finger: fingerId, templateData: capture.template,
          quality: capture.quality ?? 0, format: capture.format ?? "raw", deviceName: capture.scanner ?? "USB Scanner",
        }),
      });
      const result = await saveRes.json();
      if (!saveRes.ok || !result.ok) throw new Error(result.error || "Failed to save");

      setRegistered((prev) => [...new Set([...prev, fingerId])]);
      setState("success");
      setMessage(`${fingerLabel(fingerId)} saved for ${personName}.`);
      // NOTE: no router.refresh() here — it re-renders the person panel and
      // closes this modal. We stay put so more fingers can be added; the data
      // syncs when the modal is closed.
    } catch (err: unknown) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Registration failed");
    }
  }

  function close() { setModalOpen(false); setState("choose"); router.refresh(); }

  if (!modalOpen) {
    return (
      <Button variant={isRegistered ? "secondary" : "primary"} size="sm" onClick={open} className="gap-1.5">
        <Fingerprint className="size-4" />
        {isRegistered ? "Manage fingerprints" : "Register fingerprint"}
      </Button>
    );
  }

  const busy = state === "connecting" || state === "scanning" || state === "saving";

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" onClick={() => { if (!busy) close(); }} />
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl">
          {state === "choose" && (
            <div>
              <div className="mb-1 flex items-center gap-2">
                <Hand className="size-5 text-primary" />
                <h3 className="font-display text-lg font-bold">Which finger?</h3>
              </div>
              <p className="mb-4 text-sm text-ink-muted">Pick a finger for <b>{personName}</b>, then they place it on the reader. You can add several.</p>
              <div className="grid grid-cols-2 gap-4">
                {["Left", "Right"].map((hand) => (
                  <div key={hand}>
                    <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">{hand} hand</div>
                    <div className="space-y-1.5">
                      {FINGERS.filter((f) => f.hand === hand).map((f) => {
                        const done = registered.includes(f.id);
                        return (
                          <button key={f.id} onClick={() => startScan(f.id)}
                            className={cn("flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors",
                              done ? "border-success/40 bg-success/5" : "border-line hover:border-primary/40 hover:bg-surface-2")}>
                            <span>{f.label}</span>
                            {done ? <span className="flex items-center gap-1 text-xs font-medium text-success"><Check className="size-3.5" /> saved</span>
                                  : <Fingerprint className="size-4 text-ink-faint" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-between">
                <span className="text-xs text-ink-faint">{registered.length} finger{registered.length === 1 ? "" : "s"} on file</span>
                <Button size="sm" variant="secondary" onClick={close}>Done</Button>
              </div>
            </div>
          )}

          {(state === "connecting" || state === "scanning" || state === "saving") && (
            <div className="text-center">
              <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-brand/10 animate-pulse">
                <Fingerprint className="size-10 text-brand" />
              </div>
              <h3 className="mt-4 font-display text-lg font-bold">
                {state === "connecting" ? "Connecting to scanner..." : state === "scanning" ? "Scan fingerprint" : "Saving..."}
              </h3>
              <p className="mt-2 text-sm text-ink-muted">{message}</p>
              <div className="mt-3 flex items-center justify-center gap-2 text-xs text-ink-faint"><Loader2 className="size-4 animate-spin" /> Please wait…</div>
              {state === "scanning" && <Button size="sm" variant="secondary" className="mt-4" onClick={() => setState("choose")}>Cancel</Button>}
            </div>
          )}

          {state === "success" && (
            <div className="text-center">
              <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-success/10"><Check className="size-10 text-success" /></div>
              <h3 className="mt-4 font-display text-lg font-bold text-success">Saved!</h3>
              <p className="mt-2 text-sm text-ink-muted">{message}</p>
              <div className="mt-4 flex justify-center gap-2">
                <Button size="sm" onClick={() => setState("choose")}>Add another finger</Button>
                <Button size="sm" variant="secondary" onClick={close}>Done</Button>
              </div>
            </div>
          )}

          {state === "no-agent" && (
            <div className="text-center">
              <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-warning/10"><Fingerprint className="size-10 text-warning" /></div>
              <h3 className="mt-4 font-display text-lg font-bold">One-time scanner setup</h3>
              <p className="mt-2 text-sm text-ink-muted">Download and double-click the installer, then plug in your USB reader.</p>
              <a href="/scanner-agent/whq-scanner-setup.bat" download className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand/90">
                <Download className="size-4" /> Download 1-click installer (Windows)
              </a>
              <p className="mt-3 text-[11px] text-ink-faint">Remove it later with the <a href="/scanner-agent/whq-scanner-uninstall.bat" download className="underline">uninstaller</a>.</p>
              <div className="mt-4 flex justify-center gap-2">
                <Button size="sm" variant="secondary" onClick={close}>Close</Button>
                <Button size="sm" onClick={() => setState("choose")}>Back</Button>
              </div>
            </div>
          )}

          {state === "error" && (
            <div className="text-center">
              <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-danger/10"><X className="size-10 text-danger" /></div>
              <h3 className="mt-4 font-display text-lg font-bold text-danger">Couldn't save</h3>
              <p className="mt-2 text-sm text-ink-muted">{message}</p>
              <div className="mt-4 flex justify-center gap-2">
                <Button size="sm" onClick={() => setState("choose")}>Back</Button>
                {finger && <Button size="sm" variant="secondary" onClick={() => startScan(finger)}>Try again</Button>}
              </div>
            </div>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
