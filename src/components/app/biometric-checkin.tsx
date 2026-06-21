"use client";

import { useState } from "react";
import { Fingerprint, Loader2, X, UserCheck, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

const AGENT_URL = "http://localhost:23847";

export function BiometricCheckInButton({
  sessionId,
  onCheckedIn,
}: {
  sessionId: string;
  onCheckedIn?: (name: string, message: string) => void;
}) {
  const [state, setState] = useState<"idle" | "connecting" | "scanning" | "matching" | "success" | "error" | "no-agent">("idle");
  const [message, setMessage] = useState("");
  const [memberName, setMemberName] = useState("");

  async function handleScan() {
    setState("connecting");
    setMessage("Looking for scanner...");

    try {
      const statusRes = await fetch(`${AGENT_URL}/status`, { signal: AbortSignal.timeout(2000) }).catch(() => null);

      if (!statusRes || !statusRes.ok) {
        setState("no-agent");
        return;
      }

      const status = await statusRes.json();
      if (!status.connected) {
        setState("error");
        setMessage("No USB scanner detected. Plug in your fingerprint scanner and try again.");
        return;
      }

      setState("scanning");
      setMessage("Place finger on the scanner...");

      const captureRes = await fetch(`${AGENT_URL}/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(30000),
      });

      if (!captureRes.ok) throw new Error("Failed to capture fingerprint");
      const capture = await captureRes.json();
      if (capture.error) throw new Error(capture.error);

      setState("matching");
      setMessage("Identifying member...");

      // Download all templates and match locally via agent
      const templatesRes = await fetch("/api/biometric/templates");
      if (!templatesRes.ok) throw new Error("Failed to load fingerprint data");
      const { templates } = await templatesRes.json();

      if (templates.length === 0) {
        throw new Error("No fingerprints registered yet. Register members first from the People page.");
      }

      const matchRes = await fetch(`${AGENT_URL}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ probe: capture.template, gallery: templates }),
        signal: AbortSignal.timeout(15000),
      });

      if (!matchRes.ok) throw new Error("Matching failed");
      const match = await matchRes.json();

      if (!match.matched) {
        throw new Error("Fingerprint not recognized. Has this member registered their biometrics?");
      }

      setMessage("Recording check-in...");

      const checkinRes = await fetch("/api/biometric/checkin", {
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
        setMessage(err instanceof Error ? err.message : "Scan failed");
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
      <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" onClick={() => { if (!["scanning", "matching", "connecting"].includes(state)) setState("idle"); }} />
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-2xl">
          <div className="text-center">
            {["connecting", "scanning", "matching"].includes(state) && (
              <>
                <div className="mx-auto flex size-24 items-center justify-center rounded-full bg-brand/10 animate-pulse">
                  <Fingerprint className="size-12 text-brand" />
                </div>
                <h3 className="mt-4 font-display text-xl font-bold">
                  {state === "connecting" ? "Connecting..." : state === "scanning" ? "Scan fingerprint" : "Identifying..."}
                </h3>
                <p className="mt-2 text-sm text-ink-muted">{message}</p>
                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-ink-faint">
                  <Loader2 className="size-4 animate-spin" /> {state === "matching" ? "Matching fingerprint..." : "Waiting..."}
                </div>
                <Button size="sm" variant="secondary" className="mt-4" onClick={() => setState("idle")}>Cancel</Button>
              </>
            )}

            {state === "no-agent" && (
              <>
                <div className="mx-auto flex size-24 items-center justify-center rounded-full bg-warning/10">
                  <Fingerprint className="size-12 text-warning" />
                </div>
                <h3 className="mt-4 font-display text-xl font-bold">Scanner not found</h3>
                <p className="mt-2 text-sm text-ink-muted">
                  Install the WorshipHQ scanner agent and plug in a USB fingerprint scanner.
                </p>
                <a
                  href="/scanner-agent/whq-scanner-agent.py"
                  download
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand/90 transition-colors"
                >
                  <Download className="size-4" /> Download scanner agent
                </a>
                <div className="mt-4 flex gap-2 justify-center">
                  <Button size="sm" variant="secondary" onClick={() => setState("idle")}>Close</Button>
                  <Button size="sm" onClick={handleScan}>Retry</Button>
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
