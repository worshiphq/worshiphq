import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, Eye, KeyRound, ArrowLeft, ShieldCheck, CheckCircle2, Phone } from "lucide-react";
import {
  signIn,
  enterDemo,
  startPasswordReset,
  verifyResetCode,
  completePasswordReset,
} from "@/app/actions/auth";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input, Label } from "@/components/ui/input";
import { OtpInput } from "@/components/ui/otp-input";

export const metadata: Metadata = { title: "Log in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    reset?: string;
  }>;
}) {
  const { error, reset } = await searchParams;

  if (reset === "1") {
    return (
      <div>
        <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary-bright">
          <Phone className="size-6" />
        </div>
        <h1 className="font-display text-2xl font-bold">Reset your password</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Enter the phone number linked to your account. We&rsquo;ll send a verification code.
        </p>

        {error === "phone-not-found" && (
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            <AlertCircle className="size-4 shrink-0" />
            No account found with that phone number.
          </div>
        )}
        {error === "sms" && (
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            <AlertCircle className="size-4 shrink-0" />
            Couldn&rsquo;t send SMS. Please try again.
          </div>
        )}

        <form action={startPasswordReset} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="phone">Phone number</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              placeholder="024 123 4567"
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
          We sent a 6-digit code to your phone. Enter it below to verify your identity.
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

        <form action={completePasswordReset} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              minLength={6}
              required
            />
          </div>
          <div>
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              placeholder="••••••••"
              minLength={6}
              required
            />
          </div>
          <SubmitButton size="lg" className="w-full" pendingLabel="Updating password...">
            Reset password
          </SubmitButton>
        </form>
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
            <Input id="password" name="password" type="password" placeholder="••••••••" required />
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

      {error && (
        <div className="mt-5 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          <AlertCircle className="size-4 shrink-0" />
          Incorrect email or password. Please try again.
        </div>
      )}

      <form action={signIn} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" placeholder="you@church.org" required />
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
          <Input id="password" name="password" type="password" placeholder="••••••••" required />
        </div>
        <SubmitButton size="lg" className="w-full" pendingLabel="Logging in…">
          Log in
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
