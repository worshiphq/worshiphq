import type { Metadata } from "next";
import Link from "next/link";
import { signIn } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export const metadata: Metadata = { title: "Log in" };

export default function SignInPage() {
  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Welcome back</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Log in to your church&rsquo;s command center.
      </p>

      <form action={signIn} className="mt-8 space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" placeholder="pastor@grace.org" defaultValue="pastor@grace.org" required />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="#" className="mb-1.5 text-xs text-primary-bright hover:underline">
              Forgot?
            </Link>
          </div>
          <Input id="password" name="password" type="password" placeholder="••••••••" defaultValue="demo" required />
        </div>
        <Button type="submit" size="lg" className="w-full">
          Log in
        </Button>
      </form>

      <div className="mt-4 rounded-xl border border-line bg-surface/50 p-3 text-xs text-ink-muted">
        <span className="font-medium text-ink">Demo mode:</span> any email + password works. Try{" "}
        <code className="text-primary-bright">finance@grace.org</code> to see a Finance-role view.
      </div>

      <p className="mt-6 text-center text-sm text-ink-muted">
        New to WorshipHQ?{" "}
        <Link href="/sign-up" className="font-medium text-primary-bright hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
