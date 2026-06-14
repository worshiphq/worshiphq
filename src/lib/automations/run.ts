import "server-only";
import { db } from "@/lib/db";
import { sendSms } from "@/lib/integrations/sms";
import type { Channel } from "@prisma/client";

/** Today's date as MM-DD (matches Person.birthday / Person.anniversary). */
function todayMMDD(now = new Date()): string {
  return `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

interface AutomationOutcome {
  churchId: string;
  automation: string;
  trigger: string;
  sent: number;
}

/**
 * Run all active automations for every church and send the resulting messages.
 * Designed to be called daily by the cron endpoint. Returns a per-automation
 * breakdown so the endpoint can report what happened.
 *
 * Supported triggers:
 *  - birthday          → people whose birthday is today
 *  - anniversary       → people whose anniversary is today
 *  - visitor_followup  → visitors who joined in the last 3 days
 *  - lapsed            → inactive members (gentle check-in)
 */
export async function runAutomations(now = new Date()): Promise<{
  ran: number;
  totalSent: number;
  outcomes: AutomationOutcome[];
}> {
  const churches = await db.church.findMany({
    where: { isDemo: false },
    select: { id: true, name: true },
  });

  const outcomes: AutomationOutcome[] = [];
  const mmdd = todayMMDD(now);
  const threeDaysAgo = new Date(now.getTime() - 3 * 86400000);

  for (const church of churches) {
    const automations = await db.automation.findMany({
      where: { churchId: church.id, active: true },
    });

    for (const a of automations) {
      const targets = await targetsFor(church.id, a.trigger, mmdd, threeDaysAgo);
      if (targets.length === 0) continue;

      let sent = 0;
      for (const t of targets) {
        if (!t.phone) continue;
        const message = messageFor(a.trigger, t.firstName, church.name);
        const res = await sendSms(t.phone, message);
        if (res.ok) sent++;
      }

      if (sent > 0) {
        await db.automation.update({
          where: { id: a.id },
          data: { runs: { increment: sent } },
        });
        // Log a communication record so it shows in the church's history.
        await db.communication.create({
          data: {
            churchId: church.id,
            name: `${a.name} (automated)`,
            channel: a.channel as Channel,
            body: messageFor(a.trigger, "{name}", church.name),
            segment: a.trigger,
            sent,
            delivered: sent,
            status: "sent",
          },
        });
      }

      outcomes.push({ churchId: church.id, automation: a.name, trigger: a.trigger, sent });
    }
  }

  const totalSent = outcomes.reduce((s, o) => s + o.sent, 0);
  return { ran: outcomes.length, totalSent, outcomes };
}

type Target = { firstName: string; lastName: string; phone: string | null };

async function targetsFor(
  churchId: string,
  trigger: string,
  mmdd: string,
  threeDaysAgo: Date,
): Promise<Target[]> {
  const select = { firstName: true, lastName: true, phone: true };
  switch (trigger) {
    case "birthday":
      return db.person.findMany({ where: { churchId, birthday: mmdd }, select });
    case "anniversary":
      return db.person.findMany({ where: { churchId, anniversary: mmdd }, select });
    case "visitor_followup":
      return db.person.findMany({
        where: { churchId, status: "visitor", joinedAt: { gte: threeDaysAgo } },
        select,
      });
    case "lapsed":
      return db.person.findMany({ where: { churchId, status: "inactive" }, select });
    default:
      return [];
  }
}

function messageFor(trigger: string, firstName: string, churchName: string): string {
  switch (trigger) {
    case "birthday":
      return `Happy birthday, ${firstName}! 🎉 The whole family at ${churchName} is celebrating you today. May God bless your new year. — ${churchName}`;
    case "anniversary":
      return `Happy anniversary, ${firstName}! ${churchName} celebrates God's faithfulness in your union. May your love keep growing. 💍`;
    case "visitor_followup":
      return `Hi ${firstName}, it was a joy to have you at ${churchName}! We'd love to see you again this Sunday. Reply if we can pray with you. 🙏`;
    case "lapsed":
      return `Hi ${firstName}, we've missed you at ${churchName}. You're always welcome — we'd love to reconnect. Is there any way we can support you? 🙏`;
    default:
      return `A message from ${churchName}.`;
  }
}
