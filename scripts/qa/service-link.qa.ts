/**
 * Pure tests for "Which service?" on the Giving forms: which services are offered on a day and which is preselected.
 * No database, no server-only imports.
 *   npx tsx scripts/qa/service-link.qa.ts
 */
import assert from "node:assert/strict";
import { NO_SERVICE, OTHER_SERVICE, cleanServiceName, defaultServiceChoice, mergeServiceChoices, pickFor, serviceKey } from "../../src/lib/service-income/choose";

let passed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok  ${name}`); } catch (e) { failures.push(name); console.log(`  FAIL ${name}\n       ${(e as Error).message}`); }
}

const slots = [
  { id: "s2", name: "Sunday 2nd service", startMinute: 600 },
  { id: "s1", name: "Sunday 1st service", startMinute: 420 },
];

test("1 service times come first, in start-time order", () => {
  const c = mergeServiceChoices({ slots, records: [], sessions: [] });
  assert.deepEqual(c.map((x) => x.name), ["Sunday 1st service", "Sunday 2nd service"]);
  assert.equal(c[0].slotId, "s1");
  assert.equal(c[0].startMinute, 420);
});

test("2 the same service from a time, a record and attendance appears once, with all its ids", () => {
  const c = mergeServiceChoices({
    slots,
    records: [{ id: "r1", serviceName: "sunday 1st  service", slotId: "s1", sessionId: null }],
    sessions: [{ id: "a1", serviceName: "Sunday 1st Service" }, { id: "a2", serviceName: "Youth service" }],
  });
  assert.equal(c.length, 3);
  const first = c.find((x) => x.key === serviceKey("Sunday 1st service"))!;
  assert.equal(first.name, "Sunday 1st service");
  assert.equal(first.serviceIncomeId, "r1");
  assert.equal(first.slotId, "s1");
  assert.equal(first.sessionId, "a1");
  assert.equal(c[2].name, "Youth service");
});

test("3 blank names are ignored and names are tidied", () => {
  const c = mergeServiceChoices({ slots: [], records: [{ id: "r", serviceName: "   " }], sessions: [{ id: "a", serviceName: "  Midweek   service " }] });
  assert.deepEqual(c.map((x) => x.name), ["Midweek service"]);
  assert.equal(cleanServiceName("x".repeat(100)).length, 80);
});

test("4 exactly one service that day: it is preselected", () => {
  const c = mergeServiceChoices({ slots: [slots[0]], records: [], sessions: [] });
  assert.equal(defaultServiceChoice(c), c[0].key);
  assert.equal(defaultServiceChoice(c, { last: NO_SERVICE }), c[0].key, "one service wins over a remembered 'not linked'");
});

test("5 several services: the last one used that day is kept", () => {
  const c = mergeServiceChoices({ slots, records: [], sessions: [] });
  assert.equal(defaultServiceChoice(c, { last: "Sunday 2nd service" }), serviceKey("Sunday 2nd service"));
  assert.equal(defaultServiceChoice(c, { last: "SUNDAY 2ND SERVICE" }), serviceKey("Sunday 2nd service"));
});

test("6 several services and nothing remembered (or a service no longer offered): not linked", () => {
  const c = mergeServiceChoices({ slots, records: [], sessions: [] });
  assert.equal(defaultServiceChoice(c), NO_SERVICE);
  assert.equal(defaultServiceChoice(c, { last: "Old crusade" }), NO_SERVICE);
  assert.equal(defaultServiceChoice(c, { last: NO_SERVICE }), NO_SERVICE);
});

test("7 no services that day: not linked", () => {
  assert.equal(defaultServiceChoice([], { last: "Sunday 1st service" }), NO_SERVICE);
});

test("8 a form opened for a service preselects it, ahead of everything else", () => {
  const c = mergeServiceChoices({ slots, records: [], sessions: [] });
  assert.equal(defaultServiceChoice(c, { prefer: "Sunday 2nd service", last: "Sunday 1st service" }), serviceKey("Sunday 2nd service"));
  assert.equal(defaultServiceChoice(c, { prefer: "Not offered", last: "Sunday 1st service" }), serviceKey("Sunday 1st service"));
});

test("9 the pick sent to the server", () => {
  const c = mergeServiceChoices({ slots, records: [], sessions: [{ id: "a1", serviceName: "Sunday 1st service" }] });
  assert.deepEqual(pickFor(c, serviceKey("Sunday 1st service")), { name: "Sunday 1st service", slotId: "s1", sessionId: "a1" });
  assert.equal(pickFor(c, NO_SERVICE), null);
  assert.deepEqual(pickFor(c, OTHER_SERVICE, "  Harvest night "), { name: "Harvest night", slotId: null, sessionId: null });
  assert.equal(pickFor(c, OTHER_SERVICE, "   "), null);
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
