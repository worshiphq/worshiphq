import "server-only";
import { db } from "@/lib/db";
import { env, features } from "@/lib/env";
import { countStatuses, mapHubtelStatus, stateOf, type LogNumber } from "@/lib/sms/delivery-status";

/**
 * Delivery reports. When Hubtel takes a text it only means Hubtel passed it on to the phone network; whether it
 * reached the phone comes later. This asks Hubtel, number by number, for the final word and writes it onto the
 * SMS record (and the campaign it belongs to), so a church sees Delivered, Not delivered, or Waiting.
 *
 * Runs from the hourly automations, and briefly whenever a church opens its SMS pages. A record is closed once
 * every number has a final answer, or after STOP_AFTER_HOURS (whatever is still waiting then is shown as Sent:
 * the network never reported back).
 */

const STOP_AFTER_HOURS = 72;
/** Do not ask about a text in its first minute: the network has not answered yet. */
const MIN_AGE_MS = 60_000;

async function hubtelStatus(messageId: string): Promise<{ state: ReturnType<typeof mapHubtelStatus>; raw?: string }> {
  const auth = Buffer.from(`${env.HUBTEL_CLIENT_ID}:${env.HUBTEL_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`https://sms.hubtel.com/v1/messages/${encodeURIComponent(messageId)}`, {
    headers: { authorization: `Basic ${auth}`, accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) return { state: null };
  const data = (await res.json().catch(() => ({}))) as { status?: unknown; Status?: unknown };
  const raw = data.status ?? data.Status;
  return { state: mapHubtelStatus(raw), raw: raw == null ? undefined : String(raw) };
}

/** Same phone, written two ways ("024..." vs "23324..."): compare the last 9 digits. */
const key = (p: string) => p.replace(/\D/g, "").slice(-9);

/**
 * Check open records. `churchId` limits it to one church (its own pages), `logIds` to particular records.
 * Stops when `budgetMs` runs out, so a page never waits long. Never throws.
 */
export async function checkDeliveries(opts: { churchId?: string; logIds?: string[]; budgetMs?: number; maxLookups?: number } = {}) {
  const started = Date.now();
  const budget = opts.budgetMs ?? 20_000;
  const maxLookups = opts.maxLookups ?? 400;
  const summary = { records: 0, lookups: 0, delivered: 0, failed: 0, closed: 0 };
  if (!features.sms || !env.HUBTEL_CLIENT_ID || !env.HUBTEL_CLIENT_SECRET) return summary;

  let rows;
  try {
    rows = await db.smsAuditLog.findMany({
      where: {
        statusDone: false,
        ...(opts.churchId ? { churchId: opts.churchId } : {}),
        ...(opts.logIds ? { id: { in: opts.logIds } } : {}),
        createdAt: { lte: new Date(Date.now() - MIN_AGE_MS) },
      },
      orderBy: { createdAt: "asc" },
      take: 60,
      select: { id: true, numbers: true, createdAt: true, communicationId: true, churchId: true },
    });
  } catch (e) {
    console.error("[sms delivery]", (e as Error).message);
    return summary;
  }

  for (const row of rows) {
    if (Date.now() - started > budget || summary.lookups >= maxLookups) break;
    let numbers: LogNumber[];
    try { numbers = JSON.parse(row.numbers ?? "[]"); } catch { numbers = []; }
    const old = Date.now() - row.createdAt.getTime() > STOP_AFTER_HOURS * 3600_000;
    const waiting = numbers.map((n, i) => ({ n, i })).filter(({ n }) => stateOf(n) === "pending" && n.id);

    // A few lookups at a time.
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(6, waiting.length) }, async () => {
      while (next < waiting.length && Date.now() - started < budget && summary.lookups < maxLookups) {
        const { n } = waiting[next++]!;
        summary.lookups++;
        try {
          const { state, raw } = await hubtelStatus(n.id!);
          if (state && state !== "pending") {
            n.st = state;
            n.at = new Date().toISOString();
            if (state === "failed") { n.e = `The network reported: ${raw ?? "not delivered"}`; summary.failed++; }
            else summary.delivered++;
          }
        } catch {
          // Hubtel unreachable for this one: ask again next time.
        }
      }
    }));

    // Past the window, whatever never got an answer is final as "Sent".
    if (old) for (const n of numbers) if (stateOf(n) === "pending") n.st = "sent";
    const c = countStatuses(numbers);
    const done = c.pending === 0;
    if (done) summary.closed++;
    summary.records++;
    try {
      await db.smsAuditLog.update({
        where: { id: row.id },
        data: { numbers: JSON.stringify(numbers), delivered: c.delivered, failed: c.failed, pending: c.pending, statusDone: done },
      });
      if (row.communicationId) await syncCampaign(row.communicationId);
    } catch (e) {
      console.error("[sms delivery] save", (e as Error).message);
    }
  }
  return summary;
}

/**
 * Bring a campaign's history in line with its SMS record(s): each recipient's status, and the campaign's
 * delivered count (the texts that did not fail; "delivered" in the history means reached, not refused).
 */
export async function syncCampaign(communicationId: string) {
  const logs = await db.smsAuditLog.findMany({ where: { communicationId }, select: { numbers: true } });
  const byPhone = new Map<string, LogNumber>();
  for (const l of logs) {
    try { for (const n of JSON.parse(l.numbers ?? "[]") as LogNumber[]) byPhone.set(key(n.to), n); } catch { /* skip */ }
  }
  if (!byPhone.size) return;
  const recips = await db.communicationRecipient.findMany({ where: { communicationId }, select: { id: true, contact: true, status: true } });
  const groups = new Map<string, string[]>();
  for (const r of recips) {
    const n = byPhone.get(key(r.contact));
    if (!n) continue;
    const st = stateOf(n);
    const status = st === "delivered" ? "delivered" : st === "failed" ? "failed" : st === "pending" ? "pending" : "sent";
    if (status !== r.status) groups.set(status, [...(groups.get(status) ?? []), r.id]);
  }
  for (const [status, ids] of groups) await db.communicationRecipient.updateMany({ where: { id: { in: ids } }, data: { status } });
  const c = countStatuses([...byPhone.values()]);
  await db.communication.update({ where: { id: communicationId }, data: { delivered: c.delivered + c.sent + c.pending } });
}
