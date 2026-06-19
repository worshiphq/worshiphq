import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, Eye } from "lucide-react";
import {
  signIn,
  enterDemo,
  startPasswordReset,
  completePasswordReset,
} from "@/app/actions/auth";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input, Label } from "@/components/ui/input";

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
      {reset === "1" && (
        <form action={startPasswordReset} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              placeholder="0241234567"
              required
            />
          </div>

          <SubmitButton
            size="lg"
            className="w-full"
            pendingLabel="Sending code..."
          >
            Send Reset Code
          </SubmitButton>
        </form>
      )}

      {reset !== "1" && (
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
                Forgot Password?
              </Link>
            </div>
            <Input id="password" name="password" type="password" placeholder="••••••••" required />
          </div>
          <SubmitButton size="lg" className="w-full" pendingLabel="Logging in…">
            Log in
          </SubmitButton>
        </form>
      )}

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
