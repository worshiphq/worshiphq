"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";

export async function createCampaign(formData: FormData) {
  const session = await requireModule("giving");
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
  const session = await requireModule("giving");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  await db.campaign.deleteMany({ where: { id, churchId: session.churchId } });
  revalidatePath("/app/pledges");
}

export async function createPledge(formData: FormData) {
  const session = await requireModule("giving");
  if (session.isDemo) return;

  const donorName = String(formData.get("donorName") ?? "").trim();
  const amount = parseFloat(String(formData.get("amount") ?? "0"));
  if (!donorName || amount <= 0) return;

  const campaignId = String(formData.get("campaignId") ?? "").trim() || null;
  const dueAt = String(formData.get("dueAt") ?? "").trim();

  await db.pledge.create({
    data: {
      churchId: session.churchId,
      donorName,
      amount,
      ...(campaignId ? { campaignId } : {}),
      ...(dueAt ? { dueAt: new Date(dueAt) } : {}),
    },
  });

  revalidatePath("/app/pledges");
}

export async function recordPledgePayment(formData: FormData) {
  const session = await requireModule("giving");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  const payment = parseFloat(String(formData.get("payment") ?? "0"));
  if (payment <= 0) return;

  const pledge = await db.pledge.findFirst({
    where: { id, churchId: session.churchId },
    select: { fulfilled: true, amount: true, campaignId: true },
  });
  if (!pledge) return;

  const newFulfilled = Math.min(Number(pledge.amount), Number(pledge.fulfilled) + payment);

  await db.pledge.update({
    where: { id },
    data: { fulfilled: newFulfilled },
  });

  if (pledge.campaignId) {
    await db.campaign.update({
      where: { id: pledge.campaignId },
      data: { raised: { increment: payment } },
    });
  }

  revalidatePath("/app/pledges");
}

export async function deletePledge(formData: FormData) {
  const session = await requireModule("giving");
  if (session.isDemo) return;

  const id = String(formData.get("id"));
  await db.pledge.deleteMany({ where: { id, churchId: session.churchId } });
  revalidatePath("/app/pledges");
}
