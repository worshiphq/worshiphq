import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { MailX, MailCheck, AlertCircle } from "lucide-react";
import { readToken } from "@/lib/auth/tokens";
import { SubmitButton } from "@/components/ui/submit-button";
import { stopTipEmails, restartTipEmails } from "@/app/actions/email-preferences";

export const metadata: Metadata = { title: "Email preferences", robots: { index: false, follow: false } };

/**
 * Where "Stop these emails" lands. It asks before stopping (a button, not the link itself), because email
 * scanners open links and would otherwise unsubscribe people who never asked to.
 */
export default async function EmailPreferencesPage({ searchParams }: { searchParams: Promise<{ t?: string; state?: string }> }) {
  const { t = "", state } = await searchParams;
  const data = readToken<{ e: string }>("email-optout", t);
  const masked = data?.e ? data.e.replace(/^(.{2}).*(@.*)$/, "$1...$2") : null;

  return (
    <div className="grid min-h-dvh place-items-center bg-base px-4 py-12">
      <div className="w-full max-w-md rounded-3xl border border-line bg-surface p-8 shadow-sm">
        <Image src="/logo2.png" alt="WorshipHQ" width={180} height={48} className="mb-6 h-10 w-auto" />
        {!data ? (
          <>
            <div className="mb-3 flex items-center gap-2 text-danger"><AlertCircle className="size-5" /> <b>This link does not work</b></div>
            <p className="text-sm text-ink-muted">It may be incomplete. Open the link from the email again, or reply to that email and we will stop the emails for you.</p>
          </>
        ) : state === "stopped" ? (
          <>
            <div className="mb-3 flex items-center gap-2 text-success"><MailX className="size-5" /> <b>Done. No more tips and offers.</b></div>
            <p className="text-sm text-ink-muted">We will not send {masked} our tips and offers again. Sign-in codes, receipts and messages about your account will still arrive.</p>
            <form action={restartTipEmails} className="mt-6">
              <input type="hidden" name="t" value={t} />
              <SubmitButton variant="secondary" pendingLabel="Saving…">Changed your mind? Start them again</SubmitButton>
            </form>
          </>
        ) : (
          <>
            {state === "restarted" && (
              <div className="mb-4 flex items-center gap-2 rounded-xl bg-success/10 px-3 py-2 text-sm text-success"><MailCheck className="size-4" /> Welcome back. The emails will start again.</div>
            )}
            <h1 className="font-display text-xl font-bold text-ink">Stop tips and offers?</h1>
            <p className="mt-2 text-sm text-ink-muted">
              We send {masked} a few emails to help you get set up, and now and then an offer. Press the button to stop them.
              Sign-in codes, receipts and messages about your account will still arrive.
            </p>
            <form action={stopTipEmails} className="mt-6">
              <input type="hidden" name="t" value={t} />
              <SubmitButton pendingLabel="Stopping…">Stop these emails</SubmitButton>
            </form>
          </>
        )}
        <p className="mt-8 text-xs text-ink-faint"><Link href="/" className="hover:underline">worshiphq.app</Link></p>
      </div>
    </div>
  );
}
