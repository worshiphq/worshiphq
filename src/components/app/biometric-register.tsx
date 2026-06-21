"use client";

import { useState } from "react";
import { Fingerprint, Check, Loader2, X, Wifi, WifiOff, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEFAULT_AGENT_URL, FINGER_OPTIONS } from "@/lib/biometric";

type State = "idle" | "connecting" | "scanning" | "saving" | "success" | "error" | "no-agent";

export function BiometricRegisterButton({
  personId,
  personName,
  isRegistered,
}: {
  personId: string;
  personName: string;
  isRegistered: boolean;
}) {
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [finger, setFinger] = useState("right_thumb");
  const [agentUrl, setAgentUrl] = useState(DEFAULT_AGENT_URL);

  async function handleRegister() {
    setModalOpen(true);
    setState("connecting");
    setMessage("Connecting to fingerprint scanner...");

    try {
      const statusRes = await fetch(`${agentUrl}/status`, { signal: AbortSignal.timeout(3000) }).catch(() => null);

      if (!statusRes || !statusRes.ok) {
        setState("no-agent");
        setMessage("Could not connect to the fingerprint scanner agent.");
        return;
      }

      const status = await statusRes.json();
      if (!status.connected) {
        setState("error");
        setMessage("Scanner agent is running but no scanner is connected. Plug in your USB fingerprint scanner.");
        return;
      }

      setState("scanning");
      setMessage(`Place ${personName}'s ${FINGER_OPTIONS.find((f) => f.value === finger)?.label ?? finger} on the scanner...`);

      const captureRes = await fetch(`${agentUrl}/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finger }),
        signal: AbortSignal.timeout(30000),
      });

      if (!captureRes.ok) {
        const err = await captureRes.json().catch(() => ({ error: "Capture failed" }));
        throw new Error(err.error || "Failed to capture fingerprint");
      }

      const capture = await captureRes.json();

      setState("saving");
      setMessage("Saving fingerprint to server...");

      const saveRes = await fetch("/api/biometric/register-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personId,
          templateData: capture.template,
          finger,
          quality: capture.quality ?? 0,
          format: capture.format ?? "raw",
          deviceName: capture.scanner ?? "USB Scanner",
        }),
      });

      const result = await saveRes.json();
      if (!saveRes.ok || !result.ok) throw new Error(result.error || "Failed to save fingerprint");

      setState("success");
      setMessage(`Fingerprint registered for ${personName}`);
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: unknown) {
      if (state !== "no-agent") {
        setState("error");
        const msg = err instanceof Error ? err.message : "Registration failed";
        setMessage(msg);
      }
    }
  }

  function close() {
    setModalOpen(false);
    setState("idle");
  }

  if (!modalOpen) {
    return (
      <Button variant={isRegistered ? "secondary" : "primary"} size="sm" onClick={handleRegister} className="gap-1.5">
        <Fingerprint className="size-4" />
        {isRegistered ? "Re-register biometrics" : "Register biometrics"}
      </Button>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" onClick={() => { if (state !== "scanning" && state !== "saving") close(); }} />
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 shadow-2xl">
          <div className="text-center">
            {state === "connecting" && (
              <>
                <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-brand/10 animate-pulse">
                  <Wifi className="size-10 text-brand" />
                </div>
                <h3 className="mt-4 font-display text-lg font-bold">Connecting to scanner</h3>
                <p className="mt-2 text-sm text-ink-muted">{message}</p>
                <Loader2 className="mx-auto mt-3 size-5 animate-spin text-ink-faint" />
              </>
            )}

            {state === "no-agent" && (
              <>
                <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-warning/10">
                  <WifiOff className="size-10 text-warning" />
                </div>
                <h3 className="mt-4 font-display text-lg font-bold">Scanner agent not found</h3>
                <p className="mt-2 text-sm text-ink-muted">
                  The fingerprint scanner agent must be running on this computer.
                </p>
                <div className="mx-auto mt-4 max-w-xs rounded-xl border border-line bg-base p-4 text-left">
                  <p className="text-xs font-semibold text-ink">Setup instructions:</p>
                  <ol className="mt-2 space-y-1 text-xs text-ink-muted">
                    <li>1. Download the scanner agent from your admin dashboard</li>
                    <li>2. Install and connect your USB fingerprint scanner</li>
                    <li>3. Run the agent: <code className="rounded bg-surface-2 px-1">python whq-scanner-agent.py</code></li>
                    <li>4. Try registration again</li>
                  </ol>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <label className="text-xs text-ink-faint">Agent URL:</label>
                  <input
                    value={agentUrl}
                    onChange={(e) => setAgentUrl(e.target.value)}
                    className="flex-1 rounded-lg border border-line bg-base px-2 py-1.5 font-mono text-xs"
                  />
                </div>
                <div className="mt-4 flex gap-2 justify-center">
                  <Button size="sm" variant="secondary" onClick={close}>Close</Button>
                  <Button size="sm" onClick={handleRegister}>
                    <Wifi className="size-4" /> Retry
                  </Button>
                </div>
              </>
            )}

            {state === "scanning" && (
              <>
                <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-brand/10 animate-pulse">
                  <Fingerprint className="size-10 text-brand" />
                </div>
                <h3 className="mt-4 font-display text-lg font-bold">Scan fingerprint</h3>
                <p className="mt-2 text-sm text-ink-muted">{message}</p>
                <div className="mx-auto mt-3 flex items-center justify-center gap-2">
                  <label className="text-xs text-ink-faint">Finger:</label>
                  <select
                    value={finger}
                    onChange={(e) => setFinger(e.target.value)}
                    className="rounded-lg border border-line bg-base px-2 py-1 text-xs"
                    disabled
                  >
                    {FINGER_OPTIONS.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-ink-faint">
                  <Loader2 className="size-4 animate-spin" /> Waiting for fingerprint...
                </div>
                <Button size="sm" variant="secondary" className="mt-4" onClick={close}>Cancel</Button>
              </>
            )}

            {state === "saving" && (
              <>
                <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-brand/10 animate-pulse">
                  <Monitor className="size-10 text-brand" />
                </div>
                <h3 className="mt-4 font-display text-lg font-bold">Saving to server</h3>
                <p className="mt-2 text-sm text-ink-muted">{message}</p>
                <Loader2 className="mx-auto mt-3 size-5 animate-spin text-ink-faint" />
              </>
            )}

            {state === "success" && (
              <>
                <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-success/10">
                  <Check className="size-10 text-success" />
                </div>
                <h3 className="mt-4 font-display text-lg font-bold text-success">Biometrics registered!</h3>
                <p className="mt-2 text-sm text-ink-muted">{message}</p>
              </>
            )}

            {state === "error" && (
              <>
                <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-danger/10">
                  <X className="size-10 text-danger" />
                </div>
                <h3 className="mt-4 font-display text-lg font-bold text-danger">Registration failed</h3>
                <p className="mt-2 text-sm text-ink-muted">{message}</p>
                <div className="mt-4 flex gap-2 justify-center">
                  <Button size="sm" onClick={close}>Close</Button>
                  <Button size="sm" variant="secondary" onClick={handleRegister}>Try again</Button>
                </div>
              </>
            )}

            {/* Finger selector — show before scanning starts */}
            {(state === "connecting" || state === "idle") && (
              <div className="mt-4 flex items-center justify-center gap-2">
                <label className="text-xs text-ink-faint">Finger:</label>
                <select
                  value={finger}
                  onChange={(e) => setFinger(e.target.value)}
                  className="rounded-lg border border-line bg-base px-2 py-1 text-xs"
                >
                  {FINGER_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
