"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const DEFAULT_DUES_RECEIPT = "Dear {title} {name}, your welfare dues of GHS {amount} for {months} have been received by {church}. {balance} God bless.";
const DEFAULT_DUES_REMINDER = "Dear {title} {name}, a friendly reminder from {church}: your welfare dues balance is GHS {owed}. Kindly settle when you can. God bless you.";

function fill(tpl: string, vars: Record<string, string>): string {
  return tpl
    .replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ ([,.!?:])/g, "$1")
    .trim();
}

/** Set (or clear) a church-wide date dues start counting (fallback for members
 *  with no personal start). Cleared = dues aren't calculated until each member
 *  gets a start (set manually or auto-captured on their first recorded dues). */
export async function setChurchWelfareStart(formData: FormData) {
  const session = await requireModule("giving");
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };
  const dateStr = String(formData.get("welfareStart") ?? "").trim();
  await db.church.update({
    where: { id: session.churchId },
    data: { welfareStart: dateStr ? new Date(dateStr) : null },
  });
  await audit(session, "update", "welfare-dues", `Set church welfare start${dateStr ? ` to ${dateStr}` : " (cleared)"}`);
  revalidatePath("/app/welfare");
  return { ok: true as const };
}

/** Set (or clear) the date a member starts owing welfare dues. */
export async function setMemberWelfareStart(formData: FormData) {
  const session = await requireModule("giving");
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };
  const personId = String(formData.get("personId") ?? "").trim();
  const dateStr = String(formData.get("welfareStart") ?? "").trim();
  if (!personId) return { ok: false as const, error: "No member." };
  await db.person.updateMany({
    where: { id: personId, churchId: session.churchId },
    data: { welfareStart: dateStr ? new Date(dateStr) : null },
  });
  await audit(session, "update", "welfare-dues", `Set welfare start for a member${dateStr ? ` to ${dateStr}` : " (cleared)"}`);
  revalidatePath("/app/welfare");
  return { ok: true as const };
}

/** Correct a single month's dues amount (human-error fix). */
export async function editWelfareDue(formData: FormData) {
  const session = await requireModule("giving");
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };
  const id = String(formData.get("id") ?? "");
  const amount = parseFloat(String(formData.get("amount") ?? "0"));
  if (!id || !amount || amount <= 0) return { ok: false as const, error: "Enter a valid amount." };
  await db.welfareDue.updateMany({ where: { id, churchId: session.churchId }, data: { amount } });
  revalidatePath("/app/welfare");
  return { ok: true as const };
}

/** Save the editable welfare SMS templates (receipt + reminder). */
export async function saveWelfareTemplates(formData: FormData) {
  const session = await requireModule("giving");
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };
  const receipt = String(formData.get("receipt") ?? "").trim();
  const reminder = String(formData.get("reminder") ?? "").trim();
  await db.church.update({
    where: { id: session.churchId },
    data: {
      welfareDuesReceiptTemplate: receipt || null,
      welfareDuesReminderTemplate: reminder || null,
    },
  });
  revalidatePath("/app/welfare");
  return { ok: true as const };
}

/** Set (or update) the monthly welfare-dues rate for a given year. */
export async function setWelfareRate(formData: FormData) {
  const session = await requireModule("giving");
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };
  const year = parseInt(String(formData.get("year") ?? ""), 10);
  const amount = parseFloat(String(formData.get("amount") ?? "0"));
  if (!year || year < 2000 || year > 2100) return { ok: false as const, error: "Enter a valid year." };
  if (!amount || amount <= 0) return { ok: false as const, error: "Enter a valid monthly amount." };
  await db.welfareRate.upsert({
    where: { churchId_year: { churchId: session.churchId, year } },
    create: { churchId: session.churchId, year, amount },
    update: { amount },
  });
  await audit(session, "update", "welfare-rate", `Welfare rate for ${year} set to ${amount}/month`);
  revalidatePath("/app/welfare");
  return { ok: true as const };
}

/**
 * Record a member's welfare dues across a range of months in a year — e.g.
 * Jan–Oct 2025 at GHS 5/month creates a due for each month. Posts the batch
 * total as income into an account, and optionally texts the member.
 */
export async function recordWelfareDues(formData: FormData) {
  const session = await requireModule("giving");
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };

  const personId = String(formData.get("personId") ?? "").trim();
  // Range: fromYear/fromMonth → toYear/toMonth. `year` is the legacy single-year
  // field — fall back to it for both ends when the range fields aren't sent.
  const legacyYear = parseInt(String(formData.get("year") ?? ""), 10);
  const fromYear = parseInt(String(formData.get("fromYear") ?? ""), 10) || legacyYear;
  const toYear = parseInt(String(formData.get("toYear") ?? ""), 10) || legacyYear;
  const fromMonth = parseInt(String(formData.get("fromMonth") ?? "1"), 10);
  const toMonth = parseInt(String(formData.get("toMonth") ?? "12"), 10);
  const overrideAmount = parseFloat(String(formData.get("amountPerMonth") ?? "0")) || 0;
  const notify = String(formData.get("notify") ?? "") === "on";

  if (!personId) return { ok: false as const, error: "Choose a member." };
  if (!fromYear || !toYear) return { ok: false as const, error: "Choose a year." };
  if (fromMonth < 1 || fromMonth > 12 || toMonth < 1 || toMonth > 12) return { ok: false as const, error: "Choose valid months." };
  if (fromYear > toYear || (fromYear === toYear && fromMonth > toMonth)) return { ok: false as const, error: "The start must be on or before the end." };

  const member = await db.person.findFirst({ where: { id: personId, churchId: session.churchId }, select: { firstName: true, lastName: true, welfareStart: true } });
  if (!member) return { ok: false as const, error: "Member not found." };

  // Build every (year, month) cell in the range, chronologically.
  const cells: { year: number; month: number }[] = [];
  let cy = fromYear, cm = fromMonth;
  while (cy < toYear || (cy === toYear && cm <= toMonth)) {
    cells.push({ year: cy, month: cm });
    cm++; if (cm > 12) { cm = 1; cy++; }
    if (cells.length > 1200) break; // safety cap (~100 years)
  }

  // Amount per cell: an explicit override applies to every month; otherwise use
  // that year's set rate. Any year in the range without a rate (and no override)
  // can't be priced — tell the admin which years need a rate.
  const rateRows = await db.welfareRate.findMany({ where: { churchId: session.churchId }, select: { year: true, amount: true } });
  const rateByYear = new Map(rateRows.map((r) => [r.year, Number(r.amount)]));
  const amountFor = (y: number) => (overrideAmount > 0 ? overrideAmount : (rateByYear.get(y) ?? 0));

  if (overrideAmount <= 0) {
    const missing = [...new Set(cells.map((c) => c.year))].filter((y) => !rateByYear.get(y));
    if (missing.length) return { ok: false as const, error: `Set a monthly rate for ${missing.join(", ")} first, or enter an amount to use for all months.` };
  }

  await db.$transaction(
    cells.map((c) =>
      db.welfareDue.upsert({
        where: { churchId_personId_year_month: { churchId: session.churchId, personId, year: c.year, month: c.month } },
        create: { churchId: session.churchId, personId, year: c.year, month: c.month, amount: amountFor(c.year) },
        update: { amount: amountFor(c.year) },
      }),
    ),
  );

  // First time we record dues for this member, capture their start (the earliest
  // month of this record) so "owed" counts from when they actually began.
  if (!member.welfareStart) {
    await db.person.update({
      where: { id: personId },
      data: { welfareStart: new Date(fromYear, fromMonth - 1, 1) },
    });
  }

  const total = cells.reduce((s, c) => s + amountFor(c.year), 0);
  const rangeLabel = `${MONTHS[fromMonth - 1]} ${fromYear} – ${MONTHS[toMonth - 1]} ${toYear}`;

  // Post the collected dues as income into the chosen account.
  const { postLedgerToAccount } = await import("@/lib/data/accounts");
  await postLedgerToAccount(session.churchId, {
    description: `Welfare dues — ${member.firstName} ${member.lastName} (${rangeLabel})`,
    category: "Welfare Dues",
    fund: "Welfare",
    amount: total,
    accountId: String(formData.get("accountId") ?? "").trim() || null,
  });

  let texted = false;
  if (notify) {
    const { memberOwedSummary } = await import("@/lib/data/welfare");
    const [summary, church] = await Promise.all([
      memberOwedSummary(session.churchId, personId),
      db.church.findUnique({ where: { id: session.churchId }, select: { welfareDuesReceiptTemplate: true } }),
    ]);
    if (summary.phone) {
      const balance = summary.owed > 0 ? `Balance still owing: GHS ${summary.owed.toLocaleString()}.` : "You're fully paid up. Thank you!";
      const msg = fill(church?.welfareDuesReceiptTemplate || DEFAULT_DUES_RECEIPT, {
        title: summary.title,
        name: summary.firstName,
        amount: total.toLocaleString(),
        months: rangeLabel,
        church: summary.churchName,
        owed: summary.owed.toLocaleString(),
        balance,
      });
      try {
        const { sendChurchSms } = await import("@/lib/sms/credits");
        const res = await sendChurchSms(session.churchId, summary.phone, msg, { note: "Welfare dues receipt" });
        texted = res.ok;
      } catch { /* SMS must not block recording */ }
    }
  }

  await audit(session, "create", "welfare-dues", `Recorded ${cells.length} month(s) welfare dues (${total}) for ${member.firstName} ${member.lastName}`);
  revalidatePath("/app/welfare");
  revalidatePath("/app/accounting");
  return { ok: true as const, months: cells.length, total, texted };
}

export async function deleteWelfareDue(formData: FormData) {
  const session = await requireModule("giving");
  if (session.isDemo) return;
  const id = String(formData.get("id"));
  await db.welfareDue.deleteMany({ where: { id, churchId: session.churchId } });
  revalidatePath("/app/welfare");
}

/** Full welfare history for one member (for the drill-down view). */
export async function memberDuesDetail(personId: string) {
  const session = await requireModule("giving");
  const { getMemberDuesDetail } = await import("@/lib/data/welfare");
  return getMemberDuesDetail(session.churchId, personId);
}

/** Build owing-reminder messages for members who owe (and have a phone). */
async function buildOwingMessages(churchId: string, onlyPersonId?: string) {
  const { getWelfareData } = await import("@/lib/data/welfare");
  const [data, church] = await Promise.all([
    getWelfareData(churchId),
    db.church.findUnique({ where: { id: churchId }, select: { name: true, welfareDuesReminderTemplate: true } }),
  ]);
  const churchName = church?.name ?? "your church";
  const tpl = church?.welfareDuesReminderTemplate || DEFAULT_DUES_REMINDER;
  const withPhone = await db.person.findMany({
    where: { churchId, status: { not: "inactive" }, phone: { not: null } },
    select: { id: true, firstName: true, title: true, phone: true },
  });
  const phoneMap = new Map(withPhone.map((p) => [p.id, { firstName: p.firstName, title: p.title ?? "", phone: p.phone! }]));

  return data.members
    .filter((m) => m.owed > 0 && phoneMap.has(m.id) && (!onlyPersonId || m.id === onlyPersonId))
    .map((m) => {
      const p = phoneMap.get(m.id)!;
      return {
        phone: p.phone,
        text: fill(tpl, { title: p.title, name: p.firstName, church: churchName, owed: m.owed.toLocaleString() }),
      };
    });
}

export async function previewOwingReminders(onlyPersonId?: string) {
  const session = await requireModule("giving");
  const { segmentsFor } = await import("@/config/sms");
  const { getSmsBalance } = await import("@/lib/sms/credits");
  const [messages, balance] = await Promise.all([
    buildOwingMessages(session.churchId, onlyPersonId),
    getSmsBalance(session.churchId),
  ]);
  const cost = messages.reduce((s, m) => s + segmentsFor(m.text), 0);
  return { ok: true as const, recipients: messages.length, cost, balance, remaining: balance - cost, enough: balance >= cost };
}

export async function sendOwingReminders(onlyPersonId?: string) {
  const session = await requireModule("giving");
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };
  const messages = await buildOwingMessages(session.churchId, onlyPersonId);
  if (messages.length === 0) return { ok: false as const, error: "No members owe dues (or none have a phone)." };

  const { sendChurchSms } = await import("@/lib/sms/credits");
  let sent = 0;
  for (const m of messages) {
    const res = await sendChurchSms(session.churchId, m.phone, m.text, { note: "Welfare dues reminder" });
    if (!res.ok && res.insufficient) {
      if (sent === 0) return { ok: false as const, error: `Not enough SMS credits — need ${res.cost}, have ${res.balance}.` };
      break;
    }
    if (res.ok) sent += res.sent;
  }
  await audit(session, "send", "welfare", `Sent ${sent} welfare dues reminder(s)`);
  revalidatePath("/app/welfare");
  return { ok: true as const, sent };
}

export async function createWelfareRecord(formData: FormData) {
  const session = await requireModule("giving");
  if (session.isDemo) return;

  const kind = String(formData.get("kind") ?? "aid") === "dues" ? "dues" : "aid";
  const type = String(formData.get("type") ?? "financial");
  const amount = parseFloat(String(formData.get("amount") ?? "0")) || null;
  const description = String(formData.get("description") ?? "").trim() || null;
  const dateStr = String(formData.get("date") ?? "").trim();
  const personId = String(formData.get("personId") ?? "").trim() || null;

  // Dues are welfare income — only members pay them, so a member is required and
  // the name comes from that member. Aid is money out to any recipient (member,
  // visitor, or a typed name).
  let recipientName = String(formData.get("recipientName") ?? "").trim();
  if (kind === "dues") {
    if (!personId) return;
    const member = await db.person.findFirst({ where: { id: personId, churchId: session.churchId }, select: { firstName: true, lastName: true } });
    if (!member) return;
    recipientName = `${member.firstName} ${member.lastName}`.trim();
  }
  if (!recipientName) return;

  const rec = await db.welfareRecord.create({
    data: {
      churchId: session.churchId,
      kind,
      recipientName,
      type: kind === "dues" ? "dues" : type,
      amount,
      description,
      personId,
      ...(dateStr ? { date: new Date(dateStr) } : {}),
    },
  });

  // Post to the account: dues add money, aid deducts it.
  if (amount && amount > 0) {
    const { postLedgerToAccount } = await import("@/lib/data/accounts");
    await postLedgerToAccount(session.churchId, {
      description: kind === "dues" ? `Welfare dues — ${recipientName}` : `Welfare aid — ${recipientName}`,
      category: kind === "dues" ? "Welfare Dues" : "Welfare",
      fund: "Welfare",
      amount: kind === "dues" ? amount : -amount,
      accountId: String(formData.get("accountId") ?? "").trim() || null,
    });
  }

  await audit(session, "create", "welfare", `Welfare ${kind === "dues" ? "dues from" : "aid for"} ${recipientName}${amount ? ` (${amount})` : ""}`, rec.id);
  revalidatePath("/app/welfare");
  revalidatePath("/app/accounting");
}

export async function deleteWelfareRecord(formData: FormData) {
  const session = await requireModule("giving");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  const rec = await db.welfareRecord.findFirst({ where: { id, churchId: session.churchId }, select: { recipientName: true } });
  await db.welfareRecord.deleteMany({ where: { id, churchId: session.churchId } });
  if (rec) await audit(session, "delete", "welfare", `Deleted welfare for ${rec.recipientName}`, id);
  revalidatePath("/app/welfare");
}
