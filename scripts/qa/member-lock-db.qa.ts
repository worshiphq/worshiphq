/**
 * Member locking against the REAL database, inside the hidden internal QA church. Written for later use; do not run
 * casually.
 *   npx tsx --env-file=.env --require ./scripts/qa/preload.cjs scripts/qa/member-lock-db.qa.ts <zz-qa-slug>
 *
 * Safety:
 *  - Runs only against an existing church whose slug starts with "zz-qa-" AND whose Church.isInternal is true.
 *    Anything else is refused before a single write. assertQa() re-checks before every write and before cleanup.
 *  - Puts the church on the Free plan for the test (its previous subscription row is saved and put back), then adds
 *    just enough throwaway people (lastName "ZZQA-LOCK-<stamp>") to go a few past the Free limit. It refuses if that
 *    would mean more than 200 people.
 *  - Cleanup in `finally` deletes only the people and the device this script created, and restores the subscription.
 *    Nothing else in the church is touched.
 */
import assert from "node:assert/strict";
import { PrismaClient, type Subscription } from "@prisma/client";
import { getMemberLock, invalidateMemberLock, lockedDoorError, isPersonLocked } from "../../src/lib/member-lock";
import { resolveAudience } from "../../src/lib/sms/audience";
import { recordPunch } from "../../src/lib/devices/punch";
import { getCheckInCandidates } from "../../src/lib/data/attendance";
import { LOCKED_DOOR } from "../../src/lib/member-lock-core";

const db = new PrismaClient();
const STAMP = Date.now();
const MARK = `ZZQA-LOCK-${STAMP}`;
const slug = String(process.argv[2] ?? "").trim();
const results: { name: string; ok: boolean; note?: string }[] = [];

async function step(name: string, fn: () => Promise<void>) {
  try { await fn(); results.push({ name, ok: true }); console.log(`  ok  ${name}`); }
  catch (e) { results.push({ name, ok: false, note: (e as Error).message }); console.log(`  FAIL ${name}\n       ${(e as Error).message}`); }
}

/** Throws unless this is a hidden zz-qa- internal church. */
async function assertQa(id: string) {
  const c = await db.church.findUnique({ where: { id }, select: { slug: true, isInternal: true, isDemo: true } });
  if (!c || !c.slug.startsWith("zz-qa-") || c.isInternal !== true || c.isDemo) throw new Error(`Refusing: church ${id} is not a hidden zz-qa- internal church.`);
}

async function main() {
  if (!slug.startsWith("zz-qa-")) throw new Error("Refusing: pass the slug of the internal QA church (it starts with zz-qa-).");
  const church = await db.church.findUnique({ where: { slug }, select: { id: true } });
  if (!church) throw new Error(`Refusing: no church with slug ${slug}.`);
  const churchId = church.id;
  await assertQa(churchId);
  console.log(`member-lock-db (church ${slug}, marker ${MARK})`);

  const savedSub: Subscription | null = await db.subscription.findUnique({ where: { churchId } });
  const createdPeople: string[] = [];
  let deviceId: string | null = null;

  try {
    // ── Free plan, no trial ──
    await assertQa(churchId);
    await db.subscription.upsert({
      where: { churchId },
      create: { churchId, plan: "free", status: "active" },
      update: { plan: "free", status: "active", trialPlan: null, trialStartedAt: null, trialEndsAt: null },
    });
    invalidateMemberLock(churchId);
    const before = await getMemberLock(churchId);
    if (before.limit === null) throw new Error("Refusing: the Free plan has no member limit in PlatformConfig, so nothing can be locked.");

    // Enough people to go 3 past the limit, the newest last. Phones so they would be in an SMS audience.
    const need = Math.max(0, before.limit - before.used) + 3;
    if (need > 200) throw new Error(`Refusing: would need to add ${need} people to go past the limit.`);
    await assertQa(churchId);
    const base = Date.now() + 60_000; // newer than anyone already there
    for (let i = 0; i < need; i++) {
      const p = await db.person.create({
        data: {
          churchId, firstName: `Lock${i}`, lastName: MARK, status: "active", phone: `+23320${String(STAMP).slice(-5)}${String(i).padStart(2, "0")}`,
          memberId: `ZQ${STAMP}-L${i}`, joinedAt: new Date(base + i * 1000),
        },
        select: { id: true },
      });
      createdPeople.push(p.id);
    }
    invalidateMemberLock(churchId);
    const lock = await getMemberLock(churchId);
    const newest = createdPeople.slice(-3);

    await step("the three newest people past the limit are locked", async () => {
      assert.equal(lock.used, before.used + need);
      for (const id of newest) assert.ok(lock.locked.has(id), `${id} should be locked`);
      assert.ok(lock.locked.size >= 3);
    });

    await step("an older person within the limit is not locked", async () => {
      const older = createdPeople.slice(0, -3);
      if (older.length) assert.equal(await isPersonLocked(churchId, older[0]), lock.locked.has(older[0]));
      const oldest = await db.person.findFirst({ where: { churchId, status: { not: "visitor" } }, orderBy: [{ joinedAt: "asc" }, { id: "asc" }], select: { id: true } });
      if (oldest) assert.equal(await isPersonLocked(churchId, oldest.id), false);
    });

    await step("locked people are left out of the SMS audience", async () => {
      const { recipients } = await resolveAudience(churchId, "all");
      const ids = new Set(recipients.map((r) => r.id));
      for (const id of newest) assert.ok(!ids.has(id), `${id} should not be in the audience`);
      const picked = await resolveAudience(churchId, "people", newest);
      assert.equal(picked.recipients.length, 0);
    });

    await step("check-in by name flags them as locked", async () => {
      const sess = await db.attendanceSession.findFirst({ where: { churchId }, select: { id: true } });
      const candidates = await getCheckInCandidates(churchId, sess?.id ?? "none");
      for (const id of newest) assert.equal(candidates.find((c) => c.id === id)?.locked, true);
      assert.equal(await lockedDoorError(churchId, newest[0]), LOCKED_DOOR);
    });

    await step("a device scan does not check a locked person in", async () => {
      await assertQa(churchId);
      const dev = await db.biometricDevice.create({
        data: { churchId, name: `QA ${MARK}`, brand: "webhook", modes: ["face"], serial: `qa-${MARK}`, secret: `qa-${STAMP}`, scanRule: "always" },
        select: { id: true },
      });
      deviceId = dev.id;
      const r = await recordPunch({ id: dev.id, churchId, scanRule: "always" }, { pin: `ZQ${STAMP}-L${need - 1}`, at: new Date(), mode: "face" });
      assert.equal(r.result, "locked");
      assert.equal(await db.attendanceRecord.count({ where: { churchId, personId: newest[2] } }), 0);
    });

    await step("removing people unlocks the next in line", async () => {
      await assertQa(churchId);
      // Delete the three newest: the church is back at its limit, so nobody is locked.
      await db.person.deleteMany({ where: { churchId, id: { in: newest }, lastName: MARK } });
      createdPeople.splice(-3, 3);
      invalidateMemberLock(churchId);
      const after = await getMemberLock(churchId);
      assert.equal(after.used, before.used + need - 3);
      for (const id of createdPeople) assert.ok(!after.locked.has(id));
    });
  } finally {
    // ── Cleanup: only what this script made, then the subscription as it was ──
    try {
      await assertQa(churchId);
      if (deviceId) await db.biometricDevice.deleteMany({ where: { id: deviceId, churchId } });
      if (createdPeople.length) await db.person.deleteMany({ where: { churchId, id: { in: createdPeople }, lastName: MARK } });
      // Belt and braces: any marker person left over from a failed step.
      await db.person.deleteMany({ where: { churchId, lastName: MARK } });
      if (savedSub) {
        const { id: _id, churchId: _c, ...rest } = savedSub;
        void _id; void _c;
        await db.subscription.update({ where: { churchId }, data: rest });
      } else {
        await db.subscription.deleteMany({ where: { churchId } });
      }
      invalidateMemberLock(churchId);
      console.log("  cleanup done");
    } catch (e) {
      console.log(`  CLEANUP FAILED: ${(e as Error).message}. Remove people with lastName ${MARK} by hand.`);
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  if (failed.length) process.exitCode = 1;
}

main()
  .catch((e) => { console.error((e as Error).message); process.exitCode = 1; })
  .finally(() => db.$disconnect());
