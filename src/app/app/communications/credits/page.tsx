import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { SmsCreditsPanel } from "@/components/app/sms-credits-panel";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "SMS credits" };

export default async function SmsCreditsPage() {
  const session = await requireSession();
  const [church, transactions] = await Promise.all([
    db.church.findUnique({
      where: { id: session.churchId },
      select: { smsCredits: true, smsWelcomeMember: true },
    }),
    db.smsTransaction.findMany({
      where: { churchId: session.churchId },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
  ]);

  return (
    <div>
      <Link href="/app/communications" className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Back to communications
      </Link>
      <PageHeader title="SMS credits" description="Top up and manage the credits used to send SMS." />

      <SmsCreditsPanel
        balance={church?.smsCredits ?? 0}
        welcomeOn={church?.smsWelcomeMember ?? true}
        canWrite={!session.isDemo}
      />

      {/* History */}
      <Card className="mt-4">
        <div className="border-b border-line p-5">
          <h3 className="font-display text-lg font-semibold">Credit history</h3>
        </div>
        {transactions.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-muted">No credit activity yet.</div>
        ) : (
          <div className="divide-y divide-line-soft">
            {transactions.map((t) => (
              <div key={t.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <div className="text-sm font-medium capitalize text-ink">{t.kind}</div>
                  <div className="text-xs text-ink-faint">{t.note ?? ""} · {formatDate(t.createdAt.toISOString())}</div>
                </div>
                <div className={`text-sm font-semibold ${t.credits >= 0 ? "text-success" : "text-ink-muted"}`}>
                  {t.credits >= 0 ? "+" : ""}{t.credits.toLocaleString()}
                  <span className="ml-2 text-xs font-normal text-ink-faint">bal {t.balanceAfter.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
