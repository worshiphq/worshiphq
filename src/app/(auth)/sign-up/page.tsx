import type { Metadata } from "next";
import Link from "next/link";
import { Check, AlertCircle } from "lucide-react";
import { signUp } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export const metadata: Metadata = { title: "Create your church" };

const perks = ["Free forever up to 50 members", "No credit card required", "Set up in minutes"];

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message =
    error === "exists"
      ? "An account with that email already exists. Try logging in."
      : error === "invalid"
        ? "Please fill in every field (password must be at least 6 characters)."
        : null;

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Start your church</h1>
      <p className="mt-2 text-sm text-ink-muted">Create your free WorshipHQ account.</p>

      <ul className="mt-5 space-y-2">
        {perks.map((p) => (
          <li key={p} className="flex items-center gap-2 text-sm text-ink-muted">
            <Check className="size-4 text-success" /> {p}
          </li>
        ))}
      </ul>

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
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" placeholder="At least 6 characters" required minLength={6} />
        </div>
        <Button type="submit" size="lg" className="w-full">
          Create church account
        </Button>
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
