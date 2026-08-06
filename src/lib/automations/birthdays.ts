import "server-only";
import { db } from "@/lib/db";
import { notifyChurchAdmins } from "@/lib/notify/admins";
import { localParts, mmddInTz } from "@/lib/time/tz";
import { templateFor, renderTemplate } from "@/lib/messages/registry";

/**
 * Birthday automations. The cron runs hourly; for each church we only act when
 * the church's LOCAL hour equals its birthdaySendHour, so messages land in the
 * morning wherever the church is.
 *
 *  - Member wish     (birthdayWishOn):     text each member on their birthday.
 *  - Admin same-day  (birthdayAdminAlertOn): tell admins who's celebrating today.
 *  - Weekly digest   (birthdayDigestOn):    on birthdayDigestDay, list the week.
 */
export async function runBirthdays(now = new Date()) {
  const churches = await db.church.findMany({
    where: {
      isDemo: false,
      OR: [{ birthdayWishOn: true }, { birthdayAdminAlertOn: true }, { birthdayDigestOn: true }],
    },
    select: {
      id: true, name: true, timezone: true, birthdaySendHour: true,
      birthdayWishOn: true, birthdayAdminAlertOn: true, birthdayDigestOn: true, birthdayDigestDay: true,
      messageTemplates: true,
    },
  });

  let wishes = 0, adminAlerts = 0, digests = 0;

  for (const church of churches) {
    const { hour, weekday } = localParts(now, church.timezone);
    if (hour !== church.birthdaySendHour) continue; // only at the church's chosen hour

    const todayKey = mmddInTz(now, church.timezone, 0);

    // Members celebrating today.
    const todayPeople = await db.person.findMany({
      where: { churchId: church.id, status: { not: "inactive" }, birthday: todayKey },
      select: { firstName: true, lastName: true, title: true, phone: true },
    });

    // 1) Wish each member (SMS).
    if (church.birthdayWishOn && todayPeople.length > 0) {
      const tpl = templateFor(church.messageTemplates, "birthday_wish");
      const { sendChurchSms } = await import("@/lib/sms/credits");
      for (const p of todayPeople) {
        if (!p.phone) continue;
        const text = renderTemplate(tpl, { title: p.title ?? "", name: p.firstName, church: church.name });
        try { const r = await sendChurchSms(church.id, p.phone, text, { note: "Birthday wish" }); if (r.ok) wishes++; }
        catch { /* keep going */ }
      }
    }

    // 2) Same-day admin alert.
    if (church.birthdayAdminAlertOn && todayPeople.length > 0) {
      const names = todayPeople.map((p) => `${p.firstName} ${p.lastName}`.trim());
      const sms = renderTemplate(templateFor(church.messageTemplates, "birthday_admin_today"), {
        count: String(todayPeople.length), church: church.name, list: names.slice(0, 8).join(", ") + (names.length > 8 ? "..." : ""),
      });
      await notifyChurchAdmins(church.id, {
        subject: "Today's birthdays",
        sms,
        emailHtml: `<h2>Birthdays today — ${church.name}</h2><ul>${names.map((n) => `<li>${n}</li>`).join("")}</ul>`,
      });
      adminAlerts++;
    }

    // 3) Weekly digest on the chosen weekday.
    if (church.birthdayDigestOn && weekday === church.birthdayDigestDay) {
      const keys: string[] = [];
      const labelByKey = new Map<string, string>();
      for (let i = 0; i < 7; i++) {
        const key = mmddInTz(now, church.timezone, i);
        keys.push(key);
        const d = new Date(now.getTime() + i * 86400000);
        labelByKey.set(key, d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }));
      }
      const people = await db.person.findMany({
        where: { churchId: church.id, status: { not: "inactive" }, birthday: { in: keys } },
        select: { firstName: true, lastName: true, birthday: true },
      });
      if (people.length > 0) {
        people.sort((a, b) => keys.indexOf(a.birthday!) - keys.indexOf(b.birthday!));
        const smsList = people.slice(0, 8).map((p) => `${p.firstName} ${p.lastName} (${labelByKey.get(p.birthday!)?.split(",")[0] ?? ""})`).join(", ");
        const sms = renderTemplate(templateFor(church.messageTemplates, "birthday_digest"), {
          count: String(people.length), church: church.name, list: `${smsList}${people.length > 8 ? "..." : ""}`,
        });
        await notifyChurchAdmins(church.id, {
          subject: "This week's birthdays",
          sms,
          emailHtml: `<h2>Birthdays this week — ${church.name}</h2><ul>${people.map((p) => `<li>${p.firstName} ${p.lastName} — ${labelByKey.get(p.birthday!) ?? ""}</li>`).join("")}</ul>`,
        });
        digests++;
      }
    }
  }

  return { churches: churches.length, wishes, adminAlerts, digests };
}
