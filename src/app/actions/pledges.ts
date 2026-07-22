"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendChurchSms } from "@/lib/sms/credits";
import type { GiftMethod } from "@prisma/client";

const METHOD_FROM_LABEL: Record<string, GiftMethod> = {
  "MTN MoMo": "MTN_MoMo",
  "Telecel Cash": "Telecel_Cash",
  AirtelTigo: "AirtelTigo",
  Card: "Card",
  Cash: "Cash",
};

export const DEFAULT_PLEDGE_TEMPLATE =
  "Dear {name}, your pledge of GHS {amount} to {church} has been recorded{due}. Thank you and God bless you!";
export const DEFAULT_PLEDGE_PAYMENT_TEMPLATE =
  "Dear {name}, we've received GHS {amount} toward your pledge at {church}. Paid so far: GHS {paid} of GHS {total}. God bless you!";
export const DEFAULT_PLEDGE_REMINDER_TEMPLATE =
  "Dear {name}, a friendly reminder: your pledge of GHS {total} to {church} is due in {days} day(s). Outstanding: GHS {balance}. God bless you!";

const money = (n: number) =>
  n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fill(tpl: string, vars: Record<string, string>) {
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, "gi"), v),
    tpl,
  );
}

export async function createCampaign(formData: FormData) {
  const session = await requireModule("pledges");
  if (session.isDemo) return;

  const name = String(formData.get("name") ?? "").trim();
  const goal = parseFloat(String(formData.get("goal") ?? "0"));
  if (!name || goal <= 0) return;

  const endsAt = String(formData.get("endsAt") ?? "").trim();

  await db.campaign.create({
    data: {
      churchId: session.churchId,
      name,
      goal,
      ...(endsAt ? { endsAt: new Date(endsAt) } : {}),
    },
  });

  revalidatePath("/app/pledges");
}

export async function deleteCampaign(formData: FormData) {
  const session = await requireModule("pledges");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  await db.campaign.deleteMany({ where: { id, churchId: session.churchId } });
  revalidatePath("/app/pledges");
}

/**
 * Record a pledge for an existing member (phone pulled from their record) or a
 * visitor (name + phone typed in), optionally toward a campaign or harvest.
 * Sends an editable SMS confirmation, just like tithes.
 */
export async function createPledge(formData: FormData) {
  const session = await requireModule("pledges");
  if (session.isDemo) return { ok: false, error: "Read-only demo." };

  const donorType = String(formData.get("donorType") ?? "member").trim() === "visitor" ? "visitor" : "member";
  const personId = String(formData.get("personId") ?? "").trim() || null;
  const amount = parseFloat(String(formData.get("amount") ?? "0"));
  if (!amount || amount <= 0) return { ok: false, error: "Enter a valid amount." };

  let donorName = String(formData.get("donorName") ?? "").trim();
  let donorPhone = String(formData.get("donorPhone") ?? "").trim() || null;

  // For members, take the name/phone straight off their record.
  if (donorType === "member") {
    if (!personId) return { ok: false, error: "Choose a member." };
    const person = await db.person.findFirst({
      where: { id: personId, churchId: session.churchId },
      select: { firstName: true, lastName: true, phone: true },
    });
    if (!person) return { ok: false, error: "Member not found." };
    donorName = `${person.firstName} ${person.lastName}`.trim();
    donorPhone = person.phone ?? donorPhone;
  }
  if (!donorName) return { ok: false, error: "Enter the pledger's name." };

  const campaignId = String(formData.get("campaignId") ?? "").trim() || null;
  const harvestId = String(formData.get("harvestId") ?? "").trim() || null;
  const dueAtStr = String(formData.get("dueAt") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const notify = String(formData.get("notify") ?? "on") !== "off";

  await db.pledge.create({
    data: {
      churchId: session.churchId,
      donorName,
      donorPhone,
      donorType,
      amount,
      notes,
      ...(personId && donorType === "member" ? { personId } : {}),
      ...(campaignId ? { campaignId } : {}),
      ...(harvestId ? { harvestId } : {}),
      ...(dueAtStr ? { dueAt: new Date(dueAtStr) } : {}),
    },
  });

  if (notify && donorPhone) {
    const church = await db.church.findUnique({
      where: { id: session.churchId },
      select: { name: true, pledgeReceiptTemplate: true },
    });
    const due = dueAtStr
      ? `, due ${new Date(dueAtStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
      : "";
    const msg = fill(church?.pledgeReceiptTemplate || DEFAULT_PLEDGE_TEMPLATE, {
      name: donorName,
      amount: money(amount),
      church: church?.name ?? "your church",
      due,
    });
    await sendChurchSms(session.churchId, donorPhone, msg, { note: "Pledge confirmation" });
  }

  revalidatePath("/app/pledges");
  revalidatePath("/app/harvest");
  return { ok: true };
}

/** Record a part-payment against a pledge, keep the ledger, and text a receipt. */
export async function recordPledgePayment(formData: FormData) {
  const session = await requireModule("pledges");
  if (session.isDemo) return { ok: false, error: "Read-only demo." };

  const id = String(formData.get("id"));
  const payment = parseFloat(String(formData.get("payment") ?? "0"));
  if (!payment || payment <= 0) return { ok: false, error: "Enter a valid amount." };

  const pledge = await db.pledge.findFirst({
    where: { id, churchId: session.churchId },
    select: { id: true, fulfilled: true, amount: true, campaignId: true, donorName: true, donorPhone: true },
  });
  if (!pledge) return { ok: false, error: "Pledge not found." };

  const method = METHOD_FROM_LABEL[String(formData.get("method") ?? "Cash")] ?? "Cash";
  const note = String(formData.get("note") ?? "").trim() || null;
  const notify = String(formData.get("notify") ?? "on") !== "off";

  await db.pledgePayment.create({
    data: { churchId: session.churchId, pledgeId: pledge.id, amount: payment, method, note },
  });

  const newFulfilled = Math.min(Number(pledge.amount), Number(pledge.fulfilled) + payment);
  await db.pledge.update({ where: { id }, data: { fulfilled: newFulfilled } });

  if (pledge.campaignId) {
    await db.campaign.update({
      where: { id: pledge.campaignId },
      data: { raised: { increment: payment } },
    });
  }

  if (notify && pledge.donorPhone) {
    const church = await db.church.findUnique({
      where: { id: session.churchId },
      select: { name: true },
    });
    const msg = fill(DEFAULT_PLEDGE_PAYMENT_TEMPLATE, {
      name: pledge.donorName,
      amount: money(payment),
      paid: money(newFulfilled),
      total: money(Number(pledge.amount)),
      church: church?.name ?? "your church",
    });
    await sendChurchSms(session.churchId, pledge.donorPhone, msg, { note: "Pledge payment receipt" });
  }

  revalidatePath("/app/pledges");
  revalidatePath("/app/harvest");
  return { ok: true };
}

export async function deletePledge(formData: FormData) {
  const session = await requireModule("pledges");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  await db.pledge.deleteMany({ where: { id, churchId: session.churchId } });
  revalidatePath("/app/pledges");
}

/** Admin settings: when to auto-remind, and the message wording. */
export async function savePledgeSettings(formData: FormData) {
  const session = await requireModule("pledges");
  if (session.isDemo) return;

  const days = formData
    .getAll("reminderDays")
    .map((d) => parseInt(String(d)))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => b - a);

  await db.church.update({
    where: { id: session.churchId },
    data: {
      pledgeReminderDays: days,
      pledgeReceiptTemplate: String(formData.get("receiptTemplate") ?? "").trim() || null,
      pledgeReminderTemplate: String(formData.get("reminderTemplate") ?? "").trim() || null,
    },
  });

  revalidatePath("/app/pledges");
}

/** Manually nudge a single pledge now. */
export async function sendPledgeReminder(formData: FormData) {
  const session = await requireModule("pledges");
  if (session.isDemo) return { ok: false, error: "Read-only demo." };

  const id = String(formData.get("id"));
  const pledge = await db.pledge.findFirst({
    where: { id, churchId: session.churchId },
    select: { donorName: true, donorPhone: true, amount: true, fulfilled: true, dueAt: true },
  });
  if (!pledge) return { ok: false, error: "Pledge not found." };
  if (!pledge.donorPhone) return { ok: false, error: "No phone number on this pledge." };

  const church = await db.church.findUnique({
    where: { id: session.churchId },
    select: { name: true, pledgeReminderTemplate: true },
  });
  const balance = Number(pledge.amount) - Number(pledge.fulfilled);
  const days = pledge.dueAt
    ? Math.max(0, Math.ceil((pledge.dueAt.getTime() - Date.now()) / 86_400_000))
    : 0;

  const msg = fill(church?.pledgeReminderTemplate || DEFAULT_PLEDGE_REMINDER_TEMPLATE, {
    name: pledge.donorName,
    total: money(Number(pledge.amount)),
    balance: money(balance),
    church: church?.name ?? "your church",
    days: String(days),
  });
  const res = await sendChurchSms(session.churchId, pledge.donorPhone, msg, { note: "Pledge reminder" });
  return res.ok ? { ok: true } : { ok: false, error: "Couldn't send — check your SMS credits." };
}
