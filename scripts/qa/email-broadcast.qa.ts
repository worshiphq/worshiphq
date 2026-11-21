/**
 * Email broadcast for churches outside Ghana, on a throwaway internal church (zz-qa-extra-...).
 *   npx tsx --require ./scripts/qa/preload-session.cjs --env-file=.env scripts/qa/email-broadcast.qa.ts
 * Email is stubbed locally. Only touches the church it creates, and deletes it at the end.
 */
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { authSecret } from "@/lib/auth/tokens";

let pass = 0, fail = 0;
const ok = (cond: unknown, msg: string) => { if (cond) { pass++; console.log("  PASS", msg); } else { fail++; console.log("  FAIL", msg); } };
const cookieFor = (uid: string, sv: number) => {
  const body = Buffer.from(JSON.stringify({ uid, sv, exp: Date.now() + 3600_000 })).toString("base64url");
  return `${body}.${crypto.createHmac("sha256", authSecret()).update(body).digest("base64url")}`;
};

(async () => {
  const tag = crypto.randomBytes(4).toString("hex");
  const slug = `zz-qa-extra-${tag}`;
  const church = await db.church.create({
    data: {
      slug, name: "zz QA email test (internal)", isInternal: true, country: "Namibia", smsCredits: 0, termsAcceptedAt: new Date(),
      autoBackup: false, smsWelcomeMember: false, smsWelcomeVisitor: false, notifySubmissions: false, birthdayWishOn: false,
      branches: { create: { name: "Main Branch", isHQ: true } },
    },
    select: { id: true },
  });
  try {
    await db.subscription.create({ data: { churchId: church.id, plan: "starter", interval: "monthly", status: "active", renewsAt: new Date(Date.now() + 20 * 86400_000) } });
    const owner = await db.user.create({ data: { churchId: church.id, email: `qa-mail-owner-${tag}@example.test`, name: "QA Owner", role: "Owner", emailVerified: true }, select: { id: true, sessionVersion: true } });
    (globalThis as Record<string, unknown>).__SESSION = cookieFor(owner.id, owner.sessionVersion);
    await db.person.createMany({ data: [
      { churchId: church.id, firstName: "Ana", lastName: "One", status: "active", email: `qa-a-${tag}@example.test` },
      { churchId: church.id, firstName: "Ben", lastName: "Two", status: "active", email: `qa-b-${tag}@example.test` },
      { churchId: church.id, firstName: "Cee", lastName: "NoEmail", status: "active" },
    ] });
    const { sendBroadcast } = await import("@/app/actions/communications");
    const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

    console.log("1. Namibia church sends an email broadcast");
    await sendBroadcast(fd({ name: "Sunday", channel: "Email", target: "all", message: "Hello {name}, see you Sunday." }));
    const comm = await db.communication.findFirst({ where: { churchId: church.id }, include: { recipients: true } });
    ok(comm?.channel === "Email", "campaign saved as Email");
    ok(comm?.recipients.length === 2, `2 recipients with an email (got ${comm?.recipients.length})`);
    ok(comm?.sent === 2 && comm.recipients.every((r) => r.status === "sent"), `both sent (sent=${comm?.sent})`);

    console.log("2. A Ghana church can't send email");
    await db.church.update({ where: { id: church.id }, data: { country: "Ghana" }, select: { id: true } });
    await sendBroadcast(fd({ name: "Blocked", channel: "Email", target: "all", message: "Should not send" }));
    ok((await db.communication.count({ where: { churchId: church.id } })) === 1, "no new campaign for a Ghana church");
  } finally {
    await db.church.deleteMany({ where: { id: church.id, isInternal: true, slug } });
    console.log(`\n${pass} passed, ${fail} failed`);
    await db.$disconnect();
  }
})().catch((e) => { console.error(e); process.exit(1); });
