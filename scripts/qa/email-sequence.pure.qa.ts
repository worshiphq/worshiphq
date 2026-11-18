// Pure checks of the email sequence rules and wording. No database, no email.  npx tsx scripts/qa/email-sequence.pure.qa.ts
import { STEPS, CHURCH_STEP_ORDER, stepApplies, fill, type ChurchFacts, type LiveNumbers, type StepId } from "../../src/lib/lifecycle/steps";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.log("FAIL", name); } };

const live: LiveNumbers = { freeLimit: 30, starterLimit: 150, starterMonthly: 120, starterYearly: 1200, starterFeatures: ["Text your whole church"], trial: null };
const base: ChurchFacts = { ageDays: 5, plan: "free", members: 0, attendanceEver: 0, lastSunday: null, activeRecently: false, weekday: 3 };
const f = (o: Partial<ChurchFacts>): ChurchFacts => ({ ...base, ...o });
const first = (x: ChurchFacts) => CHURCH_STEP_ORDER.find((id) => stepApplies(id, x, live)) ?? null;

// add-members
ok("new church with no members gets add-members", first(f({ ageDays: 1 })) === "add-members");
ok("day 0 gets nothing", first(f({ ageDays: 0 })) === null);
ok("church with members never gets add-members", !stepApplies("add-members", f({ members: 3 }), live));
ok("add-members stops after 20 days", !stepApplies("add-members", f({ ageDays: 21 }), live));
// ready-for-sunday
ok("Friday, never took attendance: ready-for-sunday first", first(f({ weekday: 5, members: 10 })) === "ready-for-sunday");
ok("ready-for-sunday not on Wednesday", !stepApplies("ready-for-sunday", f({ weekday: 3 }), live));
ok("ready-for-sunday not after attendance", !stepApplies("ready-for-sunday", f({ weekday: 6, attendanceEver: 4 }), live));
// sunday-report
const sun = f({ weekday: 1, members: 20, attendanceEver: 15, lastSunday: { present: 15, absent: 5, date: "x" }, activeRecently: true });
ok("Monday after a Sunday: sunday-report", first(sun) === "sunday-report");
ok("sunday-report only for Free", !stepApplies("sunday-report", { ...sun, plan: "starter" }, live));
ok("sunday-report not on Thursday", !stepApplies("sunday-report", { ...sun, weekday: 4 }, live));
// limit-near
ok("24 of 30 members: limit-near beats everything", first(f({ members: 24, weekday: 1, lastSunday: { present: 20, absent: 4, date: "x" } })) === "limit-near");
ok("23 of 30: no limit-near", !stepApplies("limit-near", f({ members: 23 }), live));
ok("paid church never gets limit-near", !stepApplies("limit-near", f({ members: 29, plan: "starter" }), live));
ok("unlimited free plan: no limit-near", !stepApplies("limit-near", f({ members: 500 }), { ...live, freeLimit: -1 }));
// need-help / last-check
ok("unused at day 14: add-members first if never sent", first(f({ ageDays: 14 })) === "add-members");
ok("unused at day 14: need-help applies too", stepApplies("need-help", f({ ageDays: 14 }), live));
ok("unused at day 25: need-help (add-members window over)", first(f({ ageDays: 25 })) === "need-help");
ok("used church never gets need-help", !stepApplies("need-help", f({ ageDays: 20, members: 2 }), live));
ok("unused at day 35: need-help still first (last-check after)", first(f({ ageDays: 35 })) === "need-help");
ok("unused at day 45: last-check", first(f({ ageDays: 45 })) === "last-check");
ok("unused at day 60: nothing", first(f({ ageDays: 60 })) === null);
// upgrade / door-device
const activeFree = f({ ageDays: 25, members: 12, attendanceEver: 30, activeRecently: true });
ok("active Free church at day 25: upgrade", first(activeFree) === "upgrade");
ok("upgrade needs 5 members", !stepApplies("upgrade", { ...activeFree, members: 4 }, live));
ok("inactive church gets no upgrade", !stepApplies("upgrade", { ...activeFree, activeRecently: false }, live));
ok("paid church never gets upgrade", !stepApplies("upgrade", { ...activeFree, plan: "pro" }, live));
ok("door-device for an active Pro church", stepApplies("door-device", { ...activeFree, plan: "pro" }, live));
ok("door-device never for Max", !stepApplies("door-device", { ...activeFree, plan: "max" }, live));
ok("door-device not before day 10", !stepApplies("door-device", { ...activeFree, ageDays: 9 }, live));

// Wording rules
const all = STEPS.map((s) => `${s.subject}\n${s.body}\n${s.button.label}`).join("\n");
ok("no em dashes", !all.includes("—"));
ok("no device prices (no GHS next to device)", !/device[^.]*GHS|GHS[^.]*device/i.test(all));
ok("never offers free migration or importing for them", !/we('| wi)ll import|free (data )?migration|move your data for free|send us your (list|spreadsheet)/i.test(all));
ok("no phone numbers in emails", !/\b0\d{9}\b|\+233/.test(all));
ok("every step is in the order or is finish-signup", STEPS.every((s) => s.id === "finish-signup" || CHURCH_STEP_ORDER.includes(s.id as StepId)));
ok("fill leaves no {{", !fill("Hi {{name}} {{nope}}", { name: "Kofi" }).includes("{{"));
ok("fill fills", fill("Hi {{name}}", { name: "Kofi" }) === "Hi Kofi");
const fields = new Set([...all.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]));
const known = ["name", "church", "members", "freeLimit", "starterLimit", "starterMonthly", "starterYearly", "yearlySaving", "starterFeatures", "trialLine", "present", "absentLine", "joinLink", "resume", "limitSubject", "limitPara"];
ok(`every field is known (${[...fields].filter((x) => !known.includes(x)).join(",")})`, [...fields].every((x) => known.includes(x)));

console.log(`${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
