import { redirect } from "next/navigation";
import { acceptAdminInvite } from "@/app/actions/admin-auth";
import { readAdminInvite } from "@/lib/superadmin-security";
import { SubmitButton } from "@/components/ui/submit-button";
import { PasswordInput } from "@/components/ui/password-input";
import { AuthShell, AuthNotice, authButton, authCard } from "@/components/admin/auth-shell";

const ERRORS: Record<string, string> = {
  short: "Use at least 12 characters.",
  match: "The two passwords do not match.",
};

export default async function AdminSetPasswordPage({ searchParams }: { searchParams: Promise<{ t?: string; error?: string }> }) {
  const { t, error } = await searchParams;
  const admin = await readAdminInvite(t);
  if (!t || !admin) redirect("/admin/login?error=expired");
  const field = "border-white/10 bg-white/5 text-slate-100 focus-visible:border-teal-400/60 focus-visible:ring-teal-400/20";

  return (
    <AuthShell title="Choose your password" subtitle={`For ${admin.email}. A code is sent to this email each time you sign in.`}>
      <form action={acceptAdminInvite} className={authCard}>
        <input type="hidden" name="t" value={t} />
        {error && <AuthNotice>{ERRORS[error] ?? "Something went wrong. Try again."}</AuthNotice>}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">New password (12 or more characters)</label>
          <PasswordInput name="password" required autoComplete="new-password" minLength={12} className={field} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">Type it again</label>
          <PasswordInput name="confirm" required autoComplete="new-password" minLength={12} className={field} />
        </div>
        <SubmitButton pendingLabel="Saving…" overlay={false} className={authButton}>Save password</SubmitButton>
      </form>
    </AuthShell>
  );
}
