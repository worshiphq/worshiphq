/**
 * Country change requests on a throwaway internal church (zz-qa-extra-...).
 *   npx tsx --require ./scripts/qa/preload-session.cjs --env-file=.env scripts/qa/country-request.qa.ts
 * The SuperAdmin approve/reject buttons need a real SuperAdmin sign-in, so here we only check that a church
 * session is refused there. Only touches the church it creates, and deletes it at the end.
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
const as = (u: { id: string; sessionVersion: number }) => { (globalThis as Record<string, unknown>).__SESSION = cookieFor(u.id, u.sessionVersion); };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

(async () => {
  const tag = crypto.randomBytes(4).toString("hex");
  const slug = `zz-qa-extra-${tag}`;
  const church = await db.church.create({
    data: {
      slug, name: "zz QA country test (internal)", isInternal: true, country: "Ghana", smsCredits: 0, termsAcceptedAt: new Date(),
      autoBackup: false, smsWelcomeMember: false, smsWelcomeVisitor: false, notifySubmissions: false, birthdayWishOn: false,
      branches: { create: { name: "Main Branch", isHQ: true } },
    },
    select: { id: true },
  });
  const row = () => db.church.findUnique({ where: { id: church.id }, select: { country: true, countryRequested: true, countryRequestedAt: true, city: true } });
  try {
    await db.subscription.create({ data: { churchId: church.id, plan: "starter", interval: "monthly", status: "active", renewsAt: new Date(Date.now() + 20 * 86400_000) } });
    const owner = await db.user.create({ data: { churchId: church.id, email: `qa-cty-owner-${tag}@example.test`, name: "QA Owner", role: "Owner", emailVerified: true }, select: { id: true, sessionVersion: true } });
    const admin = await db.user.create({ data: { churchId: church.id, email: `qa-cty-admin-${tag}@example.test`, name: "QA Admin", role: "Admin", emailVerified: true }, select: { id: true, sessionVersion: true } });
    const { updateChurch, cancelCountryRequest } = await import("@/app/actions/settings");
    const { approveCountryChange } = await import("@/app/actions/admin");
    const base = { name: "zz QA country test (internal)", city: "Kumasi" };

    console.log("1. Main Admin asks for Namibia");
    as(owner);
    await updateChurch(fd({ ...base, country: "Namibia" }));
    let r = await row();
    ok(r?.country === "Ghana", `country unchanged until approved (${r?.country})`);
    ok(r?.countryRequested === "Namibia" && !!r.countryRequestedAt, `request saved (${r?.countryRequested})`);
    ok(r?.city === "Kumasi", "the rest of the form still saved");

    console.log("2. Saving the form again keeps the request");
    await updateChurch(fd({ ...base, city: "Accra", country: "Ghana" }));
    r = await row();
    ok(r?.countryRequested === "Namibia" && r.city === "Accra", "request kept, other fields saved");

    console.log("3. A made-up country is ignored");
    await cancelCountryRequest();
    await updateChurch(fd({ ...base, country: "Narnia" }));
    r = await row();
    ok(r?.country === "Ghana" && r.countryRequested === null, "Narnia not requested");

    console.log("4. Only the Main Admin can ask");
    as(admin);
    await updateChurch(fd({ ...base, country: "Nigeria" }));
    r = await row();
    ok(r?.countryRequested === null && r.country === "Ghana", "Admin's change ignored");
    const c = await cancelCountryRequest();
    ok(!c.ok, "Admin can't cancel either");

    console.log("5. Cancel");
    as(owner);
    await updateChurch(fd({ ...base, country: "Kenya" }));
    ok((await row())?.countryRequested === "Kenya", "Kenya requested");
    const cc = await cancelCountryRequest();
    r = await row();
    ok(cc.ok && r?.countryRequested === null && r.countryRequestedAt === null, "cancelled and cleared");

    console.log("6. A church session can't approve its own request");
    await updateChurch(fd({ ...base, country: "Kenya" }));
    const res = await approveCountryChange(church.id).then(() => "approved", (e: Error) => e.message);
    ok(res !== "approved" && (await row())?.country === "Ghana", `refused (${res})`);

    console.log("7. The SuperAdmin dashboard query sees it");
    const asks = await db.church.findMany({ where: { countryRequested: { not: null }, id: church.id }, select: { countryRequested: true } });
    ok(asks.length === 1 && asks[0].countryRequested === "Kenya", "listed for approval");
  } finally {
    await db.church.deleteMany({ where: { id: church.id, isInternal: true, slug } });
    const left = await db.church.count({ where: { slug: { startsWith: "zz-qa-extra-" } } });
    console.log(`\n${pass} passed, ${fail} failed · zz-qa-extra churches left: ${left}`);
    await db.$disconnect();
  }
})().catch((e) => { console.error(e); process.exit(1); });
