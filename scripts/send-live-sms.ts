/**
 * One-off (18 Nov 2026): text each live church's owner about tonight's TikTok LIVE. One SMS segment each.
 * Dry run unless --apply. Logged in each church's Outreach history via sendOutreach.
 */
import { db } from "@/lib/db";
import { LIVE_CHURCH } from "@/lib/live-church";
import { isTeachingChurch } from "@/config/teaching-churches";
import { sendOutreach } from "@/lib/outreach/send";

const TITLES = /^(rev|revd|pastor|ps|apostle|bishop|dr|prophet|prophetess|elder|deacon|deaconess|mr|mrs|ms|miss|evangelist|minister|overseer|reverend|eld|pst|apst|bro|sis|rt|very|prof|hon|lady|madam|mama|papa|daddy)\.?$/i;
const build = (name: string) => `Hello ${name}, WorshipHQ is LIVE on TikTok tonight at 8PM GMT. Bring your questions on attendance, giving, SMS and more. Join: tiktok.com/@worshiphq.app`;
function greeting(full: string | null): string {
  const w = (full ?? "").trim().split(/\s+/).filter(Boolean);
  let n = w[0] ?? "";
  if (TITLES.test(n) && w[1]) n = `${w[0]} ${w[1]}`;
  n = n.replace(/[^A-Za-z .'\-]/g, "").trim();
  if (n && n === n.toUpperCase()) n = n.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
  if (!n || build(n).length > 160) return "Pastor";
  return n;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const cs = await db.church.findMany({ where: { ...LIVE_CHURCH, suspended: false }, select: { id: true, users: { where: { role: "Owner" }, orderBy: { createdAt: "asc" }, take: 1, select: { id: true, name: true, phone: true } } } });
  const seen = new Set<string>();
  const jobs: { churchId: string; userId: string; body: string }[] = [];
  for (const c of cs) {
    const u = c.users[0];
    if (isTeachingChurch(c.id) || !u?.phone) continue;
    const key = u.phone.replace(/\D/g, "").slice(-9);
    if (seen.has(key)) continue;
    seen.add(key);
    jobs.push({ churchId: c.id, userId: u.id, body: build(greeting(u.name)) });
  }
  const longest = Math.max(...jobs.map((j) => j.body.length));
  console.log(`${jobs.length} texts, longest ${longest} chars, using "Pastor": ${jobs.filter((j) => j.body.startsWith("Hello Pastor,")).length}`);
  console.log("Samples:\n" + jobs.slice(0, 4).map((j) => " " + j.body).join("\n"));
  if (!apply) return;
  let sent = 0, failed = 0, i = 0;
  const worker = async () => {
    while (i < jobs.length) {
      const j = jobs[i++]!;
      const r = await sendOutreach({ churchId: j.churchId, userId: j.userId, channel: "sms", template: "custom-sms", body: j.body }).catch((e) => ({ ok: false, status: "failed", error: String(e) }));
      if (r.status === "sent") sent++; else { failed++; console.log("fail", j.churchId, (r as { error?: string }).error, r.status); }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  console.log(`Done: sent ${sent}, not sent ${failed}`);
}
main().finally(() => db.$disconnect());
