import { CheckCircle2, Clock } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { verifyMediaPayment } from "@/lib/media-billing";

export const metadata = { title: "WorshipHQ Live payment" };
export const dynamic = "force-dynamic";

/** Where Paystack sends someone after paying for WorshipHQ Live in their browser. */
export default async function MediaPaidPage({ searchParams }: { searchParams: Promise<{ reference?: string; trxref?: string }> }) {
  const q = await searchParams;
  const reference = (q.reference ?? q.trxref ?? "").slice(0, 100);
  const result = reference ? await verifyMediaPayment(reference).catch(() => null) : null;
  const ok = !!result?.ok;
  const until = ok && "until" in result! ? new Date(result.until).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null;

  return (
    <main id="main-content" className="grid min-h-dvh place-items-center bg-base px-6 text-center">
      <div className="max-w-md">
        <div className={`mx-auto mb-8 grid size-16 place-items-center rounded-2xl border border-line bg-surface ${ok ? "text-success" : "text-gold"}`}>
          {ok ? <CheckCircle2 className="size-8" /> : <Clock className="size-8" />}
        </div>
        <Logo className="mx-auto mb-6 justify-center" />
        <h1 className="text-3xl font-bold">{ok ? "Thank you, WorshipHQ Live is on" : "We're confirming your payment"}</h1>
        <p className="mt-3 text-ink-muted">
          {ok
            ? <>Your church can use WorshipHQ Live until <b className="text-ink">{until}</b>. A receipt is on its way to your email.</>
            : <>Paystack is still confirming it. This usually takes under a minute. If money left your account, it will switch on by itself.</>}
        </p>
        <p className="mt-6 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink">
          Go back to <b>WorshipHQ Live</b> on your computer. It updates by itself in a moment, or open
          {" "}<b>Help › WorshipHQ account</b> and press <b>Check now</b>.
        </p>
        <p className="mt-4 text-xs text-ink-faint">You can close this page.</p>
      </div>
    </main>
  );
}
