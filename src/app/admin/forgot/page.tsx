import Link from "next/link";
import { redirect } from "next/navigation";
import { getSuperAdmin } from "@/lib/auth";
import { startSuperAdminReset, confirmSuperAdminReset } from "@/app/actions/admin-auth";
import { getResetState } from "@/lib/superadmin-security";
import { SubmitButton } from "@/components/ui/submit-button";
import { AuthShell, AuthNotice, authInput, authButton, authCard } from "@/components/admin/auth-shell";

const ERRORS: Record<string, string> = {
  code: "One of the codes was wrong or has expired. A code you already got right is kept, so fix the other one. If a code expired, start again.",
  "too-many": "Too many tries. Wait a while and try again.",
  expired: "That reset expired. Start again.",
};

export default async function AdminForgotPage({ searchParams }: { searchParams: Promise<{ step?: string; error?: string }> }) {
  if (await getSuperAdmin()) redirect("/admin");
  const { step, error } = await searchParams;
  const state = step === "codes" ? await getResetState() : null;

  return (
    <AuthShell title="Reset the admin password" subtitle="Both codes are needed, one on your email and one on your phone.">
      {state ? (
        <form action={confirmSuperAdminReset} className={authCard}>
          {error && <AuthNotice>{ERRORS[error] ?? "Something went wrong. Start again."}</AuthNotice>}
          <p className="text-sm text-slate-400">If that was the owner&apos;s email, codes were sent. They work for 10 minutes.</p>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400" htmlFor="sa-ec">
              Code from your email {state.eo && <span className="text-emerald-400">- confirmed</span>}
            </label>
            <input id="sa-ec" name="emailCode" inputMode="numeric" autoComplete="one-time-code" maxLength={7} disabled={state.eo} placeholder="000000"
              className={`${authInput} text-center tracking-[0.3em] disabled:opacity-50`} />
          </div>
          {state.vs !== null && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400" htmlFor="sa-sc">
                Code from your phone {state.so && <span className="text-emerald-400">- confirmed</span>}
              </label>
              <input id="sa-sc" name="smsCode" inputMode="numeric" autoComplete="one-time-code" maxLength={7} disabled={state.so} placeholder="000000"
                className={`${authInput} text-center tracking-[0.3em] disabled:opacity-50`} />
            </div>
          )}
          <SubmitButton pendingLabel="Checking codes…" overlay={false} className={authButton}>Confirm codes</SubmitButton>
          <p className="text-center text-xs text-slate-500"><Link href="/admin/forgot" className="hover:text-slate-300">Start again</Link></p>
        </form>
      ) : (
        <form action={startSuperAdminReset} className={authCard}>
          {error && <AuthNotice>{ERRORS[error] ?? "Something went wrong. Try again."}</AuthNotice>}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400" htmlFor="sa-fe">Owner email</label>
            <input id="sa-fe" name="email" type="email" required autoComplete="username" placeholder="worshiphqapp@gmail.com" className={authInput} />
          </div>
          <SubmitButton pendingLabel="Sending codes…" overlay={false} className={authButton}>Send me the codes</SubmitButton>
          <p className="text-center text-xs text-slate-500"><Link href="/admin/login" className="hover:text-slate-300">Back to sign in</Link></p>
        </form>
      )}
    </AuthShell>
  );
}
