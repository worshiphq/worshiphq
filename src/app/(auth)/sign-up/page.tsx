import type { Metadata } from "next";
import { SignupWizard } from "@/components/auth/signup-wizard";
import { plans as defaultPlans } from "@/config/pricing";
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
  const plans = defaultPlans.map((p) => {
    const dbPrice = platformConfig.prices[p.id];
    return {
      id: p.id,
      name: p.name,
      monthly: dbPrice?.monthly ?? p.monthly,
      members: p.members,
      features: p.features,
    };
  });
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
