"use client";

import { useRef, useState } from "react";
import { UploadCloud, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { ImageCropper } from "@/components/ui/image-cropper";
import { updateProfile, changePassword } from "@/app/actions/settings";

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
      </Card>
    </div>
  );
}
