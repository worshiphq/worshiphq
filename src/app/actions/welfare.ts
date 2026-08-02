"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

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
  const year = parseInt(String(formData.get("year") ?? ""), 10);
  const fromMonth = parseInt(String(formData.get("fromMonth") ?? "1"), 10);
  const toMonth = parseInt(String(formData.get("toMonth") ?? "12"), 10);
  const amountPerMonth = parseFloat(String(formData.get("amountPerMonth") ?? "0"));
  const notify = String(formData.get("notify") ?? "") === "on";

  if (!personId) return { ok: false as const, error: "Choose a member." };
  if (!year) return { ok: false as const, error: "Choose a year." };
  if (fromMonth < 1 || toMonth > 12 || fromMonth > toMonth) return { ok: false as const, error: "Choose a valid month range." };
  if (!amountPerMonth || amountPerMonth <= 0) return { ok: false as const, error: "Enter the amount per month." };

  const member = await db.person.findFirst({ where: { id: personId, churchId: session.churchId }, select: { firstName: true, lastName: true } });
  if (!member) return { ok: false as const, error: "Member not found." };

  const months: number[] = [];
  for (let m = fromMonth; m <= toMonth; m++) months.push(m);

  await db.$transaction(
    months.map((m) =>
      db.welfareDue.upsert({
        where: { churchId_personId_year_month: { churchId: session.churchId, personId, year, month: m } },
        create: { churchId: session.churchId, personId, year, month: m, amount: amountPerMonth },
        update: { amount: amountPerMonth },
      }),
    ),
  );

  const total = amountPerMonth * months.length;

  // Post the collected dues as income into the chosen account.
  const { postLedgerToAccount } = await import("@/lib/data/accounts");
  await postLedgerToAccount(session.churchId, {
    description: `Welfare dues — ${member.firstName} ${member.lastName} (${MONTHS[fromMonth - 1]}–${MONTHS[toMonth - 1]} ${year})`,
    category: "Welfare Dues",
    fund: "Welfare",
    amount: total,
    accountId: String(formData.get("accountId") ?? "").trim() || null,
  });

  let texted = false;
  if (notify) {
    const { memberOwedSummary } = await import("@/lib/data/welfare");
    const summary = await memberOwedSummary(session.churchId, personId);
    if (summary.phone) {
      const msg = `Dear ${summary.firstName}, your welfare dues of GHS ${total.toLocaleString()} (${MONTHS[fromMonth - 1]}–${MONTHS[toMonth - 1]} ${year}) have been received by ${summary.churchName}.${summary.owed > 0 ? ` Balance still owing: GHS ${summary.owed.toLocaleString()}.` : " You're fully paid up. Thank you!"} God bless.`;
      try {
        const { sendChurchSms } = await import("@/lib/sms/credits");
        const res = await sendChurchSms(session.churchId, summary.phone, msg, { note: "Welfare dues receipt" });
        texted = res.ok;
      } catch { /* SMS must not block recording */ }
    }
  }

  await audit(session, "create", "welfare-dues", `Recorded ${months.length} month(s) welfare dues (${total}) for ${member.firstName} ${member.lastName}`);
  revalidatePath("/app/welfare");
  revalidatePath("/app/accounting");
  return { ok: true as const, months: months.length, total, texted };
}

export async function deleteWelfareDue(formData: FormData) {
  const session = await requireModule("giving");
  if (session.isDemo) return;
  const id = String(formData.get("id"));
  await db.welfareDue.deleteMany({ where: { id, churchId: session.churchId } });
  revalidatePath("/app/welfare");
}

/** Build owing-reminder messages for members who owe (and have a phone). */
async function buildOwingMessages(churchId: string, onlyPersonId?: string) {
  const { getWelfareData } = await import("@/lib/data/welfare");
  const data = await getWelfareData(churchId);
  const church = await db.church.findUnique({ where: { id: churchId }, select: { name: true } });
  const churchName = church?.name ?? "your church";
  const withPhone = await db.person.findMany({
    where: { churchId, status: { not: "inactive" }, phone: { not: null } },
    select: { id: true, firstName: true, phone: true },
  });
  const phoneMap = new Map(withPhone.map((p) => [p.id, { firstName: p.firstName, phone: p.phone! }]));

  return data.members
    .filter((m) => m.owed > 0 && phoneMap.has(m.id) && (!onlyPersonId || m.id === onlyPersonId))
    .map((m) => {
      const p = phoneMap.get(m.id)!;
      return {
        phone: p.phone,
        text: `Dear ${p.firstName}, a friendly reminder from ${churchName}: your welfare dues balance is GHS ${m.owed.toLocaleString()}. Kindly settle when you can. God bless you.`,
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
