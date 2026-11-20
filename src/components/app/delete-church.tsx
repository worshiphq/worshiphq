"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Trash2, RotateCcw, LogOut } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { startChurchDeletion, confirmChurchDeletion, restoreChurch } from "@/app/actions/church-deletion";
import { signOut } from "@/app/actions/auth";

const PHRASE = "delete my app";
const inputCls = "h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm focus-visible:border-danger/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/25";

/** Settings, Church profile: the Main Admin's "Delete church" area. */
export function DeleteChurchCard({ churchName, hasPassword, recoveryDays }: { churchName: string; hasPassword: boolean; recoveryDays: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"confirm" | "code">("confirm");
  const [phrase, setPhrase] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [verificationId, setVerificationId] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [devCode, setDevCode] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const phraseOk = phrase.trim().toLowerCase() === PHRASE;

  function reset() {
    setStep("confirm"); setPhrase(""); setPassword(""); setCode(""); setVerificationId(""); setError(""); setDevCode(undefined);
  }

  async function sendCode() {
    setBusy(true); setError("");
    const r = await startChurchDeletion({ phrase, password });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setVerificationId(r.verificationId); setSentTo(r.sentTo); setDevCode(r.devCode); setStep("code");
  }

  async function confirm() {
    setBusy(true); setError("");
    const r = await confirmChurchDeletion({ verificationId, code });
    if (!r.ok) { setBusy(false); setError(r.error); return; }
    router.refresh();
  }

  return (
    <Card className="mt-6 border-danger/30 p-6">
      <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-danger"><AlertTriangle className="size-5" /> Delete church</h3>
      <p className="mt-1 text-sm text-ink-muted">
        Closes {churchName} for everyone on your team. It is kept for {recoveryDays} days in case you change your mind, then permanently deleted with all its members, giving, attendance and messages. Download your data first if you want a copy.
      </p>
      <Button variant="secondary" className="mt-4 border-danger/40 text-danger hover:bg-danger/10" onClick={() => { reset(); setOpen(true); }}>
        <Trash2 /> Delete church
      </Button>

      <Modal open={open} onClose={() => !busy && setOpen(false)} title="Delete your church" description={`${churchName} will close straight away and be permanently deleted after ${recoveryDays} days.`}>
        {step === "confirm" ? (
          <div className="space-y-4">
            <ul className="list-disc space-y-1 rounded-xl border border-danger/25 bg-danger/5 p-3 pl-7 text-sm text-ink-muted">
              <li>Everyone on your team loses access at once.</li>
              <li>Your plan stops renewing. Unused time and SMS credits are not refunded, except as our Refund Policy allows.</li>
              <li>You can restore it within {recoveryDays} days by signing in. After that it can&rsquo;t be recovered.</li>
            </ul>
            <div>
              <label className="mb-1 block text-sm font-medium">Type <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-danger">{PHRASE}</span> to continue</label>
              <input value={phrase} onChange={(e) => setPhrase(e.target.value)} className={inputCls} autoComplete="off" spellCheck={false} />
            </div>
            {hasPassword && (
              <div>
                <label className="mb-1 block text-sm font-medium">Your password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} autoComplete="current-password" />
              </div>
            )}
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button className="bg-danger text-white hover:bg-danger/90" onClick={sendCode} disabled={busy || !phraseOk || (hasPassword && !password)}>
                {busy ? <><Loader2 className="animate-spin" /> Sending code…</> : "Send me a code"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">We sent a 6-digit code to <span className="font-medium text-ink">{sentTo}</span>. Enter it to delete your church.</p>
            {devCode && <p className="text-xs text-ink-faint">Test mode code: {devCode}</p>}
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="123456" className={`${inputCls} text-center font-mono text-lg tracking-[0.4em]`} />
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex justify-between gap-2">
              <Button variant="secondary" onClick={() => { setStep("confirm"); setCode(""); setError(""); }} disabled={busy}>Back</Button>
              <Button className="bg-danger text-white hover:bg-danger/90" onClick={confirm} disabled={busy || code.length !== 6}>
                {busy ? <><Loader2 className="animate-spin" /> Deleting…</> : <><Trash2 /> Delete my church</>}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}

/** Shown instead of the app while a church waits to be deleted. */
export function ChurchClosingScreen({ churchName, deleteAfter, isOwner }: { churchName: string; deleteAfter: string | null; isOwner: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"restore" | "out" | null>(null);
  const [error, setError] = useState("");
  const when = deleteAfter ? new Date(deleteAfter).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null;

  async function restore() {
    setBusy("restore"); setError("");
    const r = await restoreChurch();
    if (!r.ok) { setBusy(null); setError(r.error); return; }
    router.refresh();
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-base px-4">
      <div className="max-w-md rounded-2xl border border-line bg-surface p-8 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-danger/10 text-danger"><Trash2 className="size-6" /></span>
        <h1 className="mt-4 font-display text-xl font-bold text-ink">{churchName} is scheduled for deletion</h1>
        <p className="mt-2 text-sm text-ink-muted">
          {isOwner
            ? <>It will be permanently deleted{when ? <> on <b className="text-ink">{when}</b></> : " soon"}. Changed your mind? Restore it now and everything will be just as you left it.</>
            : <>Your Main Admin closed this church account. It will be permanently deleted{when ? <> on <b className="text-ink">{when}</b></> : " soon"}. Please speak to them if this is a mistake.</>}
        </p>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {isOwner && (
            <Button onClick={restore} disabled={!!busy}>
              {busy === "restore" ? <><Loader2 className="animate-spin" /> Restoring…</> : <><RotateCcw /> Restore my church</>}
            </Button>
          )}
          <Button variant="secondary" disabled={!!busy} onClick={async () => { setBusy("out"); await signOut(); }}>
            {busy === "out" ? <><Loader2 className="animate-spin" /> Signing out…</> : <><LogOut /> Sign out</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
