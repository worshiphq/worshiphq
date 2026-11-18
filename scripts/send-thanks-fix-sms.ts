/** One-off (19 Nov 2026): tell the 3 churches hit by the "thank-you only 4 at a time" bug that it is fixed. Dry run unless --apply. */
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { sendOutreach } from "@/lib/outreach/send";

const CHURCHES = ["Divine Power Revival Ministry", "Qodesh Adamah Worship Centre", "Grace Baptist Church - Theophany"];
const TITLES = /^(rev|revd|pastor|ps|apostle|bishop|dr|prophet|prophetess|elder|deacon|deaconess|mr|mrs|ms|miss|evangelist|minister|overseer|reverend|eld|pst|apst|bro|sis|rt|very|prof|hon|lady|madam)\.?$/i;
const build = (n: string) => `Hello${n ? " " + n : ""}, thank you for your patience. We found and fixed the issue that sent thank-you SMS only 4 at a time; it now reaches everyone at once. Sorry for any inconvenience caused. Your feedback helps us keep improving WorshipHQ. If you ever need help, call or WhatsApp us on 0552399981. God Bless You!`;
function greet(full: string | null) {
  const w = (full ?? "").trim().split(/\s+/).filter(Boolean);
  let n = w[0] ?? "";
  if (TITLES.test(n) && w[1]) n = `${w[0]} ${w[1]}`;
  n = n.replace(/[^A-Za-z .'\-]/g, "").trim();
  if (n && n === n.toUpperCase()) n = n.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
  // Names on file that are not a person (the church or a team name) get a plain "Hello,".
  if (/^(qodesh|media|admin|church|office|secretary)$/i.test(n)) return "";
  return n && build(n).length <= 306 ? n : "Pastor";
}
async function main() {
  const apply = process.argv.includes("--apply");
  console.log("Sender:", env.HUBTEL_SENDER_ID);
  for (const name of CHURCHES) {
    const c = await db.church.findFirst({ where: { name: { startsWith: name } }, select: { id: true, name: true, users: { where: { role: "Owner" }, orderBy: { createdAt: "asc" }, take: 1, select: { id: true, name: true, phone: true } } } });
    const u = c?.users[0];
    if (!c || !u?.phone) { console.log("SKIP (no owner phone):", name); continue; }
    const body = build(greet(u.name));
    console.log(`${c.name}: "${body.slice(0, 40)}..." (${body.length} chars)`);
    if (apply) { const r = await sendOutreach({ churchId: c.id, userId: u.id, channel: "sms", template: "custom-sms", body }); console.log("  ->", r.status, (r as { error?: string }).error ?? ""); }
  }
  await db.$disconnect();
}
main();
