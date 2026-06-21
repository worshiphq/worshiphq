import type { Metadata } from "next";
import Link from "next/link";
import { Check, AlertCircle } from "lucide-react";
import { signUp } from "@/app/actions/auth";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input, Label } from "@/components/ui/input";
import { plans } from "@/config/pricing";
import { formatCurrency } from "@/config/brand";

export const metadata: Metadata = { title: "Create your church" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; plan?: string }>;
}) {
  const { error, plan: planParam } = await searchParams;
  const selectedPlan = planParam && plans.some((p) => p.id === planParam) ? planParam : "free";
  const message =
    error === "exists"
      ? "An account with that email already exists. Try logging in."
      : error === "invalid"
        ? "Please fill in every field (password must be at least 6 characters)."
        : error === "sms"
          ? "We couldn't send the verification SMS. Check the phone number and try again."
          : error === "expired"
            ? "Your verification session expired. Please sign up again."
            : null;

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Start your church</h1>
      <p className="mt-2 text-sm text-ink-muted">Create your WorshipHQ account.</p>

      {message && (
        <div className="mt-5 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          <AlertCircle className="size-4 shrink-0" />
          {message}
        </div>
      )}

      <form action={signUp} className="mt-7 space-y-4">
        <div>
          <Label htmlFor="church">Church name</Label>
          <Input id="church" name="church" placeholder="Grace Temple" required />
        </div>
        <div>
          <Label htmlFor="name">Your name</Label>
          <Input id="name" name="name" placeholder="Rev. Daniel Mensah" required />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" placeholder="you@church.org" required />
        </div>
        <div>
          <Label htmlFor="phone">Phone (for verification)</Label>
          <Input id="phone" name="phone" type="tel" placeholder="024 000 0000" required />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" placeholder="At least 6 characters" required minLength={6} />
        </div>

        {/* Plan selection */}
        <div>
          <Label>Choose your plan</Label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {plans.map((p) => (
              <label
                key={p.id}
                className={`cursor-pointer rounded-xl border p-3 text-center transition-all ${
                  selectedPlan === p.id
                    ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                    : "border-line hover:border-primary/30"
                }`}
              >
                <input
                  type="radio"
                  name="plan"
                  value={p.id}
                  defaultChecked={selectedPlan === p.id}
                  className="sr-only"
                />
                <div className="font-display text-sm font-semibold">{p.name}</div>
                <div className="mt-0.5 text-xs text-ink-muted">
                  {p.monthly === 0 ? "Free forever" : `${formatCurrency(p.monthly)}/mo`}
                </div>
                <div className="mt-1 text-[10px] text-ink-faint">{p.members}</div>
              </label>
            ))}
          </div>
          {/* Show what's included */}
          {plans.find((p) => p.id === selectedPlan) && (
            <ul className="mt-3 space-y-1.5">
              {plans.find((p) => p.id === selectedPlan)!.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-xs text-ink-muted">
                  <Check className="size-3 text-success" /> {f}
                </li>
              ))}
            </ul>
          )}
        </div>

        <SubmitButton size="lg" className="w-full" pendingLabel="Sending code…">
          Continue — verify phone
        </SubmitButton>
      </form>

      <p className="mt-6 text-center text-sm text-ink-muted">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-medium text-primary-bright hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
