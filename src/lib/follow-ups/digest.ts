import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { ymdInTz, timeReached } from "@/lib/time/tz";
import { sendEmail } from "@/lib/integrations/email";
import { forEachChurch, type Deadline } from "@/lib/automations/pool";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type Item = { title: string; who: string | null; overdueDays: number; assignee: string | null };

function itemLine(i: Item) {
  const when = i.overdueDays > 0 ? `<span style="color:#b45309">${i.overdueDays} day${i.overdueDays === 1 ? "" : "s"} overdue</span>` : "due today";
  return `<li style="margin:6px 0"><strong>${esc(i.title)}</strong>${i.who ? ` - ${esc(i.who)}` : ""} <span style="color:#6b6456">(${when}${i.assignee ? `, ${esc(i.assignee)}` : ""})</span></li>`;
}

function emailBody(churchName: string, intro: string, items: Item[]) {
  const url = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/app/follow-ups`;
  return `<div style="font-family:system-ui,sans-serif;max-width:560px;color:#1c1a16">
    <h2 style="margin:0 0 6px;color:#0d7377">Follow-ups that need attention</h2>
    <p style="margin:0 0 14px;color:#6b6456">${esc(churchName)}</p>
    <p>${intro}</p>
    <ul style="padding-left:18px">${items.map(itemLine).join("")}</ul>
    <p style="margin-top:18px"><a href="${url}" style="background:#0d7377;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600">Open follow-ups</a></p>
  </div>`;
}

/**
 * Once a day per church (around 8am church-local), email each team member the
 * follow-ups assigned to them that are due today or overdue, and email the
 * church admins anything due or overdue that has nobody assigned. Email only, so
 * it never spends SMS credits. A per-day claim on Church.followUpDigestSent keeps
 * it to one run no matter how often the cron ticks.
 */
export async function runFollowUpDigest(now = new Date(), ignoreHour = false, deadline?: Deadline) {
  const churches = await db.church.findMany({
    where: { isDemo: false, followUps: { some: { status: { not: "done" }, dueDate: { not: null, lte: new Date(now.getTime() + 2 * 86400000) } } } },
    select: { id: true, name: true, timezone: true },
  });

  let emails = 0;
  const pool = await forEachChurch(churches, async (church) => {
    if (!ignoreHour && !timeReached(now, church.timezone, 8, 0)) return;
    const todayYmd = ymdInTz(now, church.timezone);
    const claim = await db.church.updateMany({
      where: { id: church.id, OR: [{ followUpDigestSent: null }, { followUpDigestSent: { not: todayYmd } }] },
      data: { followUpDigestSent: todayYmd },
    });
    if (claim.count === 0) return;

    const open = await db.followUp.findMany({
      where: { churchId: church.id, status: { not: "done" }, dueDate: { not: null, lte: new Date(now.getTime() + 2 * 86400000) } },
      include: {
        person: { select: { firstName: true, lastName: true } },
        visitor: { select: { firstName: true, lastName: true } },
        assignee: { select: { id: true, name: true, email: true } },
      },
      orderBy: { dueDate: "asc" },
    });

    const startOfToday = Date.parse(`${todayYmd}T00:00:00Z`);
    const due = open
      .map((f) => {
        const dueYmd = ymdInTz(f.dueDate!, church.timezone);
        const overdueDays = Math.round((startOfToday - Date.parse(`${dueYmd}T00:00:00Z`)) / 86400000);
        const who = f.visitor ?? f.person;
        return { f, overdueDays, item: { title: f.title, who: who ? `${who.firstName} ${who.lastName}`.trim() : null, overdueDays, assignee: f.assignee?.name ?? null } };
      })
      .filter((x) => x.overdueDays >= 0); // due today or earlier
    if (due.length === 0) return;

    const real = (e: string | null | undefined): e is string => !!e && !e.endsWith("@invite.worshiphq.app");

    // Each assignee gets their own list.
    const byAssignee = new Map<string, { email: string; items: Item[] }>();
    for (const { f, item } of due) {
      if (!f.assignee || !real(f.assignee.email)) continue;
      const e = byAssignee.get(f.assignee.id) ?? { email: f.assignee.email, items: [] };
      e.items.push({ ...item, assignee: null });
      byAssignee.set(f.assignee.id, e);
    }
    for (const { email, items } of byAssignee.values()) {
      const r = await sendEmail({
        to: email,
        subject: `${items.length} follow-up${items.length === 1 ? "" : "s"} for you today - ${church.name}`,
        html: emailBody(church.name, "These follow-ups are assigned to you and are due today or overdue:", items),
      });
      if (r.ok) emails++;
    }

    // Admins hear about anything nobody owns.
    const unassigned = due.filter(({ f }) => !f.assignee).map(({ item }) => item);
    if (unassigned.length > 0) {
      const admins = await db.user.findMany({ where: { churchId: church.id, role: { in: ["Owner", "Admin", "Pastor"] } }, select: { email: true } });
      const to = [...new Set(admins.map((a) => a.email).filter(real))];
      if (to.length > 0) {
        const r = await sendEmail({
          to,
          subject: `${unassigned.length} follow-up${unassigned.length === 1 ? "" : "s"} with nobody assigned - ${church.name}`,
          html: emailBody(church.name, "These follow-ups are due or overdue and nobody is assigned to them yet. Open follow-ups to assign someone:", unassigned),
        });
        if (r.ok) emails++;
      }
    }
  }, { deadline, label: "followUpDigest" });

  return { churches: churches.length, emails, ...pool };
}
