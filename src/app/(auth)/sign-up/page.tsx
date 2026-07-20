import type { Metadata } from "next";
import { SignupWizard } from "@/components/auth/signup-wizard";
import { getPlatformConfig } from "@/lib/data/platform-config";

export const metadata: Metadata = { title: "Create your church" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; plan?: string }>;
}) {
  const [{ error, plan: planParam }, platformConfig] = await Promise.all([
    searchParams,
    getPlatformConfig(),
  ]);
  // Plans come from the SuperAdmin plan editor so sign-up never drifts
  // from the pricing page.
  const plans = platformConfig.planList.map((p) => ({
    id: p.id,
    name: p.name,
    monthly: p.monthly,
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
            : null;

  return (
    <SignupWizard
      plans={plans}
      currencySymbol={platformConfig.currencySymbol}
      initialPlan={selectedPlan}
      errorMessage={message}
    />
  );
}
