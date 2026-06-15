import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AlertCircle, ShieldCheck } from "lucide-react";
import { getSession } from "@/lib/auth";
import { startPhoneVerify, confirmPhoneVerify, signOut } from "@/app/actions/auth";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input, Label } from "@/components/ui/input";

export const metadata: Metadata = { title: "Verify your phone" };

export default async function VerifyPhonePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; dev?: string; sent?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  if (session.phoneVerified) redirect("/app");

  const { error, dev, sent } = await searchParams;
  const codeStage = Boolean(sent || dev);

  return (
    <div>
      <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary-bright">
        <ShieldCheck className="size-6" />
      </div>
      <h1 className="font-display text-3xl font-bold">Verify your phone</h1>
      <p className="mt-2 text-sm text-ink-muted">
        For security, {session.churchName} admins verify a phone number before continuing.
      </p>

      {dev && (
        <div className="mt-5 rounded-xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-gold">
          Demo mode (no SMS provider configured): your code is <strong>{dev}</strong>
        </div>
      )}
      {error && (
        <div className="mt-5 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {!codeStage ? (
        <form action={startPhoneVerify} className="mt-7 space-y-4">
          <div>
            <Label htmlFor="phone">Your phone number</Label>
            <Input id="phone" name="phone" type="tel" placeholder="024 000 0000" required />
          </div>
          <SubmitButton size="lg" className="w-full" pendingLabel="Sending code…">
            Send verification code
          </SubmitButton>
        </form>
      ) : (
        <>
          <form action={confirmPhoneVerify} className="mt-7 space-y-4">
            <div>
              <Label htmlFor="code">Verification code</Label>
              <Input
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                maxLength={6}
                required
                className="text-center text-lg tracking-[0.4em]"
              />
            </div>
            <SubmitButton size="lg" className="w-full" pendingLabel="Verifying…">
              Verify &amp; continue
            </SubmitButton>
          </form>
          <a href="/verify-phone" className="mt-4 block text-center text-sm text-ink-muted hover:text-ink hover:underline">
            Use a different number
          </a>
        </>
      )}

      <form action={signOut} className="mt-6 text-center">
        <SubmitButton variant="ghost" size="sm" overlay={false}>
          Sign out
        </SubmitButton>
      </form>
    </div>
  );
}
