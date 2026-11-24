import "server-only";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { authSecret, safeEqual } from "@/lib/auth/tokens";
import { ttlCached, ttlInvalidate } from "@/lib/ttl-cache";
import type { DeliveryState } from "@/lib/sms/delivery-status";

/**
 * Nalo delivery reports. Nalo calls us back with what happened to a text when the send asked for it (callback_url).
 * Nalo documents callback_url only for its GET method and does not show what a report looks like, so:
 *   - this is OFF until SuperAdmin has seen a real report arrive from a test text;
 *   - each send carries its own signed reference in the address, so a report is matched without relying on its fields;
 *   - the report is kept exactly as it came, and only words we recognise change a status.
 * Needs the NaloReport table (sql/nalo-reports.sql).
 */
export type NaloReportMode = "off" | "get" | "json";
const KEY = "nalo-report-mode";
const ORIGIN = "https://worshiphq.app";
const PATH = "/api/webhooks/nalo-sms";

export function getNaloReportMode(): Promise<NaloReportMode> {
  return ttlCached(KEY, 30_000, async () => {
    try {
      const row = await db.siteContent.findUnique({ where: { key: KEY } });
      const m = (row?.value as { mode?: string } | null)?.mode;
      return m === "get" || m === "json" ? m : "off";
    } catch {
      return "off" as const;
    }
  });
}

export async function saveNaloReportMode(mode: NaloReportMode) {
  await db.siteContent.upsert({ where: { key: KEY }, update: { value: { mode } }, create: { key: KEY, value: { mode } } });
  ttlInvalidate(KEY);
}

const sign = (ref: string) => crypto.createHmac("sha256", authSecret()).update(`nalo-report:${ref}`).digest("hex").slice(0, 32);

export function newNaloCallback(): { ref: string; url: string } {
  const ref = crypto.randomUUID();
  return { ref, url: `${ORIGIN}${PATH}?r=${ref}&s=${sign(ref)}` };
}

export const validNaloCallback = (ref: string, sig: string) => /^[0-9a-f-]{36}$/.test(ref) && safeEqual(sign(ref), sig);

/** Remember which text each reference belongs to. Never throws: the text has gone either way. */
export async function rememberNaloSends(rows: { ref: string; jobId?: string; to: string }[]) {
  // The report can arrive before this is written, so each one is filled in rather than only created.
  await Promise.all(rows.map((r) =>
    db.naloReport.upsert({ where: { id: r.ref }, update: { jobId: r.jobId ?? null, to: r.to }, create: { id: r.ref, jobId: r.jobId ?? null, to: r.to } }).catch(() => {}),
  ));
}

/** Nalo's status words, grouped. Anything unknown stays pending, and the raw report is kept so it can be read. */
export function mapNaloStatus(raw: unknown): DeliveryState {
  const s = String(raw ?? "").trim().toLowerCase().replace(/[\s_-]/g, "");
  if (["delivered", "delivrd", "deliveredtohandset", "deliveredtoterminal"].includes(s)) return "delivered";
  if (["undelivered", "undeliv", "undeliverable", "failed", "fail", "rejected", "rejectd", "expired", "deleted", "unknownsubscriber", "absentsubscriber", "blocked", "notdelivered"].includes(s)) return "failed";
  return "pending";
}

/** The status inside a report, wherever Nalo put it. */
export function naloStatusIn(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const entries = Object.entries(payload as Record<string, unknown>);
  for (const want of ["status_desc", "statusdescription", "delivery_status", "deliverystatus", "dlr_status", "message_status", "status", "state", "dlr"]) {
    const hit = entries.find(([k]) => k.toLowerCase() === want);
    if (hit && (typeof hit[1] === "string" || typeof hit[1] === "number")) return String(hit[1]).slice(0, 80);
  }
  for (const [, v] of entries) {
    const inner = naloStatusIn(Array.isArray(v) ? v[0] : v);
    if (inner) return inner;
  }
  return null;
}

export async function recordNaloReport(ref: string, payload: unknown) {
  const status = naloStatusIn(payload);
  const state = mapNaloStatus(status);
  const raw = JSON.stringify(payload ?? null).slice(0, 2000);
  await db.naloReport.upsert({ where: { id: ref }, update: {}, create: { id: ref } });
  // A final answer is never replaced by a later "still trying", and never by a different one.
  await db.naloReport.updateMany({ where: { id: ref, state: "pending" }, data: { state, status, raw, reportedAt: new Date() } });
}

/** Nalo's message ids look like "api.0000011.20221222.0000003", Hubtel's never do. */
export const isNaloId = (id: string) => id.startsWith("api.");

export async function naloState(jobId: string): Promise<{ state: DeliveryState | null; raw?: string }> {
  const r = await db.naloReport.findFirst({ where: { jobId }, orderBy: { createdAt: "desc" }, select: { state: true, status: true } });
  return r ? { state: r.state as DeliveryState, raw: r.status ?? undefined } : { state: null };
}

export type NaloHealth = { mode: NaloReportMode; ready: boolean; asked: number; delivered: number; failed: number; waiting: number; silent: number; recent: { to: string; state: string; status: string | null; raw: string | null; at: string }[] };

/** The last 24 hours, for SuperAdmin. `silent` = sent over an hour ago with no report at all. */
export async function naloHealth(): Promise<NaloHealth> {
  const mode = await getNaloReportMode();
  const empty: NaloHealth = { mode, ready: false, asked: 0, delivered: 0, failed: 0, waiting: 0, silent: 0, recent: [] };
  try {
    const since = new Date(Date.now() - 86_400_000);
    const [groups, silent, recent] = await Promise.all([
      db.naloReport.groupBy({ by: ["state"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
      db.naloReport.count({ where: { createdAt: { gte: since, lt: new Date(Date.now() - 3_600_000) }, reportedAt: null } }),
      db.naloReport.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
    ]);
    const n = (s: string) => groups.find((g) => g.state === s)?._count._all ?? 0;
    return {
      mode, ready: true, asked: groups.reduce((a, g) => a + g._count._all, 0), delivered: n("delivered"), failed: n("failed"), waiting: n("pending"), silent,
      recent: recent.map((r) => ({ to: r.to ?? "", state: r.state, status: r.status, raw: r.raw, at: r.createdAt.toISOString() })),
    };
  } catch {
    return empty;
  }
}

/** Email the owner, at most once a day, when many Nalo texts fail. Also clears reports over 60 days old. */
export async function watchNalo() {
  const h = await naloHealth();
  if (!h.ready || h.mode === "off") return { alerted: false };
  await db.naloReport.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 60 * 86_400_000) } } }).catch(() => {});
  const answered = h.delivered + h.failed;
  const failing = answered >= 10 && h.failed / answered >= 0.2;
  const silent = h.asked >= 10 && h.silent / h.asked >= 0.5;
  if (!failing && !silent) return { alerted: false };
  const key = "nalo-alert-day";
  const today = new Date().toISOString().slice(0, 10);
  const last = await db.siteContent.findUnique({ where: { key } });
  if ((last?.value as { day?: string } | null)?.day === today) return { alerted: false };
  await db.siteContent.upsert({ where: { key }, update: { value: { day: today } }, create: { key, value: { day: today } } });
  const { ownerAlertRecipients } = await import("@/lib/billing/owner-alert");
  const { sendEmail } = await import("@/lib/integrations/email");
  const to = ownerAlertRecipients();
  if (!to.length) return { alerted: false };
  await sendEmail({
    to, subject: failing ? `Nalo: ${h.failed} of ${answered} texts failed in 24 hours` : "Nalo: many texts have no delivery report",
    html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto"><h2 style="color:#b45309">Nalo may not be delivering</h2><p>In the last 24 hours: ${h.delivered} delivered, ${h.failed} not delivered, ${h.silent} with no report after an hour.</p><p>You can move WorshipHQ's own texts back to Hubtel in SuperAdmin, Outreach.</p></div>`,
  });
  return { alerted: true };
}
