"use client";

import { useState } from "react";
import { Fingerprint, Check, Loader2, X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

const AGENT_URL = "http://localhost:23847";

export function BiometricRegisterButton({
  personId,
  personName,
  isRegistered,
}: {
  personId: string;
  personName: string;
  isRegistered: boolean;
}) {
  const [state, setState] = useState<"idle" | "connecting" | "scanning" | "saving" | "success" | "error" | "no-agent">("idle");
  const [message, setMessage] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  async function handleRegister() {
    setModalOpen(true);
    setState("connecting");
    setMessage("Looking for fingerprint scanner...");

    try {
      const statusRes = await fetch(`${AGENT_URL}/status`, { signal: AbortSignal.timeout(2000) }).catch(() => null);

      if (!statusRes || !statusRes.ok) {
        setState("no-agent");
        return;
      }

      const status = await statusRes.json();
      if (!status.connected) {
        setState("error");
        setMessage("Scanner agent is running but no USB scanner detected. Plug in your fingerprint scanner and try again.");
        return;
      }

      setState("scanning");
      setMessage(`Place ${personName}'s finger on the scanner...`);

      const captureRes = await fetch(`${AGENT_URL}/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(30000),
      });

      if (!captureRes.ok) throw new Error("Failed to capture fingerprint");
      const capture = await captureRes.json();
      if (capture.error) throw new Error(capture.error);

      setState("saving");
      setMessage("Saving fingerprint...");

      const saveRes = await fetch("/api/biometric/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personId,
          templateData: capture.template,
          quality: capture.quality ?? 0,
          format: capture.format ?? "raw",
          deviceName: capture.scanner ?? "USB Scanner",
        }),
      });

      const result = await saveRes.json();
      if (!saveRes.ok || !result.ok) throw new Error(result.error || "Failed to save");

      setState("success");
      setMessage(`Fingerprint registered for ${personName}`);
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: unknown) {
      if (state !== "no-agent") {
        setState("error");
        setMessage(err instanceof Error ? err.message : "Registration failed");
      }
    }
  }

  function close() { setModalOpen(false); setState("idle"); }

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
        <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-2xl">
          <div className="text-center">
            {state === "connecting" && (
              <>
                <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-brand/10 animate-pulse">
                  <Fingerprint className="size-10 text-brand" />
                </div>
                <h3 className="mt-4 font-display text-lg font-bold">Connecting to scanner...</h3>
                <Loader2 className="mx-auto mt-3 size-5 animate-spin text-ink-faint" />
              </>
            )}

            {state === "no-agent" && (
              <>
                <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-warning/10">
                  <Fingerprint className="size-10 text-warning" />
                </div>
                <h3 className="mt-4 font-display text-lg font-bold">Fingerprint scanner needed</h3>
                <p className="mt-2 text-sm text-ink-muted">
                  Plug in a USB fingerprint scanner and install the WorshipHQ scanner agent on this computer.
                </p>
                <a
                  href="/scanner-agent/whq-scanner-agent.py"
                  download
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand/90 transition-colors"
                >
                  <Download className="size-4" /> Download scanner agent
                </a>
                <p className="mt-3 text-xs text-ink-faint">
                  Run once: <code className="rounded bg-surface-2 px-1 py-0.5">python whq-scanner-agent.py --install</code>
                </p>
                <div className="mt-4 flex gap-2 justify-center">
                  <Button size="sm" variant="secondary" onClick={close}>Close</Button>
                  <Button size="sm" onClick={handleRegister}>Retry</Button>
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
                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-ink-faint">
                  <Loader2 className="size-4 animate-spin" /> Waiting for fingerprint...
                </div>
                <Button size="sm" variant="secondary" className="mt-4" onClick={close}>Cancel</Button>
              </>
            )}

            {state === "saving" && (
              <>
                <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-brand/10 animate-pulse">
                  <Fingerprint className="size-10 text-brand" />
                </div>
                <h3 className="mt-4 font-display text-lg font-bold">Saving fingerprint...</h3>
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
          </div>
        </div>
      </div>
    </>
  );
}
