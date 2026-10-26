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
  searchParams: Promise<{ error?: string; reset?: string }>;
}) {
  const sa = await getSuperAdmin();
  if (sa) redirect("/admin");
  const { error, reset } = await searchParams;

  return (
    <AuthShell title="WorshipHQ Platform Admin" subtitle="Restricted area - owner access only.">
      <form action={superAdminSignIn} className={authCard}>
        {reset && <AuthNotice tone="ok">Password changed. Every earlier sign-in was ended. Sign in with the new password.</AuthNotice>}
        {error && (
          <AuthNotice>
            {error === "too-many" ? "Too many attempts. Wait 15 minutes and try again."
              : error === "expired" ? "That sign-in expired. Start again."
              : "Invalid credentials."}
          </AuthNotice>
        )}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">Email</label>
          <input name="email" type="email" required autoComplete="username" placeholder="worshiphqapp@gmail.com" className={authInput} />
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
