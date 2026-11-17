/**
 * Pure tests for member locking: ordering, the fast path and the wording. No database, no server-only imports.
 *   npx tsx scripts/qa/member-lock.pure.qa.ts
 */
import assert from "node:assert/strict";
import {
  compareForLock, pickLockedIds, lockedFromTail, computeLockedIds, lockedBannerText,
  LOCKED_BADGE, LOCKED_LINE, LOCKED_DOOR, LOCKED_SELF, LOCKED_EDIT, LOCKED_ADD,
  type LockRow,
} from "../../src/lib/member-lock-core";

let passed = 0;
const failures: string[] = [];
async function test(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed++; console.log(`  ok  ${name}`); } catch (e) { failures.push(name); console.log(`  FAIL ${name}\n       ${(e as Error).message}`); }
}

const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n));
const row = (id: string, joined: number, status = "active"): LockRow => ({ id, status, joinedAt: day(joined) });

async function main() {
  await test("no limit (Max) locks nobody", () => {
    assert.deepEqual(pickLockedIds([row("a", 1), row("b", 2)], null), []);
  });

  await test("at or under the limit locks nobody", () => {
    assert.deepEqual(pickLockedIds([row("a", 1), row("b", 2)], 2), []);
    assert.deepEqual(pickLockedIds([row("a", 1)], 2), []);
    assert.deepEqual(pickLockedIds([], 0), []);
  });

  await test("the newest past the limit are locked, whatever order rows arrive in", () => {
    const rows = [row("e", 5), row("a", 1), row("d", 4), row("b", 2), row("c", 3)];
    assert.deepEqual(pickLockedIds(rows, 3).sort(), ["d", "e"]);
  });

  await test("ties on joinedAt are broken by id, oldest id first", () => {
    const rows = [row("z", 1), row("m", 1), row("a", 1)];
    assert.deepEqual(pickLockedIds(rows, 1).sort(), ["m", "z"]);
    assert.deepEqual([...rows].sort(compareForLock).map((r) => r.id), ["a", "m", "z"]);
  });

  await test("string dates order the same as Date objects", () => {
    const rows: LockRow[] = [{ id: "b", status: "active", joinedAt: "2026-02-01T00:00:00.000Z" }, { id: "a", status: "active", joinedAt: "2026-01-01T00:00:00.000Z" }];
    assert.deepEqual(pickLockedIds(rows, 1), ["b"]);
  });

  await test("visitors past the limit are never locked (Free counts them, but the door stays open)", () => {
    const rows = [row("a", 1), row("b", 2), row("v", 3, "visitor"), row("c", 4)];
    assert.deepEqual(pickLockedIds(rows, 2), ["c"]);
    assert.deepEqual(lockedFromTail([{ id: "v", status: "visitor" }, { id: "x", status: "inactive" }]), ["x"]);
  });

  await test("inactive people past the limit are locked like anyone else who counts", () => {
    assert.deepEqual(pickLockedIds([row("a", 1), row("i", 2, "inactive")], 1), ["i"]);
  });

  await test("limit 0 locks every non-visitor", () => {
    assert.deepEqual(pickLockedIds([row("a", 1), row("v", 2, "visitor")], 0), ["a"]);
  });

  await test("fast path: within the limit the tail is never loaded", async () => {
    let calls = 0;
    const loadTail = async () => { calls++; return []; };
    assert.deepEqual(await computeLockedIds({ limit: null, used: 5000, loadTail }), []);
    assert.deepEqual(await computeLockedIds({ limit: 30, used: 30, loadTail }), []);
    assert.deepEqual(await computeLockedIds({ limit: 30, used: 2, loadTail }), []);
    assert.equal(calls, 0);
  });

  await test("over the limit: the tail is loaded once, skipping exactly `limit` rows", async () => {
    const skips: number[] = [];
    const ids = await computeLockedIds({
      limit: 30,
      used: 33,
      loadTail: async (skip) => { skips.push(skip); return [{ id: "x", status: "active" }, { id: "v", status: "visitor" }, { id: "y", status: "inactive" }]; },
    });
    assert.deepEqual(skips, [30]);
    assert.deepEqual(ids, ["x", "y"]);
  });

  await test("renewing (a bigger limit) unlocks everyone with no stored state", async () => {
    const rows = [row("a", 1), row("b", 2), row("c", 3)];
    assert.deepEqual(pickLockedIds(rows, 1).sort(), ["b", "c"]);
    assert.deepEqual(pickLockedIds(rows, 150), []);
  });

  await test("removing an older person frees a place for the next in line", () => {
    const rows = [row("a", 1), row("b", 2), row("c", 3), row("d", 4)];
    assert.deepEqual(pickLockedIds(rows, 2).sort(), ["c", "d"]);
    assert.deepEqual(pickLockedIds(rows.filter((r) => r.id !== "a"), 2), ["d"]);
  });

  await test("banner wording, singular and plural", () => {
    assert.equal(lockedBannerText(1, 30), "1 member is locked because your plan includes 30. Renew or upgrade to unlock them, or remove people you no longer need.");
    assert.equal(lockedBannerText(1200, 150), "1,200 members are locked because your plan includes 150. Renew or upgrade to unlock them, or remove people you no longer need.");
  });

  await test("no em dashes in any wording", () => {
    for (const s of [LOCKED_BADGE, LOCKED_LINE, LOCKED_DOOR, LOCKED_SELF, LOCKED_EDIT, LOCKED_ADD, lockedBannerText(3, 30)]) {
      assert.ok(!s.includes(String.fromCharCode(0x2014)), s);
    }
  });

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) process.exit(1);
}

void main();
