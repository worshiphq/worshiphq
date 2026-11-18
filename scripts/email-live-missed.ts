/** One-off (18 Nov 2026): email the church owners whose TikTok LIVE text failed tonight. Dry run unless --apply. */
import { db } from "@/lib/db";
import { sendOutreach } from "@/lib/outreach/send";

const TITLES = /^(rev|revd|pastor|ps|apostle|bishop|dr|prophet|prophetess|elder|deacon|deaconess|mr|mrs|ms|miss|evangelist|minister|overseer|reverend|eld|pst|apst|bro|sis|rt|very|prof|hon|lady|madam|mama|papa|daddy)\.?$/i;
function greeting(full: string | null): string {
  const w = (full ?? "").trim().split(/\s+/).filter(Boolean);
  let n = w[0] ?? "";
  if (TITLES.test(n) && w[1]) n = `${w[0]} ${w[1]}`;
  n = n.replace(/[^\p{L} .'\-]/gu, "").trim();
  if (n && n === n.toUpperCase()) n = n.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
  return n || "Pastor";
}
const subject = "WorshipHQ is LIVE on TikTok tonight at 8PM GMT";
const body = (name: string) => `Hello ${name},

WorshipHQ is going LIVE on TikTok tonight at 8:00 PM GMT.

Bring your questions on attendance, giving, SMS, follow-up, check-in devices and more. We are answering them live.

Join us here: https://www.tiktok.com/@worshiphq.app

Please share with your church admin team.

God bless,
The WorshipHQ team`;

async function main() {
  const apply = process.argv.includes("--apply");
  const failed = await db.outreachMessage.findMany({ where: { channel: "sms", status: "failed", createdAt: { gte: new Date(Date.now() - 4 * 3600e3) }, body: { contains: "LIVE on TikTok" } }, select: { churchId: true, userId: true } });
  const users = await db.user.findMany({ where: { id: { in: failed.map((f) => f.userId!).filter(Boolean) } }, select: { id: true, churchId: true, name: true, email: true } });
  const seen = new Set<string>();
  const jobs = users.filter((u) => u.email && !seen.has(u.email.toLowerCase()) && seen.add(u.email.toLowerCase()));
  console.log(`${failed.length} failed texts, ${jobs.length} owners to email`);
  console.log("Sample:\n" + body(greeting(jobs[0]?.name ?? null)));
  if (!apply) return;
  let sent = 0, notSent = 0;
  for (const u of jobs) {
    const r = await sendOutreach({ churchId: u.churchId!, userId: u.id, channel: "email", template: "custom-email", subject, body: body(greeting(u.name)) }).catch((e) => ({ status: "failed", error: String(e) }));
    if (r.status === "sent") sent++; else { notSent++; console.log("not sent", u.churchId, r.status, (r as { error?: string }).error); }
  }
  console.log(`Done: emailed ${sent}, not sent ${notSent}`);
}
main().finally(() => db.$disconnect());
