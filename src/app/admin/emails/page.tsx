import { requireSuperAdmin } from "@/lib/auth";
import { AdminShell } from "@/components/admin/admin-shell";
import { LiveSearch, UrlFilter } from "@/components/admin/list-tools";
import { Pager } from "@/components/admin/pager";
import { paging, readPage } from "@/lib/admin-paging";
import { db } from "@/lib/db";
import { emailChain, brevoEmailsLeft, brevoSentToday } from "@/lib/integrations/email";
import { env } from "@/lib/env";
import { EmailsToolbar, EmailRows, type EmailRow } from "@/components/admin/emails-client";
import type { Prisma } from "@prisma/client";

export const metadata = { title: "Emails" };
export const dynamic = "force-dynamic";

const DAY = 86_400_000;
const FILTERS = [
  { value: "", label: "Every email" },
  { value: "failed", label: "Failed to send" },
  { value: "bad", label: "Bounced or blocked" },
  { value: "delivered", label: "Delivered or opened" },
  { value: "private", label: "Codes and password links" },
];

export default async function AdminEmailsPage({ searchParams }: { searchParams: Promise<{ page?: string; filter?: string; q?: string }> }) {
  const sa = await requireSuperAdmin();
  const sp = await searchParams;
  const q = sp.q?.trim();

  const where: Prisma.EmailLogWhereInput = {
    ...(sp.filter === "failed" ? { status: "failed" } : {}),
    ...(sp.filter === "bad" ? { delivery: { in: ["bounced", "blocked", "spam"] } } : {}),
    ...(sp.filter === "delivered" ? { delivery: { in: ["delivered", "opened"] } } : {}),
    ...(sp.filter === "private" ? { html: null } : {}),
    ...(q ? { OR: [{ toAddrs: { contains: q, mode: "insensitive" } }, { subject: { contains: q, mode: "insensitive" } }] } : {}),
  };

  let ready = true;
  let rows: EmailRow[] = [];
  let pg = paging(0, 1);
  let stats = { day: 0, failed: 0, waiting: 0, bad: 0 };
  try {
    const since = new Date(Date.now() - DAY);
    const [total, day, failed, waiting, bad] = await Promise.all([
      db.emailLog.count({ where }),
      db.emailLog.count({ where: { createdAt: { gte: since } } }),
      db.emailLog.count({ where: { status: "failed", createdAt: { gte: since } } }),
      db.emailLog.count({ where: { status: "failed", retryable: true, createdAt: { gte: new Date(Date.now() - 3 * DAY) } } }),
      db.emailLog.count({ where: { delivery: { in: ["bounced", "blocked", "spam"] }, createdAt: { gte: new Date(Date.now() - 7 * DAY) } } }),
    ]);
    stats = { day, failed, waiting, bad };
    pg = paging(total, readPage(sp.page));
    const found = await db.emailLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: pg.skip,
      take: pg.size,
      select: { id: true, toAddrs: true, subject: true, status: true, provider: true, error: true, delivery: true, deliveryNote: true, tries: true, resentAt: true, retryable: true, html: true, attachments: true, createdAt: true, churchId: true },
    });
    const churchIds = [...new Set(found.map((r) => r.churchId).filter(Boolean))] as string[];
    const churches = churchIds.length ? await db.church.findMany({ where: { id: { in: churchIds } }, select: { id: true, name: true } }) : [];
    const names = new Map(churches.map((c) => [c.id, c.name]));
    rows = found.map((r) => ({
      id: r.id,
      to: r.toAddrs,
      subject: r.subject,
      status: r.status,
      provider: r.provider,
      error: r.error,
      delivery: r.delivery,
      deliveryNote: r.deliveryNote,
      tries: r.tries,
      resentAt: r.resentAt?.toISOString() ?? null,
      canResend: r.html != null,
      retryable: r.retryable,
      hasFile: Array.isArray(r.attachments) && r.attachments.length > 0,
      at: r.createdAt.toISOString(),
      church: r.churchId ? names.get(r.churchId) ?? null : null,
    }));
  } catch {
    ready = false;
  }

  const chain = emailChain();
  const [brevoLeft, brevoToday] = await Promise.all([env.BREVO_API_KEY ? brevoEmailsLeft() : null, brevoSentToday()]);

  return (
    <AdminShell email={sa.email} isOwner={sa.role === "owner"}>
      <div className="mb-6">
        <h1 className="text-lg font-bold tracking-tight">Emails</h1>
        <p className="text-sm text-slate-400">
          Every email WorshipHQ sends: receipts, payment alerts, welcomes, outreach. Failed ones go again by
          themselves every hour for 3 days, or press Send all failed. Sign-in codes and password links are listed
          without their contents and are never sent again.
        </p>
      </div>

      {!ready ? (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5 text-sm text-amber-200">
          The email log needs its table. Run <code className="rounded bg-black/30 px-1">sql/email-log.sql</code> in Supabase, then reload this page.
          Emails still send in the meantime.
        </div>
      ) : (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Emails in the last 24 hours", value: stats.day },
              { label: "Failed in the last 24 hours", value: stats.failed, bad: stats.failed > 0 },
              { label: "Waiting to go again", value: stats.waiting, bad: stats.waiting > 0 },
              { label: "Bounced or blocked (7 days)", value: stats.bad, bad: stats.bad > 0 },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <div className="text-xs text-slate-500">{s.label}</div>
                <div className={`mt-1 text-2xl font-bold ${s.bad ? "text-rose-300" : "text-white"}`}>{s.value.toLocaleString()}</div>
              </div>
            ))}
          </div>

          <EmailsToolbar
            chain={chain}
            brevoLeft={brevoLeft}
            brevoApi={!!env.BREVO_API_KEY}
            waiting={stats.waiting}
            brevoToday={brevoToday}
            brevoLimit={env.BREVO_DAILY_LIMIT}
          />

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <LiveSearch placeholder="Search address or subject" />
            <UrlFilter param="filter" label="Show" options={FILTERS} />
          </div>

          <EmailRows rows={rows} chain={chain} />
          <Pager page={pg.page} pages={pg.pages} total={pg.total} path="/admin/emails" params={{ filter: sp.filter, q }} />
        </>
      )}
    </AdminShell>
  );
}
