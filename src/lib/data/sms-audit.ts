import "server-only";
import { db } from "@/lib/db";

/**
 * Reading the SMS send records. One reader serves both sides: a church reads its own rows on
 * /app/communications/log, and the platform owner reads every church's on /admin/sms. `churchId` is
 * what separates them, so a church can never be handed another church's rows by accident.
 *
 * Every read tolerates the table not existing yet (it is created by sql/sms-audit-log.sql), because
 * an empty log is a far better page than a crash.
 */

export const SMS_LOG_PAGE_SIZE = 20;

export type SmsLogRow = {
  id: string;
  createdAt: Date;
  label: string | null;
  body: string;
  segments: number;
  recipients: number;
  sent: number;
  credits: number;
  senderName: string | null;
  sentByName: string | null;
  trigger: string;
  numbers: { to: string; ok: boolean }[];
  churchId: string;
  churchName?: string;
  /** All-churches view only: what the church had left just after this send, and what it has now. */
  creditsLeftAfter?: number | null;
  creditsLeftNow?: number;
};

export type SmsLogPage = {
  rows: SmsLogRow[];
  total: number;
  page: number;
  pages: number;
  /** False when the table has not been created yet, so the page can say so instead of showing "nothing yet". */
  ready: boolean;
};

function parseNumbers(raw: string | null): { to: string; ok: boolean }[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((n): n is { to: string; ok: boolean } => !!n && typeof n.to === "string")
      .map((n) => ({ to: n.to, ok: !!n.ok }));
  } catch {
    return [];
  }
}

export async function getSmsLog(opts: {
  /** Omit to read every church (owner only - the caller must have checked that). */
  churchId?: string;
  page?: number;
  /** "all" | "manual" | "automatic" | "failed" */
  filter?: string;
  /** Free text over the message body and the label. */
  q?: string;
}): Promise<SmsLogPage> {
  const filter = opts.filter ?? "all";
  const q = opts.q?.trim();
  const where = {
    ...(opts.churchId ? { churchId: opts.churchId } : {}),
    ...(filter === "manual" ? { trigger: "manual" } : {}),
    ...(filter === "automatic" ? { trigger: "automatic" } : {}),
    ...(filter === "failed" ? { sent: 0 } : {}),
    ...(q
      ? {
          OR: [
            { body: { contains: q, mode: "insensitive" as const } },
            { label: { contains: q, mode: "insensitive" as const } },
            // Only the owner's all-churches view can search by church.
            ...(opts.churchId ? [] : [{ church: { name: { contains: q, mode: "insensitive" as const } } }]),
          ],
        }
      : {}),
  };

  try {
    const total = await db.smsAuditLog.count({ where });
    const pages = Math.max(1, Math.ceil(total / SMS_LOG_PAGE_SIZE));
    const page = Math.min(pages, Math.max(1, opts.page ?? 1));
    const found = await db.smsAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * SMS_LOG_PAGE_SIZE,
      take: SMS_LOG_PAGE_SIZE,
      // The church name only matters on the owner's all-churches view.
      include: opts.churchId ? undefined : { church: { select: { name: true, smsCredits: true } } },
    });

    // The newest ledger row at or before each send holds the balance it left behind. A send that failed outright
    // writes no row of its own, and its balance is simply whatever the row before it says.
    const leftAfter = new Map<string, number | null>();
    if (!opts.churchId) {
      await Promise.all(found.map(async (r) => {
        const row = await db.smsTransaction.findFirst({
          where: { churchId: r.churchId, createdAt: { lte: r.createdAt } },
          orderBy: { createdAt: "desc" },
          select: { balanceAfter: true },
        });
        leftAfter.set(r.id, row?.balanceAfter ?? null);
      }));
    }

    return {
      total,
      page,
      pages,
      ready: true,
      rows: found.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        label: r.label,
        body: r.body,
        segments: r.segments,
        recipients: r.recipients,
        sent: r.sent,
        credits: r.credits,
        senderName: r.senderName,
        sentByName: r.sentByName,
        trigger: r.trigger,
        numbers: parseNumbers(r.numbers),
        churchId: r.churchId,
        churchName: "church" in r ? (r.church as { name: string } | undefined)?.name : undefined,
        creditsLeftAfter: opts.churchId ? undefined : leftAfter.get(r.id) ?? null,
        creditsLeftNow: "church" in r ? (r.church as { smsCredits: number } | undefined)?.smsCredits : undefined,
      })),
    };
  } catch {
    return { rows: [], total: 0, page: 1, pages: 1, ready: false };
  }
}

/**
 * Credit adjustments the owner made by hand, with the reason they typed. Owner-facing only: the
 * reason lives in `adminNote`, which no church-facing page reads.
 */
export async function getCreditAdjustments(take = 30) {
  try {
    const rows = await db.smsTransaction.findMany({
      where: { source: "manual", OR: [{ kind: "refund" }, { kind: "bonus" }] },
      orderBy: { createdAt: "desc" },
      take,
      include: { church: { select: { name: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      churchName: r.church.name,
      credits: r.credits,
      balanceAfter: r.balanceAfter,
      adminNote: r.adminNote,
    }));
  } catch {
    return [];
  }
}

/** Headline numbers for the window shown, so the page leads with a total rather than a list. */
export async function getSmsLogTotals(churchId?: string, since?: Date) {
  try {
    const where = {
      ...(churchId ? { churchId } : {}),
      ...(since ? { createdAt: { gte: since } } : {}),
    };
    const agg = await db.smsAuditLog.aggregate({
      where,
      _sum: { sent: true, credits: true },
      _count: { _all: true },
    });
    const failed = await db.smsAuditLog.count({ where: { ...where, sent: 0 } });
    return {
      sends: agg._count._all,
      delivered: agg._sum.sent ?? 0,
      credits: Math.abs(agg._sum.credits ?? 0),
      failed,
    };
  } catch {
    return { sends: 0, delivered: 0, credits: 0, failed: 0 };
  }
}
