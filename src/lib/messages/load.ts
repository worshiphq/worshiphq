import "server-only";
import { db } from "@/lib/db";
import { CATALOG } from "@/lib/messages/catalog";

export type MessageCenterData = {
  /** key -> the church's own wording (only keys that were changed). */
  values: Record<string, string>;
  /** Automation triggers this church has set up (an automation text can only be edited when it exists). */
  automations: string[];
};

/** Everything the message editor needs to show what this church has customised. */
export async function loadMessageCenter(churchId: string): Promise<MessageCenterData> {
  const [church, automations] = await Promise.all([
    db.church.findUnique({
      where: { id: churchId },
      select: {
        messageTemplates: true, attendanceReportTemplate: true, titheReceiptTemplate: true, harvestReceiptTemplate: true,
        pledgeReceiptTemplate: true, pledgeReminderTemplate: true, welfareDuesReceiptTemplate: true, welfareDuesReminderTemplate: true,
      },
    }),
    db.automation.findMany({ where: { churchId }, select: { trigger: true, messageTemplate: true } }),
  ]);
  const saved = (church?.messageTemplates as Record<string, string> | null) ?? {};
  const values: Record<string, string> = {};
  for (const item of CATALOG) {
    let v: string | null | undefined;
    if (item.store === "registry") v = saved[item.key];
    else if (item.store === "church") v = (church as Record<string, unknown> | null)?.[item.field!] as string | null | undefined;
    else v = saved[item.key] ?? automations.find((a) => a.trigger === item.field)?.messageTemplate;
    if (typeof v === "string" && v.trim() && v.trim() !== item.default.trim()) values[item.key] = v;
  }
  return { values, automations: [...new Set(automations.map((a) => a.trigger))] };
}
