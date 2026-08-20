import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, Eye, KeyRound, ArrowLeft, ShieldCheck, CheckCircle2, Mail, Smartphone } from "lucide-react";
import {
  signIn,
  sendLoginCode,
  completeSignIn,
  resendLoginOtp,
  enterDemo,
  startPasswordReset,
  verifyResetCode,
} from "@/app/actions/auth";
import { getLoginChoices } from "@/lib/auth";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input, Label } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { OtpInput } from "@/components/ui/otp-input";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = { title: "Log in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    reset?: string;
    via?: string;
    login?: string;
    dev?: string;
    resent?: string;
  }>;
}) {
  const { error, reset, via, login, dev, resent } = await searchParams;

  // ── Login step 2a: choose where the code is sent ──
  if (login === "choose") {
    const choices = await getLoginChoices();
    if (!choices) redirect("/sign-in?error=expired");
    return (
      <div>
        <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary-bright">
          <ShieldCheck className="size-6" />
        </div>
        <h1 className="font-display text-2xl font-bold">Where should we send your code?</h1>
        <p className="mt-2 text-sm text-ink-muted">Pick how you&rsquo;d like to receive your one-time login code.</p>

        {error === "send" && (
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            <AlertCircle className="size-4 shrink-0" /> We couldn&rsquo;t send it there. Try the other option.
          </div>
        )}
        {error === "no-phone" && (
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            <AlertCircle className="size-4 shrink-0" /> No verified phone on this account — use email.
          </div>
        )}

        <div className="mt-6 space-y-3">
          <form action={sendLoginCode}>
            <input type="hidden" name="channel" value="email" />
            <SubmitButton variant="secondary" size="lg" className="w-full !justify-start gap-3" pendingLabel="Sending…">
              <Mail className="size-5 text-primary-bright" />
              <span className="flex-1 text-left">Email me a code<span className="block text-xs font-normal text-ink-faint">{choices.email}</span></span>
            </SubmitButton>
          </form>
          {choices.phone && (
            <form action={sendLoginCode}>
              <input type="hidden" name="channel" value="sms" />
              <SubmitButton variant="secondary" size="lg" className="w-full !justify-start gap-3" pendingLabel="Sending…">
                <Smartphone className="size-5 text-primary-bright" />
                <span className="flex-1 text-left">Text me a code<span className="block text-xs font-normal text-ink-faint">{choices.phone}</span></span>
              </SubmitButton>
            </form>
          )}
        </div>

        <Link href="/sign-in" className="mt-5 flex items-center justify-center gap-1.5 text-sm text-ink-muted hover:text-ink">
          <ArrowLeft className="size-3.5" /> Back to login
        </Link>
      </div>
    );
  }

  // ── Login step 2b: two-factor code entry ──
  if (login === "verify") {
    const viaEmail = via === "email";
    return (
      <div>
        <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary-bright">
          <ShieldCheck className="size-6" />
        </div>
        <h1 className="font-display text-2xl font-bold">Verify it&rsquo;s you</h1>
        <p className="mt-2 text-sm text-ink-muted">
          We sent a 6-digit code to your {viaEmail ? "email" : "phone"}. Enter it to finish logging in.
        </p>

        {resent && (
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
            <CheckCircle2 className="size-4 shrink-0" /> A new code is on its way.
          </div>
        )}
        {error === "invalid-code" && (
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            <AlertCircle className="size-4 shrink-0" /> Incorrect or expired code. Please try again.
          </div>
        )}
        {dev && (
          <div className="mt-5 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary-bright">
            Test mode code: <span className="font-mono font-bold">{dev}</span>
          </div>
        )}

        <form action={completeSignIn} className="mt-7 space-y-6">
          <input type="hidden" name="via" value={viaEmail ? "email" : "phone"} />
          <OtpInput />
          <SubmitButton size="lg" className="w-full" pendingLabel="Verifying...">
            Verify &amp; log in
          </SubmitButton>
        </form>

        <div className="mt-5 flex items-center justify-center gap-4 text-sm">
          <form action={resendLoginOtp}>
            <button type="submit" className="text-ink-muted hover:text-ink hover:underline">Resend code</button>
          </form>
          <Link href="/sign-in?login=choose" className="text-ink-muted hover:text-ink hover:underline">
            Use a different method
          </Link>
          <Link href="/sign-in" className="flex items-center gap-1.5 text-ink-muted hover:text-ink">
            <ArrowLeft className="size-3.5" /> Back to login
          </Link>
        </div>
      </div>
    );
  }

  if (reset === "1") {
    return (
      <div>
        <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary-bright">
          <Mail className="size-6" />
        </div>
        <h1 className="font-display text-2xl font-bold">Reset your password</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Enter the email or phone number linked to your account.
        </p>

        {(error === "phone-not-found" || error === "not-found") && (
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            <AlertCircle className="size-4 shrink-0" />
            No account found. Check your email or phone number.
          </div>
        )}
        {error === "sms" && (
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            <AlertCircle className="size-4 shrink-0" />
            Couldn&rsquo;t send the code. Please try again.
          </div>
        )}

        <form action={startPasswordReset} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="identifier">Email or phone number</Label>
            <Input
              id="identifier"
              name="identifier"
              type="text"
              placeholder="Email or phone number"
              required
            />
          </div>
          <SubmitButton size="lg" className="w-full" pendingLabel="Sending code...">
            Send reset code
          </SubmitButton>
        </form>

        <Link
          href="/sign-in"
          className="mt-5 flex items-center justify-center gap-1.5 text-sm text-ink-muted hover:text-ink"
        >
          <ArrowLeft className="size-3.5" />
          Back to login
        </Link>
      </div>
    );
  }

  if (reset === "verify") {
    return (
      <div>
        <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary-bright">
          <ShieldCheck className="size-6" />
        </div>
        <h1 className="font-display text-2xl font-bold">Enter verification code</h1>
        <p className="mt-2 text-sm text-ink-muted">
          {via === "email"
            ? "We sent a 6-digit code to your email."
            : "We sent a 6-digit code to your phone."}{" "}
          Enter it below to verify your identity.
        </p>

        {error === "invalid-code" && (
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            <AlertCircle className="size-4 shrink-0" />
            Invalid code. Please check and try again.
          </div>
        )}
        {error === "expired" && (
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            <AlertCircle className="size-4 shrink-0" />
            This code has expired. Please request a new one.
          </div>
        )}

        <form action={verifyResetCode} className="mt-7 space-y-6">
          <OtpInput />
          <SubmitButton size="lg" className="w-full" pendingLabel="Verifying...">
            Verify code
          </SubmitButton>
        </form>

        <Link
          href="/sign-in?reset=1"
          className="mt-5 flex items-center justify-center gap-1.5 text-sm text-ink-muted hover:text-ink"
        >
          <ArrowLeft className="size-3.5" />
          Resend code
        </Link>
      </div>
    );
  }

  if (reset === "new-password") {
    return (
      <div>
        <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary-bright">
          <KeyRound className="size-6" />
        </div>
        <h1 className="font-display text-2xl font-bold">Create new password</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Choose a strong password for your account. Use at least 6 characters.
        </p>

        {error === "password-mismatch" && (
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            <AlertCircle className="size-4 shrink-0" />
            Passwords don&rsquo;t match. Please try again.
          </div>
        )}

        <ResetPasswordForm />
      </div>
    );
  }

  if (reset === "success") {
    return (
      <div>
        <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-success/10 text-success">
          <CheckCircle2 className="size-6" />
        </div>
        <h1 className="font-display text-2xl font-bold">Password updated</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Your password has been reset successfully. Log in with your new password below.
        </p>

        <form action={signIn} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" placeholder="you@church.org" required />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <PasswordInput id="password" name="password" placeholder="••••••••" required />
          </div>
          <SubmitButton size="lg" className="w-full" pendingLabel="Logging in…">
            Log in
          </SubmitButton>
        </form>

        <p className="mt-6 text-center text-sm text-ink-muted">
          New to WorshipHQ?{" "}
          <Link href="/sign-up" className="font-medium text-primary-bright hover:underline">
            Create your church
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Welcome back</h1>
      <p className="mt-2 text-sm text-ink-muted">Log in to your church&rsquo;s command center.</p>

      {error && error !== "expired" && (
        <div className="mt-5 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          <AlertCircle className="size-4 shrink-0" />
          {error === "sms" || error === "email-send"
            ? "We couldn't send your verification code. Please try again."
            : "Incorrect email/phone or password. Please try again."}
        </div>
      )}
      {error === "expired" && (
        <div className="mt-5 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          <AlertCircle className="size-4 shrink-0" /> Your session expired. Please log in again.
        </div>
      )}

      <form action={signIn} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="identifier">Email or phone number</Label>
          <Input id="identifier" name="identifier" type="text" placeholder="you@church.org or 024 000 0000" required />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/sign-in?reset=1"
              className="mb-1.5 text-xs text-primary-bright hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <PasswordInput id="password" name="password" placeholder="••••••••" required />
        </div>
        <p className="flex items-center gap-1.5 text-xs text-ink-faint">
          <ShieldCheck className="size-3.5" /> We&rsquo;ll text or email you a one-time code to confirm it&rsquo;s you.
        </p>
        <SubmitButton size="lg" className="w-full" pendingLabel="Sending code…">
          Continue
        </SubmitButton>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-ink-faint">
        <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
      </div>

      <form action={enterDemo}>
        <SubmitButton variant="secondary" size="lg" className="w-full" pendingLabel="Loading demo…">
          <Eye /> View live demo
        </SubmitButton>
      </form>

      <p className="mt-6 text-center text-sm text-ink-muted">
        New to WorshipHQ?{" "}
        <Link href="/sign-up" className="font-medium text-primary-bright hover:underline">
          Create your church
        </Link>
      </p>
    </div>
  );
}
