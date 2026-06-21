"use client";

import { useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { Fingerprint, Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BiometricRegisterButton({
  personId,
  personName,
  isRegistered,
}: {
  personId: string;
  personName: string;
  isRegistered: boolean;
}) {
  const [state, setState] = useState<"idle" | "scanning" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  async function handleRegister() {
    setModalOpen(true);
    setState("scanning");
    setMessage("Requesting fingerprint scanner...");

    try {
      const optRes = await fetch("/api/biometric/register-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId }),
      });

      if (!optRes.ok) {
        const err = await optRes.json();
        throw new Error(err.error || "Failed to get registration options");
      }

      const { options } = await optRes.json();
      setMessage("Touch your fingerprint scanner now...");

      const credential = await startRegistration({ optionsJSON: options });

      setMessage("Verifying fingerprint...");

      const verifyRes = await fetch("/api/biometric/register-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personId,
          response: credential,
          challenge: options.challenge,
          deviceName: navigator.userAgent.includes("Windows")
            ? "Windows device"
            : navigator.userAgent.includes("Android")
              ? "Android device"
              : "Device",
        }),
      });

      if (!verifyRes.ok) {
        const err = await verifyRes.json();
        throw new Error(err.error || "Registration failed");
      }

      setState("success");
      setMessage(`Biometrics registered for ${personName}`);
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: unknown) {
      setState("error");
      const msg = err instanceof Error ? err.message : "Registration cancelled or failed";
      if (msg.includes("denied") || msg.includes("cancelled") || msg.includes("AbortError")) {
        setMessage("Fingerprint scan was cancelled. Try again when ready.");
      } else {
        setMessage(msg);
      }
    }
  }

  if (!modalOpen) {
    return (
      <Button
        variant={isRegistered ? "secondary" : "primary"}
        size="sm"
        onClick={handleRegister}
        className="gap-1.5"
      >
        <Fingerprint className="size-4" />
        {isRegistered ? "Re-register biometrics" : "Register biometrics"}
      </Button>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" onClick={() => { if (state !== "scanning") setModalOpen(false); }} />
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-2xl">
          <div className="text-center">
            {state === "scanning" && (
              <>
                <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-brand/10 animate-pulse">
                  <Fingerprint className="size-10 text-brand" />
                </div>
                <h3 className="mt-4 font-display text-lg font-bold">Register fingerprint</h3>
                <p className="mt-2 text-sm text-ink-muted">{message}</p>
                <p className="mt-1 text-xs text-ink-faint">Use your laptop, phone, or USB fingerprint scanner</p>
                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-ink-faint">
                  <Loader2 className="size-4 animate-spin" /> Waiting for scanner...
                </div>
                <Button size="sm" variant="secondary" className="mt-4" onClick={() => { setModalOpen(false); setState("idle"); }}>Cancel</Button>
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
                  <Button size="sm" onClick={() => { setModalOpen(false); setState("idle"); }}>Close</Button>
                  <Button size="sm" variant="secondary" onClick={handleRegister}>
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
