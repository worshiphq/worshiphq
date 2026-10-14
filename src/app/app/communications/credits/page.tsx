import Link from "next/link";
import { canEdit } from "@/lib/permissions";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { SmsCreditsPanel } from "@/components/app/sms-credits-panel";
import { smsBundlesForChurch } from "@/lib/sms/tier";
import { formatDate, cn } from "@/lib/utils";

export const metadata = { title: "SMS credits" };

const PAGE_SIZE = 12;
const KINDS = [
  { key: "all", label: "Everything" },
  { key: "topup", label: "Top-ups" },
  { key: "bonus", label: "Gifts" },
  { key: "usage", label: "Messages sent" },
] as const;

const KIND_LABEL: Record<string, string> = { topup: "Top-up", bonus: "Gift from WorshipHQ", usage: "Messages sent", refund: "Refund" };

export default async function SmsCreditsPage({ searchParams }: { searchParams: Promise<{ page?: string; kind?: string }> }) {
  const sp = await searchParams;
  const session = await requireModule("communications");
  const kind = KINDS.some((k) => k.key === sp.kind) ? (sp.kind as (typeof KINDS)[number]["key"]) : "all";
  const where = { churchId: session.churchId, ...(kind === "all" ? {} : { kind }) };
  const total = await db.smsTransaction.count({ where });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, parseInt(sp.page ?? "1", 10) || 1));

  const [church, transactions, sms] = await Promise.all([
    db.church.findUnique({
      where: { id: session.churchId },
      select: { smsCredits: true, smsWelcomeMember: true, smsWelcomeVisitor: true },
    }),
    db.smsTransaction.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    smsBundlesForChurch(session.churchId),
  ]);

  const href = (p: number, k = kind) => `/app/communications/credits?${new URLSearchParams({ ...(k !== "all" ? { kind: k } : {}), ...(p > 1 ? { page: String(p) } : {}) }).toString()}`;

  return (
    <div>
      <Link href="/app/communications" className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Back to communications
      </Link>
      <PageHeader title="SMS credits" description="Top up and manage the credits used to send SMS." />

      <SmsCreditsPanel
        balance={church?.smsCredits ?? 0}
        welcomeOn={church?.smsWelcomeMember ?? true}
        welcomeVisitorOn={church?.smsWelcomeVisitor ?? true}
        canWrite={canEdit(session, "communications")}
        bundles={sms.bundles}
        tier={sms.tier}
      />

      {/* History */}
      <Card className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
          <h3 className="font-display text-lg font-semibold">Credit history</h3>
          <div className="flex flex-wrap gap-1">
            {KINDS.map((k) => (
              <Link
                key={k.key}
                href={href(1, k.key)}
                className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", kind === k.key ? "border-primary bg-primary/10 text-primary" : "border-line text-ink-muted hover:bg-surface-2")}
              >
                {k.label}
              </Link>
            ))}
          </div>
        </div>
        {transactions.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-muted">No credit activity yet.</div>
        ) : (
          <div className="divide-y divide-line-soft">
            {transactions.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink">{KIND_LABEL[t.kind] ?? t.kind}</div>
                  <div className="truncate text-xs text-ink-faint">
                    {t.note ?? ""}{t.note ? " · " : ""}{formatDate(t.createdAt.toISOString())}
                    {t.amountGhs ? ` · paid ₵${t.amountGhs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ""}
                  </div>
                </div>
                <div className={cn("shrink-0 text-right text-sm font-semibold", t.credits >= 0 ? "text-success" : "text-ink-muted")}>
                  {t.credits >= 0 ? "+" : ""}{t.credits.toLocaleString()}
                  <div className="text-[11px] font-normal text-ink-faint">balance {t.balanceAfter.toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-line px-5 py-3 text-sm">
            <span className="text-ink-faint">{(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, total)} of {total}</span>
            <div className="flex items-center gap-2">
              {page > 1 ? <Link href={href(page - 1)} className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:bg-surface-2"><ChevronLeft className="size-3.5" /> Newer</Link> : <span />}
              <span className="text-xs text-ink-muted">Page {page} of {pages}</span>
              {page < pages ? <Link href={href(page + 1)} className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:bg-surface-2">Older <ChevronRight className="size-3.5" /></Link> : <span />}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
