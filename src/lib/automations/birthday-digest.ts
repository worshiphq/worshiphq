import "server-only";
import { db } from "@/lib/db";
import { notifyChurchAdmins } from "@/lib/notify/admins";

const MMDD = (d: Date) => `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const DAY_LABEL = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

/**
 * Weekly admin digest of the coming week's birthdays. Runs on each church's
 * chosen weekday (birthdayDigestDay) and lists everyone with a birthday in the
 * next 7 days so leaders can plan. Editable/toggleable in Settings.
 */
export async function runBirthdayDigests(now = new Date()) {
  const weekday = now.getDay(); // 0=Sun … 6=Sat
  const churches = await db.church.findMany({
    where: { isDemo: false, birthdayDigestOn: true, birthdayDigestDay: weekday },
    select: { id: true, name: true, messageTemplates: true },
  });
  const { templateFor, renderTemplate } = await import("@/lib/messages/registry");
  if (churches.length === 0) return { churches: 0, sent: 0 };

  // The 7 date keys (MM-DD) from today through +6 days.
  const days: { key: string; label: string }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getTime() + i * 86400000);
    days.push({ key: MMDD(d), label: DAY_LABEL(d) });
  }
  const keySet = days.map((d) => d.key);
  const labelByKey = new Map(days.map((d) => [d.key, d.label]));

  let sent = 0;
  for (const church of churches) {
    const people = await db.person.findMany({
      where: { churchId: church.id, birthday: { in: keySet } },
      select: { firstName: true, lastName: true, birthday: true },
    });
    if (people.length === 0) continue;

    // Order by their position in the upcoming week.
    people.sort((a, b) => keySet.indexOf(a.birthday!) - keySet.indexOf(b.birthday!));

    const lines = people.map((p) => `• ${p.firstName} ${p.lastName} — ${labelByKey.get(p.birthday!) ?? ""}`);
    const smsList = people.slice(0, 8).map((p) => `${p.firstName} ${p.lastName} (${labelByKey.get(p.birthday!)?.split(",")[0] ?? ""})`).join(", ");

    const sms = renderTemplate(templateFor(church.messageTemplates, "birthday_digest"), {
      count: String(people.length),
      church: church.name,
      list: `${smsList}${people.length > 8 ? "..." : ""}`,
    });
    await notifyChurchAdmins(church.id, {
      subject: "This week's birthdays",
      sms,
      emailHtml: `<h2>🎂 Birthdays this week — ${church.name}</h2><p>${people.length} member${people.length !== 1 ? "s" : ""} celebrating in the next 7 days:</p><ul>${lines.map((l) => `<li>${l.replace("• ", "")}</li>`).join("")}</ul>`,
    });
    sent++;
  }

  return { churches: churches.length, sent };
}
