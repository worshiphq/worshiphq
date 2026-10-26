import { redirect } from "next/navigation";
import { Mail, MessageSquare } from "lucide-react";
import { getSuperAdmin } from "@/lib/auth";
import { sendSuperAdminCode, verifySuperAdminCode, cancelSuperAdminSignIn } from "@/app/actions/admin-auth";
import { getLoginState, resolveSaIdentity, maskEmail, maskPhone } from "@/lib/superadmin-security";
import { SubmitButton } from "@/components/ui/submit-button";
import { AuthShell, AuthNotice, authInput, authButton, authGhost, authCard } from "@/components/admin/auth-shell";

const ERRORS: Record<string, string> = {
  code: "That code is wrong or has expired. Check it, or send a new one.",
  "too-many": "Too many tries. Wait a few minutes and try again.",
  send: "The code could not be sent. Try the other way, or try again in a minute.",
  "no-phone": "No phone number is saved for text codes. Use email.",
};

export default async function AdminVerifyPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string; left?: string }> }) {
  if (await getSuperAdmin()) redirect("/admin");
  const state = await getLoginState();
  if (!state?.who) redirect("/admin/login?error=expired");
  const identity = await resolveSaIdentity(state.who);
  if (!identity) redirect("/admin/login?error=expired");
  const { error, sent, left } = await searchParams;
  const tries = Number(left);
  const warn = error === "code" && tries >= 1 && tries <= 4 ? ` ${tries} ${tries === 1 ? "try" : "tries"} left before this account is locked for 24 hours.` : "";
  const phone = identity.phone;
  const emailMasked = maskEmail(identity.email);
  const phoneMasked = phone ? maskPhone(phone) : null;
  const waiting = !!state.vid;

  return (
    <AuthShell title="Check it is you" subtitle={waiting ? "Enter the 6-digit code." : "Choose where to send your sign-in code."}>
      <div className={authCard}>
        {error && <AuthNotice>{(ERRORS[error] ?? "Something went wrong. Try again.") + warn}</AuthNotice>}
        {sent && !error && (
          <AuthNotice tone="ok">Code sent to {sent === "sms" ? phoneMasked : emailMasked}. It works for 10 minutes.</AuthNotice>
        )}

        {waiting && (
          <form action={verifySuperAdminCode} className="space-y-3">
            <label className="block text-xs font-medium text-slate-400" htmlFor="sa-code">Sign-in code</label>
            <input
              id="sa-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus
              placeholder="000000" className={`${authInput} text-center text-lg tracking-[0.4em]`}
            />
            <SubmitButton pendingLabel="Checking code…" overlay={false} className={authButton}>Sign in</SubmitButton>
          </form>
        )}

        <div className="space-y-2">
          {waiting && <div className="pt-1 text-center text-xs text-slate-500">No code yet? Send a new one:</div>}
          <form action={sendSuperAdminCode}>
            <input type="hidden" name="channel" value="email" />
            <SubmitButton pendingLabel="Sending…" overlay={false} className={authGhost}>
              <Mail className="size-4" /> {waiting ? "Email a new code" : `Email a code to ${emailMasked}`}
            </SubmitButton>
          </form>
          {phoneMasked && (
            <form action={sendSuperAdminCode}>
              <input type="hidden" name="channel" value="sms" />
              <SubmitButton pendingLabel="Sending…" overlay={false} className={authGhost}>
                <MessageSquare className="size-4" /> {waiting ? "Text a new code" : `Text a code to ${phoneMasked}`}
              </SubmitButton>
            </form>
          )}
        </div>

        <form action={cancelSuperAdminSignIn} className="text-center">
          <button className="text-xs text-slate-500 hover:text-slate-300">Start over</button>
        </form>
      </div>
    </AuthShell>
  );
}
