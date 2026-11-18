import type { Metadata } from "next";
import { SignupWizard } from "@/components/auth/signup-wizard";
import { getPlatformConfig } from "@/lib/data/platform-config";
import { cookies } from "next/headers";
import { GOOGLE_SIGNUP_COOKIE, googleEnabled, readPendingSignup } from "@/lib/auth/google";
import { readToken } from "@/lib/auth/tokens";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Create your church" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; plan?: string; google?: string; resume?: string }>;
}) {
  const [{ error, plan: planParam, google: googleParam, resume }, platformConfig] = await Promise.all([
    searchParams,
    getPlatformConfig(),
  ]);
  // Plans come from the SuperAdmin plan editor so sign-up never drifts
  // from the pricing page.
  const plans = platformConfig.planList.map((p) => ({
    id: p.id,
    name: p.name,
    monthly: p.monthly,
    // What a church in Ghana will pay: the fixed cedi price, or the dollar price converted.
    ghsMonthly: p.ghsMonthly || Math.round(p.monthly * platformConfig.usdToGhsRate),
    members: p.membersLabel,
    features: p.marketingFeatures,
  }));
  const selectedPlan = planParam && plans.some((p) => p.id === planParam) ? planParam : "free";
  const message =
    error === "exists"
      ? "An account with that email already exists. Try logging in."
      : error === "invalid"
        ? "Please fill in every field. Password needs 8+ characters with a capital letter, a number and a symbol."
        : error === "sms"
          ? "We couldn't send the verification SMS. Check the phone number and try again."
          : error === "expired"
            ? "Your verification session expired. Please sign up again."
            : error === "too-many"
              ? "Too many codes requested. Please wait a few minutes and try again."
              : error === "google-expired"
                ? "Your Google sign-up timed out. Please press Continue with Google again."
                : error === "invalid-google"
                  ? "Please fill in every field, including your phone number, and accept the terms."
                  : null;

  // Back from Google with a new email: the same questions, minus the email, password and code.
  const pending = googleParam ? readPendingSignup((await cookies()).get(GOOGLE_SIGNUP_COOKIE)?.value) : null;
  const expiredGoogle = !!googleParam && !pending;

  // From the "finish your sign-up" email: the details they typed last time, so they only need to confirm. Never the password.
  let prefill: Record<string, string> | null = null;
  const r = readToken<{ v: string }>("signup-resume", resume);
  if (r?.v && !pending) {
    const row = await db.phoneVerification.findUnique({ where: { id: r.v }, select: { purpose: true, payload: true } });
    const p = row?.purpose === "signup" ? (row.payload ?? {}) as Record<string, unknown> : null;
    if (p) {
      const s = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : "");
      prefill = { church: s("churchName"), city: s("city"), country: s("country"), name: s("name"), email: s("email"), phone: s("phone"), plan: s("plan"), heardFrom: s("heardFrom"), heardDetail: s("heardDetail") };
    }
  }

  return (
    <SignupWizard
      plans={plans}
      currencySymbol={platformConfig.currencySymbol}
      initialPlan={selectedPlan}
      errorMessage={expiredGoogle && !message ? "Your Google sign-up timed out. Please press Continue with Google again." : message}
      google={pending ? { email: pending.email, name: pending.name } : null}
      showGoogleButton={googleEnabled() && !pending}
      prefill={prefill}
    />
  );
}
