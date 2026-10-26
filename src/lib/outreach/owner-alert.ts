import "server-only";
import { db } from "@/lib/db";
import { sendSms, type SmsResult } from "@/lib/integrations/sms";
import { getReceiptSettings } from "@/lib/receipts/service";

/** The number signup texts go to: the one saved for alerts, else the company phone from the receipt details. */
export async function getAlertPhone(): Promise<{ phone: string; from: "saved" | "company" | "none" }> {
  const cfg = await db.platformConfig.findUnique({ where: { id: "default" }, select: { alertPhone: true } });
  if (cfg?.alertPhone?.trim()) return { phone: cfg.alertPhone.trim(), from: "saved" };
  const company = (await getReceiptSettings()).phone.trim();
  return company ? { phone: company, from: "company" } : { phone: "", from: "none" };
}

/** Text the platform owner when a new church signs up. Never throws, and never touches the demo church. */
export async function alertOwnerOfSignup(churchId: string): Promise<SmsResult | null> {
  try {
    const church = await db.church.findUnique({ where: { id: churchId }, select: { name: true, isDemo: true, city: true, country: true } });
    if (!church || church.isDemo) return null;
    const { phone } = await getAlertPhone();
    if (!phone) return null;
    const [owner, total] = await Promise.all([
      db.user.findFirst({ where: { churchId, role: "Owner" }, orderBy: { createdAt: "asc" }, select: { name: true, phone: true, email: true } }),
      db.church.count({ where: { isDemo: false } }),
    ]);
    const where = [church.city, church.country].filter(Boolean).join(", ");
    const who = owner ? `${owner.name}${owner.phone ? ` ${owner.phone}` : owner.email ? ` ${owner.email}` : ""}` : "no owner yet";
    const text = `New church on WorshipHQ: ${church.name}${where ? ` (${where})` : ""}. Owner: ${who}. That is ${total} churches now.`;
    return await sendSms(phone, text, { heading: null });
  } catch (e) {
    console.error("[signup alert]", (e as Error).message);
    return null;
  }
}
