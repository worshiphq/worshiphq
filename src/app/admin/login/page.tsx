import Link from "next/link";
import { redirect } from "next/navigation";
import { getSuperAdmin } from "@/lib/auth";
import { superAdminSignIn } from "@/app/actions/admin-auth";
import { SubmitButton } from "@/components/ui/submit-button";
import { PasswordInput } from "@/components/ui/password-input";
import { AuthShell, AuthNotice, authInput, authButton, authCard } from "@/components/admin/auth-shell";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string; left?: string }>;
}) {
  const sa = await getSuperAdmin();
  if (sa) redirect("/admin");
  const { error, reset, left } = await searchParams;
  const tries = Number(left);
  const warn = tries >= 1 && tries <= 4 ? ` ${tries} ${tries === 1 ? "try" : "tries"} left before this account is locked for 24 hours.` : "";

  return (
    <AuthShell title="WorshipHQ Platform Admin" subtitle="Restricted area - authorised admins only.">
      <form action={superAdminSignIn} className={authCard}>
        {reset && <AuthNotice tone="ok">Password changed. Every earlier sign-in was ended. Sign in with the new password.</AuthNotice>}
        {error && (
          <AuthNotice>
            {error === "too-many" ? "Too many attempts. Wait 15 minutes and try again."
              : error === "expired" ? "That sign-in expired. Start again."
              : error === "locked-pw" ? "Too many wrong passwords. This account is locked for 24 hours. Try again in 24 hours, or reset your password."
              : error === "locked-code" ? "Too many wrong codes. This account is locked for 24 hours. Try again in 24 hours or contact admin."
              : `Invalid credentials.${warn}`}
          </AuthNotice>
        )}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">Email</label>
          <input name="email" type="email" required autoComplete="username" placeholder="Your admin email" className={authInput} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">Password</label>
          <PasswordInput
            name="password"
            required
            className="border-white/10 bg-white/5 text-slate-100 focus-visible:border-teal-400/60 focus-visible:ring-teal-400/20"
          />
        </div>
        <SubmitButton pendingLabel="Checking…" overlay={false} className={authButton}>
          Continue
        </SubmitButton>
        <p className="text-center text-xs text-slate-500">
          A code is sent to your email or phone next. <Link href="/admin/forgot" className="font-medium text-teal-400 hover:underline">Forgot your password?</Link>
        </p>
      </form>
    </AuthShell>
  );
}
