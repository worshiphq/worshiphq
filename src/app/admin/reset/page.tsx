import { redirect } from "next/navigation";
import { getSuperAdmin } from "@/lib/auth";
import { setNewSuperAdminPassword } from "@/app/actions/admin-auth";
import { getResetState } from "@/lib/superadmin-security";
import { SubmitButton } from "@/components/ui/submit-button";
import { PasswordInput } from "@/components/ui/password-input";
import { AuthShell, AuthNotice, authButton, authCard } from "@/components/admin/auth-shell";

const ERRORS: Record<string, string> = {
  short: "Use at least 12 characters.",
  match: "The two passwords do not match.",
  setup: "The password could not be saved. The security table is not in the database yet. Run the database update, then try again.",
};

export default async function AdminResetPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getSuperAdmin()) redirect("/admin");
  const state = await getResetState();
  if (!state?.ok) redirect("/admin/forgot?error=expired");
  const { error } = await searchParams;
  const field = "border-white/10 bg-white/5 text-slate-100 focus-visible:border-teal-400/60 focus-visible:ring-teal-400/20";

  return (
    <AuthShell title="Choose a new password" subtitle="Both codes confirmed. Every earlier sign-in will end.">
      <form action={setNewSuperAdminPassword} className={authCard}>
        {error && <AuthNotice>{ERRORS[error] ?? "Something went wrong. Try again."}</AuthNotice>}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">New password (12 or more characters)</label>
          <PasswordInput name="password" required autoComplete="new-password" minLength={12} className={field} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">Type it again</label>
          <PasswordInput name="confirm" required autoComplete="new-password" minLength={12} className={field} />
        </div>
        <SubmitButton pendingLabel="Saving…" overlay={false} className={authButton}>Save new password</SubmitButton>
      </form>
    </AuthShell>
  );
}
