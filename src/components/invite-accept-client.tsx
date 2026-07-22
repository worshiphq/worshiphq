"use client";

import { useActionState, useRef, useState } from "react";
import { Camera, ShieldCheck, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { OtpInput } from "@/components/ui/otp-input";
import { useFeedback } from "@/components/ui/feedback";
import { sendInviteCode, acceptInvite } from "@/app/actions/invite";
import { ChurchLogo } from "@/components/app/church-logo";

type AcceptState = { ok: false; error: string } | null;

export function InviteAcceptClient({
  token,
  name: initialName,
  churchName,
  churchLogo,
  role,
  phoneMasked,
}: {
  token: string;
  name: string;
  churchName: string;
  churchLogo: string | null;
  role: string;
  phoneMasked: string;
}) {
  const { toast } = useFeedback();
  const [name, setName] = useState(initialName);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [verificationId, setVerificationId] = useState("");
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [state, formAction, pending] = useActionState(
    async (_prev: AcceptState, fd: FormData): Promise<AcceptState> => acceptInvite(fd),
    null,
  );

  function handlePhoto(files: FileList | null) {
    const file = files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      // Downscale to a small square so the stored data URL stays light.
      const img = new Image();
      img.onload = () => {
        const size = 256;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return setPhoto(reader.result as string);
        const min = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, size, size);
        setPhoto(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  async function requestCode() {
    setSending(true);
    const res = await sendInviteCode(token);
    setSending(false);
    if (!res.ok) return toast(res.error, "error");
    setVerificationId(res.verificationId);
    toast(res.devCode ? `Dev code: ${res.devCode}` : `Code sent to ${phoneMasked}`, "success");
  }

  const passwordsOk = password.length >= 6 && password === confirm;
  const canSubmit = name.trim() && passwordsOk && verificationId && code.length === 6 && !pending;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 flex flex-col items-center text-center">
        <ChurchLogo logo={churchLogo} name={churchName} />
        <h1 className="mt-4 font-display text-2xl font-bold">You&rsquo;re invited to {churchName}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Joining as <span className="font-semibold text-ink">{role}</span>. Set up your account to get started.
        </p>
      </div>

      <Card className="p-6">
        <form action={formAction} className="space-y-5">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="verificationId" value={verificationId} />
          <input type="hidden" name="photoUrl" value={photo ?? ""} />

          {/* Profile photo */}
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="group relative grid size-24 place-items-center overflow-hidden rounded-full border border-line bg-surface-2"
            >
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="Your photo" className="size-full object-cover" />
              ) : (
                <Camera className="size-7 text-ink-faint" />
              )}
              <span className="absolute inset-x-0 bottom-0 bg-black/50 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                {photo ? "Change" : "Add photo"}
              </span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => handlePhoto(e.target.files)} />
            <span className="text-xs text-ink-faint">Profile picture (optional)</span>
          </div>

          <div>
            <Label>Your name</Label>
            <Input name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" required />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Password</Label>
              <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" name="password" />
            </div>
            <div>
              <Label>Confirm</Label>
              <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat password" />
            </div>
          </div>
          {confirm.length > 0 && password !== confirm && (
            <p className="-mt-2 text-xs text-danger">Passwords don&rsquo;t match.</p>
          )}

          {/* Phone verification */}
          <div className="rounded-xl border border-line bg-surface-2/40 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="size-4 text-primary" /> Verify your number
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              We&rsquo;ll text a 6-digit code to <span className="font-medium text-ink">{phoneMasked}</span> to confirm it&rsquo;s you.
            </p>
            {!verificationId ? (
              <Button type="button" size="sm" variant="secondary" className="mt-3" onClick={requestCode} disabled={sending}>
                {sending ? <><Loader2 className="mr-1.5 size-3.5 animate-spin" /> Sending…</> : "Text me the code"}
              </Button>
            ) : (
              <div className="mt-3 space-y-2">
                <OtpInput onChange={setCode} />
                <button type="button" onClick={requestCode} disabled={sending} className="text-xs text-primary hover:underline">
                  Resend code
                </button>
              </div>
            )}
          </div>

          {state?.error && <p className="text-sm text-danger">{state.error}</p>}

          <Button type="submit" className="w-full" disabled={!canSubmit}>
            {pending ? <><Loader2 className="mr-2 size-4 animate-spin" /> Setting up…</> : "Accept invite & continue"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
