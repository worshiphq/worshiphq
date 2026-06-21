"use client";

import { useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { Fingerprint, Check, Loader2, X, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BiometricCheckInButton({
  sessionId,
  onCheckedIn,
}: {
  sessionId: string;
  onCheckedIn?: (name: string, message: string) => void;
}) {
  const [state, setState] = useState<"idle" | "scanning" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [memberName, setMemberName] = useState("");

  async function handleScan() {
    setState("scanning");
    setMessage("Requesting fingerprint scanner...");

    try {
      const optRes = await fetch("/api/biometric/auth-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!optRes.ok) throw new Error("Failed to get authentication options");

      const { options } = await optRes.json();
      setMessage("Touch the fingerprint scanner now...");

      const credential = await startAuthentication({ optionsJSON: options });

      setMessage("Verifying identity...");

      const verifyRes = await fetch("/api/biometric/auth-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          response: credential,
          challenge: options.challenge,
          sessionId,
        }),
      });

      const result = await verifyRes.json();

      if (result.ok) {
        setState("success");
        setMemberName(result.name);
        setMessage(result.message);
        onCheckedIn?.(result.name, result.message);
        setTimeout(() => setState("idle"), 3000);
      } else {
        setState("error");
        setMessage(result.message || "Fingerprint not recognized");
      }
    } catch (err: unknown) {
      setState("error");
      const msg = err instanceof Error ? err.message : "Scan cancelled";
      if (msg.includes("denied") || msg.includes("cancelled") || msg.includes("AbortError")) {
        setMessage("Scan cancelled. Try again when ready.");
      } else {
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
      <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" onClick={() => { if (state !== "scanning") setState("idle"); }} />
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-2xl">
          <div className="text-center">
            {state === "scanning" && (
              <>
                <div className="mx-auto flex size-24 items-center justify-center rounded-full bg-brand/10 animate-pulse">
                  <Fingerprint className="size-12 text-brand" />
                </div>
                <h3 className="mt-4 font-display text-xl font-bold">Scan fingerprint</h3>
                <p className="mt-2 text-sm text-ink-muted">{message}</p>
                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-ink-faint">
                  <Loader2 className="size-4 animate-spin" /> Waiting...
                </div>
                <Button size="sm" variant="secondary" className="mt-4" onClick={() => setState("idle")}>Cancel</Button>
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
