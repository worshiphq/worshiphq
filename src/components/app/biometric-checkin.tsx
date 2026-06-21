"use client";

import { useState } from "react";
import { Fingerprint, Loader2, X, UserCheck, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEFAULT_AGENT_URL } from "@/lib/biometric";

type State = "idle" | "connecting" | "scanning" | "matching" | "success" | "error" | "no-agent";

export function BiometricCheckInButton({
  sessionId,
  onCheckedIn,
}: {
  sessionId: string;
  onCheckedIn?: (name: string, message: string) => void;
}) {
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");
  const [memberName, setMemberName] = useState("");
  const [agentUrl, setAgentUrl] = useState(DEFAULT_AGENT_URL);

  async function handleScan() {
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
        setMessage("Scanner agent is running but no scanner connected. Plug in your USB fingerprint scanner.");
        return;
      }

      setState("scanning");
      setMessage("Place finger on the scanner...");

      const captureRes = await fetch(`${agentUrl}/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(30000),
      });

      if (!captureRes.ok) throw new Error("Failed to capture fingerprint");
      const capture = await captureRes.json();

      setState("matching");
      setMessage("Matching fingerprint...");

      const templatesRes = await fetch("/api/biometric/auth-options?format=all");
      if (!templatesRes.ok) throw new Error("Failed to load templates");
      const { templates } = await templatesRes.json();

      if (templates.length === 0) {
        throw new Error("No fingerprints registered yet. Register members first.");
      }

      const matchRes = await fetch(`${agentUrl}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          probe: capture.template,
          gallery: templates.map((t: { id: string; personId: string; personName: string; templateData: string; finger: string }) => ({
            id: t.id,
            personId: t.personId,
            personName: t.personName,
            templateData: t.templateData,
            finger: t.finger,
          })),
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!matchRes.ok) throw new Error("Matching failed");
      const match = await matchRes.json();

      if (!match.matched) {
        throw new Error("Fingerprint not recognized. Has this member registered their biometrics?");
      }

      setMessage("Recording check-in...");

      const checkinRes = await fetch("/api/biometric/auth-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId: match.personId, sessionId }),
      });

      const result = await checkinRes.json();

      if (result.ok) {
        setState("success");
        setMemberName(result.name);
        setMessage(result.message);
        onCheckedIn?.(result.name, result.message);
        setTimeout(() => setState("idle"), 3000);
      } else {
        throw new Error(result.message || "Check-in failed");
      }
    } catch (err: unknown) {
      if (state !== "no-agent") {
        setState("error");
        const msg = err instanceof Error ? err.message : "Scan failed";
        setMessage(msg);
      }
    }
  }

  if (state === "idle") {
    return (
      <Button variant="secondary" size="sm" onClick={handleScan} className="gap-1.5">
        <Fingerprint className="size-4" /> Fingerprint
      </Button>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" onClick={() => { if (state !== "scanning" && state !== "matching" && state !== "connecting") setState("idle"); }} />
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-2xl">
          <div className="text-center">
            {(state === "connecting" || state === "scanning" || state === "matching") && (
              <>
                <div className="mx-auto flex size-24 items-center justify-center rounded-full bg-brand/10 animate-pulse">
                  <Fingerprint className="size-12 text-brand" />
                </div>
                <h3 className="mt-4 font-display text-xl font-bold">
                  {state === "connecting" ? "Connecting..." : state === "scanning" ? "Scan fingerprint" : "Matching..."}
                </h3>
                <p className="mt-2 text-sm text-ink-muted">{message}</p>
                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-ink-faint">
                  <Loader2 className="size-4 animate-spin" /> {state === "matching" ? "Identifying member..." : "Waiting..."}
                </div>
                <Button size="sm" variant="secondary" className="mt-4" onClick={() => setState("idle")}>Cancel</Button>
              </>
            )}

            {state === "no-agent" && (
              <>
                <div className="mx-auto flex size-24 items-center justify-center rounded-full bg-warning/10">
                  <WifiOff className="size-12 text-warning" />
                </div>
                <h3 className="mt-4 font-display text-xl font-bold">Scanner not found</h3>
                <p className="mt-2 text-sm text-ink-muted">{message}</p>
                <p className="mt-2 text-xs text-ink-faint">
                  Run the scanner agent on this computer to use fingerprint check-in.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <label className="text-xs text-ink-faint">Agent:</label>
                  <input
                    value={agentUrl}
                    onChange={(e) => setAgentUrl(e.target.value)}
                    className="flex-1 rounded-lg border border-line bg-base px-2 py-1.5 font-mono text-xs"
                  />
                </div>
                <div className="mt-4 flex gap-2 justify-center">
                  <Button size="sm" variant="secondary" onClick={() => setState("idle")}>Close</Button>
                  <Button size="sm" onClick={handleScan}>
                    <Wifi className="size-4" /> Retry
                  </Button>
                </div>
              </>
            )}

            {state === "success" && (
              <>
                <div className="mx-auto flex size-24 items-center justify-center rounded-full bg-success/10">
                  <UserCheck className="size-12 text-success" />
                </div>
                <h3 className="mt-4 font-display text-xl font-bold text-success">{memberName}</h3>
                <p className="mt-2 text-sm text-ink-muted">{message}</p>
                <div className="mt-4 flex gap-2 justify-center">
                  <Button size="sm" onClick={() => setState("idle")}>Done</Button>
                  <Button size="sm" variant="secondary" onClick={handleScan}>
                    <Fingerprint className="size-4" /> Next person
                  </Button>
                </div>
              </>
            )}

            {state === "error" && (
              <>
                <div className="mx-auto flex size-24 items-center justify-center rounded-full bg-danger/10">
                  <X className="size-12 text-danger" />
                </div>
                <h3 className="mt-4 font-display text-xl font-bold text-danger">Not recognized</h3>
                <p className="mt-2 text-sm text-ink-muted">{message}</p>
                <div className="mt-4 flex gap-2 justify-center">
                  <Button size="sm" onClick={() => setState("idle")}>Close</Button>
                  <Button size="sm" variant="secondary" onClick={handleScan}>
                    <Fingerprint className="size-4" /> Try again
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
