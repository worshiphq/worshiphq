/**
 * Pure tests for who can see and change levies and service income, and for the plan keys.
 *   npx tsx scripts/qa/levies-guards.qa.ts
 */
import assert from "node:assert/strict";
import { levyAccess, serviceIncomeAccess } from "../../src/lib/levies/guards";
import { featureForSection, DEFAULT_PLAN_TABLE, FEATURES_ADDED_LATER, getRouteFeature, FEATURE_LABELS } from "../../src/lib/plan-gate";
import { modulesForRole, type Session } from "../../src/lib/permissions";
import type { Role } from "../../src/lib/demo/data";

let passed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok  ${name}`); } catch (e) { failures.push(name); console.log(`  FAIL ${name}\n       ${(e as Error).message}`); }
}

function builtIn(role: Role, extra: Partial<Session> = {}): Session {
  const sections = modulesForRole(role);
  return {
    userId: "u", name: "Test", email: "t@example.com", role, sections, manageSections: sections, canDelete: true,
    churchId: "c", churchName: "Church", branch: "", avatarName: "T", isDemo: false, planLocked: [], ...extra,
  };
}

console.log("levies-guards");

test("Owner: see, manage, delete, reopen", () => {
  const a = levyAccess(builtIn("Owner"));
  assert.deepEqual([a.see, a.manage, a.del, a.reopen], [true, true, true, true]);
});

test("Admin: see, manage, delete, reopen", () => {
  const a = levyAccess(builtIn("Admin"));
  assert.deepEqual([a.see, a.manage, a.del, a.reopen], [true, true, true, true]);
});

test("Finance built-in: see and manage, no reopen", () => {
  const s = builtIn("Finance");
  assert.ok(s.sections.includes("accounting"));
  const a = levyAccess(s);
  assert.deepEqual([a.see, a.manage, a.reopen], [true, true, false]);
});

test("Pastor: no levies, sees service income", () => {
  const s = builtIn("Pastor");
  assert.equal(levyAccess(s).see, false);
  assert.equal(serviceIncomeAccess(s).see, true);
  assert.equal(serviceIncomeAccess(s).manage, true);
});

test("Volunteer: neither", () => {
  const s = builtIn("Volunteer");
  assert.equal(levyAccess(s).see, false);
  assert.equal(serviceIncomeAccess(s).see, false);
});

test("Custom role with exact [levies] view only: see, no manage", () => {
  const a = levyAccess(builtIn("Volunteer", { sections: ["levies"], manageSections: [], exactSections: true, customRole: "Treasurer helper" }));
  assert.deepEqual([a.see, a.manage, a.del], [true, false, false]);
});

test("Custom role with exact [accounting]: no levies", () => {
  const a = levyAccess(builtIn("Volunteer", { sections: ["accounting"], manageSections: ["accounting"], exactSections: true }));
  assert.equal(a.see, false);
});

test("Demo: sees but cannot manage", () => {
  const a = levyAccess(builtIn("Owner", { isDemo: true }));
  assert.equal(a.see, true);
  assert.equal(a.manage, false);
  assert.equal(a.lockedFeature, null);
});

test("planLocked [levies]: locked feature, no manage", () => {
  const a = levyAccess(builtIn("Owner", { planLocked: ["levies"] }));
  assert.equal(a.lockedFeature, "levies");
  assert.equal(a.writeLocked, true);
  assert.equal(a.manage, false);
});

test("Support (impersonating) is not plan-locked for writes, matching assertCanWrite", () => {
  const a = levyAccess(builtIn("Owner", { planLocked: ["levies"], impersonating: true }));
  assert.equal(a.writeLocked, false);
  assert.equal(a.manage, true);
});

test("Branch oversight follows the linked-churches key", () => {
  assert.equal(levyAccess(builtIn("Owner", { planLocked: ["linked-churches"] })).branchLocked, true);
  assert.equal(levyAccess(builtIn("Owner")).branchLocked, false);
});

test("Plan keys: both on Pro and Max, not Starter or Free, inherited by saved plans, routed and labelled", () => {
  for (const k of ["levies", "service-income"]) {
    assert.equal(featureForSection(k), k);
    assert.ok(DEFAULT_PLAN_TABLE.pro.features.includes(k), `${k} on pro`);
    assert.ok(DEFAULT_PLAN_TABLE.max.features.includes(k), `${k} on max`);
    assert.ok(!DEFAULT_PLAN_TABLE.starter.features.includes(k), `${k} not on starter`);
    assert.ok(!DEFAULT_PLAN_TABLE.free.features.includes(k), `${k} not on free`);
    assert.ok(FEATURES_ADDED_LATER.includes(k), `${k} in FEATURES_ADDED_LATER`);
    assert.ok(FEATURE_LABELS[k]);
  }
  assert.equal(getRouteFeature("/app/levies"), "levies");
  assert.equal(getRouteFeature("/app/service-income"), "service-income");
  assert.ok(DEFAULT_PLAN_TABLE.max.features.includes("linked-churches"));
  assert.ok(!DEFAULT_PLAN_TABLE.pro.features.includes("linked-churches"));
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
