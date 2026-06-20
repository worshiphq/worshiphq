"use client";

import { useRef, useState } from "react";
import { UploadCloud, X, KeyRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { ImageCropper } from "@/components/ui/image-cropper";
import { OtpInput } from "@/components/ui/otp-input";
import { updateProfile, changePassword, sendPasswordResetOtp, resetPasswordWithOtp } from "@/app/actions/settings";

export function AccountForm({
  name,
  email,
  role,
  photoUrl,
}: {
  name: string;
  email: string;
  role: string;
  photoUrl: string | null;
}) {
  const [photo, setPhoto] = useState(photoUrl ?? "");
  const [editing, setEditing] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLFormElement>(null);
  const { run } = useFeedback();

  // Forgot password flow states
  const [forgotMode, setForgotMode] = useState<"off" | "sending" | "code" | "newpw">("off");
  const [verificationId, setVerificationId] = useState("");

  function handlePhoto(files: FileList | null) {
    const file = files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setEditing(reader.result as string);
    reader.readAsDataURL(file);
  }

  function submitPassword() {
    const form = pwRef.current;
    if (!form) return;
    const fd = new FormData(form);
    run(
      async () => {
        const res = await changePassword(fd);
        if (!res?.ok) throw new Error(res?.error ?? "Couldn't change password");
        form.reset();
      },
      { pending: "Updating password…", success: "Password updated" },
    );
  }

  function startForgotPassword() {
    setForgotMode("sending");
    run(
      async () => {
        const res = await sendPasswordResetOtp();
        if (!res?.ok) throw new Error(res?.error ?? "Couldn't send code");
        setVerificationId(res.verificationId ?? "");
        setForgotMode("code");
      },
      { pending: "Sending code…", success: "Code sent to your phone" },
    );
  }

  function submitForgotReset(fd: FormData) {
    run(
      async () => {
        const res = await resetPasswordWithOtp(fd);
        if (!res?.ok) throw new Error(res?.error ?? "Couldn't reset password");
        setForgotMode("off");
      },
      { pending: "Resetting password…", success: "Password updated" },
    );
  }

  const input =
    "flex h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-sm focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Profile */}
      <Card className="p-6">
        <h3 className="font-display text-lg font-semibold">Your profile</h3>
        <p className="text-sm text-ink-muted">Signed in as <span className="font-medium text-ink">{role}</span>.</p>
        <form action={updateProfile} className="mt-5 space-y-4">
          <input type="hidden" name="photoUrl" value={photo} />
          <div className="flex items-center gap-4">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="" className="size-16 rounded-full object-cover ring-1 ring-line" />
            ) : (
              <span className="grid size-16 place-items-center rounded-full bg-surface-2 text-ink-faint"><UploadCloud className="size-6" /></span>
            )}
            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                {photo ? "Replace photo" : "Upload photo"}
              </Button>
              {photo && (
                <button type="button" onClick={() => setPhoto("")} className="flex items-center gap-1 text-xs text-danger hover:underline">
                  <X className="size-3" /> Remove
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { handlePhoto(e.target.files); e.target.value = ""; }} />
          </div>
          {editing && (
            <ImageCropper src={editing} onCancel={() => setEditing(null)} onConfirm={(d) => { setPhoto(d); setEditing(null); }} />
          )}
          <div>
            <Label htmlFor="name">Display name</Label>
            <Input id="name" name="name" defaultValue={name} required placeholder="e.g. Media Team" />
          </div>
          <div>
            <Label htmlFor="email">Login email</Label>
            <Input id="email" name="email" type="email" defaultValue={email} />
          </div>
          <SubmitButton successMessage="Profile saved">Save profile</SubmitButton>
        </form>
      </Card>

      {/* Password */}
      <Card className="p-6">
        <h3 className="font-display text-lg font-semibold">Change password</h3>
        <p className="text-sm text-ink-muted">Use at least 6 characters.</p>

        {forgotMode === "off" && (
          <>
            <form ref={pwRef} className="mt-5 space-y-4" onSubmit={(e) => { e.preventDefault(); submitPassword(); }}>
              <div>
                <Label htmlFor="current">Current password</Label>
                <input id="current" name="current" type="password" required className={input} />
              </div>
              <div>
                <Label htmlFor="next">New password</Label>
                <input id="next" name="next" type="password" required minLength={6} className={input} />
              </div>
              <Button type="submit">Update password</Button>
            </form>
            <button
              type="button"
              onClick={startForgotPassword}
              className="mt-4 flex items-center gap-1.5 text-sm text-primary-bright hover:underline"
            >
              <KeyRound className="size-3.5" />
              Forgot your current password?
            </button>
          </>
        )}

        {forgotMode === "sending" && (
          <div className="mt-5 flex items-center gap-3 text-sm text-ink-muted">
            <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Sending verification code to your phone…
          </div>
        )}

        {forgotMode === "code" && (
          <form
            className="mt-5 space-y-4"
            action={(fd) => {
              fd.set("verificationId", verificationId);
              submitForgotReset(fd);
            }}
          >
            <input type="hidden" name="verificationId" value={verificationId} />
            <p className="text-sm text-ink-muted">
              Enter the 6-digit code sent to your phone, then set a new password.
            </p>
            <OtpInput />
            <div>
              <Label htmlFor="forgotNext">New password</Label>
              <input id="forgotNext" name="next" type="password" required minLength={6} className={input} />
            </div>
            <div className="flex gap-2">
              <Button type="submit">Reset password</Button>
              <Button type="button" variant="ghost" onClick={() => setForgotMode("off")}>Cancel</Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
