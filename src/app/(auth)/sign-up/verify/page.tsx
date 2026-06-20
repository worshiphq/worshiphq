import type { Metadata } from "next";
import { AlertCircle, ShieldCheck } from "lucide-react";
import { completeSignup, resendSignupOtp } from "@/app/actions/auth";
import { SubmitButton } from "@/components/ui/submit-button";
import { OtpInput } from "@/components/ui/otp-input";

export const metadata: Metadata = { title: "Verify your phone" };

export default async function SignupVerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; dev?: string; resent?: string }>;
}) {
  const { error, dev, resent } = await searchParams;

  return (
    <div>
      <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary-bright">
        <ShieldCheck className="size-6" />
      </div>
      <h1 className="font-display text-2xl font-bold">Verify your phone</h1>
      <p className="mt-2 text-sm text-ink-muted">
        We sent a 6-digit code by SMS. Enter it below to finish creating your church.
      </p>

      {resent && (
        <div className="mt-5 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          A new code has been sent.
        </div>
      )}
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

      <form action={completeSignup} className="mt-7 space-y-6">
        <OtpInput />
        <SubmitButton size="lg" className="w-full" pendingLabel="Verifying…">
          Verify &amp; create account
        </SubmitButton>
      </form>

      <form action={resendSignupOtp} className="mt-4 text-center">
        <SubmitButton variant="ghost" size="sm" overlay={false} pendingLabel="Resending…">
          Didn&rsquo;t get it? Resend code
        </SubmitButton>
      </form>
    </div>
  );
}
