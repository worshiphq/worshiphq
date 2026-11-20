/**
 * End-to-end test of the Main Admin "Delete church" flow on a throwaway internal church (zz-qa-extra-...).
 *   npx tsx --require ./scripts/qa/preload-session.cjs --env-file=.env scripts/qa/church-deletion.qa.ts
 * Only touches the church it creates, and deletes it at the end. Emails go to @example.test addresses.
 */
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { authSecret } from "@/lib/auth/tokens";

let pass = 0, fail = 0;
const ok = (cond: unknown, msg: string) => { if (cond) { pass++; console.log("  PASS", msg); } else { fail++; console.log("  FAIL", msg); } };

function cookieFor(uid: string, sv: number) {
  const body = Buffer.from(JSON.stringify({ uid, sv, exp: Date.now() + 3600_000 })).toString("base64url");
  const mac = crypto.createHmac("sha256", authSecret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}
const as = (u: { id: string; sessionVersion: number }) => { (globalThis as Record<string, unknown>).__SESSION = cookieFor(u.id, u.sessionVersion); };

(async () => {
  const tag = crypto.randomBytes(4).toString("hex");
  const slug = `zz-qa-extra-${tag}`;
  const pw = crypto.randomBytes(12).toString("base64url");
  const hash = await bcrypt.hash(pw, 10);
  const church = await db.church.create({
    data: {
      slug, name: "zz QA delete test (internal)", isInternal: true, country: "Ghana", smsCredits: 0, termsAcceptedAt: new Date(),
      autoBackup: false, smsWelcomeMember: false, smsWelcomeVisitor: false, notifySubmissions: false, birthdayWishOn: false,
      branches: { create: { name: "Main Branch", isHQ: true } },
    },
    select: { id: true },
  });
  console.log("church", slug);
  try {
    await db.subscription.create({ data: { churchId: church.id, plan: "pro", interval: "monthly", status: "active", renewsAt: new Date(Date.now() + 20 * 86400_000), autoRenew: true } });
    const owner = await db.user.create({ data: { churchId: church.id, email: `qa-del-owner-${tag}@example.test`, name: "QA Owner", passwordHash: hash, role: "Owner", emailVerified: true }, select: { id: true, sessionVersion: true } });
    const admin = await db.user.create({ data: { churchId: church.id, email: `qa-del-admin-${tag}@example.test`, name: "QA Admin", passwordHash: hash, role: "Admin", emailVerified: true }, select: { id: true, sessionVersion: true } });
    const google = await db.user.create({ data: { churchId: church.id, email: `qa-del-g-${tag}@example.test`, name: "QA Google", passwordHash: null, role: "Admin", emailVerified: true }, select: { id: true, sessionVersion: true } });
    await db.person.create({ data: { churchId: church.id, firstName: "Test", lastName: "Member", status: "active" } });

    const { startChurchDeletion, confirmChurchDeletion, restoreChurch } = await import("@/app/actions/church-deletion");
    const { getSession, getActiveSession } = await import("@/lib/auth");
    const { sendChurchSms } = await import("@/lib/sms/credits");
    const { purgeDeletedChurches } = await import("@/lib/church-deletion");

    console.log("1. Who can start");
    as(admin);
    let r: Awaited<ReturnType<typeof startChurchDeletion>> = await startChurchDeletion({ phrase: "delete my app", password: pw });
    ok(!r.ok && /Main Admin/.test(r.error), `Admin is refused (${!r.ok ? r.error : "ok"})`);

    console.log("2. Phrase and password");
    as(owner);
    r = await startChurchDeletion({ phrase: "delete my church", password: pw });
    ok(!r.ok && /exactly/.test(r.error), `wrong phrase refused (${!r.ok ? r.error : "ok"})`);
    r = await startChurchDeletion({ phrase: "delete my app", password: "wrong-password" });
    ok(!r.ok && /password/.test(r.error), `wrong password refused (${!r.ok ? r.error : "ok"})`);
    r = await startChurchDeletion({ phrase: "delete my app", password: "" });
    ok(!r.ok, "empty password refused");
    r = await startChurchDeletion({ phrase: "  Delete My App ", password: pw });
    ok(r.ok, `right phrase (any case, spaces) + password sends a code${r.ok ? ` to ${r.sentTo}` : ` (${r.error})`}`);
    if (!r.ok) throw new Error("cannot continue");
    const code = r.devCode;
    ok(!!code, "test-mode code returned (email stubbed locally)");
    ok((await db.church.findUnique({ where: { id: church.id }, select: { deletionRequestedAt: true } }))?.deletionRequestedAt === null, "nothing closed yet after step 1");

    console.log("3. The code");
    let c = await confirmChurchDeletion({ verificationId: r.verificationId, code: code === "000000" ? "111111" : "000000" });
    ok(!c.ok, `wrong code refused (${!c.ok ? c.error : "ok"})`);
    as(admin);
    c = await confirmChurchDeletion({ verificationId: r.verificationId, code: code! });
    ok(!c.ok, "Admin can't use the Owner's code");
    as(owner);
    c = await confirmChurchDeletion({ verificationId: r.verificationId, code: code! });
    ok(c.ok, `right code closes the church${c.ok ? `, deleteAfter ${c.deleteAfter.slice(0, 10)}` : ` (${c.error})`}`);
    const after = await db.church.findUnique({ where: { id: church.id }, select: { suspended: true, deletionRequestedAt: true, deleteAfter: true } });
    ok(after?.suspended && after.deletionRequestedAt, "church suspended + deletionRequestedAt set");
    const days = after?.deleteAfter ? Math.round((after.deleteAfter.getTime() - Date.now()) / 86400_000) : -1;
    ok(days === 30, `deleteAfter is 30 days away (${days})`);
    const sub = await db.subscription.findFirst({ where: { churchId: church.id }, select: { autoRenew: true } });
    ok(sub?.autoRenew === false, "plan stops renewing");
    const auditRow = await db.auditLog.findFirst({ where: { churchId: church.id, action: "delete" }, select: { detail: true } }).catch(() => null);
    ok(!!auditRow, `audit entry written${auditRow ? `: "${auditRow.detail}"` : ""}`);
    const c2 = await confirmChurchDeletion({ verificationId: r.verificationId, code: code! });
    ok(!c2.ok, "same code can't be used twice");

    console.log("4. While closed");
    const s = await getSession();
    ok(!!s && s.role === "Owner", "Owner still has a session (so the closing screen + Restore can show)");
    ok((await getActiveSession()) === null, "getActiveSession is null (exports, search, sync blocked)");
    const sms = await sendChurchSms(church.id, "0244000000", "test");
    ok(!sms.ok && sms.sent === 0, "SMS refused while closed");

    console.log("5. Restore");
    as(admin);
    let rs = await restoreChurch();
    ok(!rs.ok, "Admin can't restore");
    as(owner);
    rs = await restoreChurch();
    ok(rs.ok, "Owner restores");
    const back = await db.church.findUnique({ where: { id: church.id }, select: { suspended: true, deletionRequestedAt: true, deleteAfter: true } });
    ok(!back?.suspended && !back?.deletionRequestedAt && !back?.deleteAfter, "flags cleared, church open again");
    ok((await db.person.count({ where: { churchId: church.id } })) === 1, "data still there after restore");
    rs = await restoreChurch();
    ok(!rs.ok, "restore again says not scheduled");

    console.log("6. Google-only account (no password) needs only the code");
    await db.user.update({ where: { id: owner.id }, data: { role: "Admin" } });
    await db.user.update({ where: { id: google.id }, data: { role: "Owner" } });
    as(google);
    const g = await startChurchDeletion({ phrase: "delete my app" });
    ok(g.ok, `no-password Owner gets a code without a password${g.ok ? "" : ` (${g.error})`}`);
    if (g.ok) {
      const gc = await confirmChurchDeletion({ verificationId: g.verificationId, code: g.devCode! });
      ok(gc.ok, "and the code closes the church");
    }

    console.log("7. Recovery window over, then the daily purge");
    await db.church.update({ where: { id: church.id }, data: { deleteAfter: new Date(Date.now() - 60_000) } });
    rs = await restoreChurch();
    ok(!rs.ok && /window/.test(rs.error), `restore refused after the window (${!rs.ok ? rs.error : "ok"})`);
    const pg = await purgeDeletedChurches(new Date());
    ok(pg.deleted >= 1, `purge deleted ${pg.deleted} church(es)`);
    ok((await db.church.findUnique({ where: { id: church.id } })) === null, "church row gone");
    ok((await db.user.count({ where: { churchId: church.id } })) === 0 && (await db.person.count({ where: { churchId: church.id } })) === 0, "users and people gone with it");
  } finally {
    await db.church.deleteMany({ where: { id: church.id, isInternal: true, slug } });
    console.log(`\n${pass} passed, ${fail} failed`);
    await db.$disconnect();
  }
})().catch((e) => { console.error(e); process.exit(1); });
