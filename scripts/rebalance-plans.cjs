// Rebalances the four plans in SuperAdmin (PlatformConfig.planDefs): which features each unlocks and what each card says.
//   node scripts/rebalance-plans.cjs            dry run: shows the change and which paying churches would lose a feature they use
//   node scripts/rebalance-plans.cjs --apply    saves it (a backup of the old plans is written first)
// Prices, member limits, team sizes, names and taglines are left exactly as they are.
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const CORE = ["dashboard", "people", "attendance", "events", "giving", "reports", "directory", "calendar", "birthdays", "departments",
  "leaders", "notices", "groups", "households", "visitors", "prayer-requests", "children-forms", "teens-forms"];
const STARTER_ADDS = ["sms", "reminders", "auto-receipts", "follow-ups", "member-ids", "qr-codes", "form-builder", "import-export",
  "data-migration", "baptisms"];
const PRO_ADDS = ["custom-roles", "rosters", "volunteers", "volunteer-scheduling", "harvest", "pledges", "recurring-giving", "sermons",
  "devotionals", "testimonies", "welfare", "bookings", "accounting", "expenses", "automations", "engagement-scoring", "fingerprint"];
const MAX_ADDS = ["biometric-devices", "counseling", "budgets", "fund-accounting", "assets", "audit-log", "auto-inactive",
  "linked-churches", "advanced-reports", "api-access"];

const FEATURES = {
  free: CORE,
  starter: [...CORE, ...STARTER_ADDS],
  pro: [...CORE, ...STARTER_ADDS, ...PRO_ADDS],
  max: [...CORE, ...STARTER_ADDS, ...PRO_ADDS, ...MAX_ADDS],
};
const ALL = FEATURES.max;

// Only things the app really does.
const CARDS = {
  free: ["People & households", "Giving & offerings", "Attendance by name or QR", "Visitors & prayer requests", "Events & calendar"],
  starter: ["Everything in Free", "SMS to your whole church", "Birthday, anniversary & absence texts", "Automatic giving receipts",
    "Visitor follow-ups", "Member ID cards & baptism certificates", "Free data migration"],
  pro: ["Everything in Starter", "Rosters & volunteers", "Harvest, pledges & recurring giving", "Church accounts & expenses",
    "Welfare, sermons & devotionals", "Hall bookings", "USB fingerprint check-in (scanner sold separately)", "Custom roles for your team",
    "Priority support"],
  max: ["Everything in Pro", "Face, palm & fingerprint check-in devices (sold separately)", "Private counselling records",
    "Budgets, fund tracking & assets", "Audit log: who changed what", "Branches & linked churches", "Unlimited members & team",
    "Dedicated success manager"],
};

// How to tell a church really uses a feature (it has records for it).
const USAGE = {
  pledges: (db, id) => db.pledge.count({ where: { churchId: id } }),
  sermons: (db, id) => db.sermon.count({ where: { churchId: id } }),
  devotionals: (db, id) => db.devotional.count({ where: { churchId: id } }),
  testimonies: (db, id) => db.testimony.count({ where: { churchId: id } }),
  accounting: (db, id) => db.transaction.count({ where: { churchId: id } }),
  expenses: (db, id) => db.expense.count({ where: { churchId: id } }),
  "biometric-devices": (db, id) => db.biometricDevice.count({ where: { churchId: id } }),
  counseling: (db, id) => db.counselingSession.count({ where: { churchId: id } }),
};

(async () => {
  const db = new PrismaClient();
  try {
    const cfg = await db.platformConfig.findUnique({ where: { id: "default" } });
    const old = cfg.planDefs || {};
    const ids = ["free", "starter", "pro", "max"];
    const next = JSON.parse(JSON.stringify(old));
    for (const id of ids) {
      next[id] = { ...(old[id] || {}), features: FEATURES[id], marketingFeatures: CARDS[id], knownFeatures: ALL };
      const before = new Set((old[id] && old[id].features) || []);
      const after = new Set(FEATURES[id]);
      const gains = [...after].filter((f) => !before.has(f));
      const loses = [...before].filter((f) => !after.has(f));
      console.log(`\n${id.toUpperCase()}  gains: ${gains.join(", ") || "-"}\n${" ".repeat(id.length)}  loses: ${loses.join(", ") || "-"}`);
    }

    // Who would lose something they use today? ("fingerprint" used to cover wall devices too, so check those under the new key.)
    // A church's plan is its subscription's plan; no subscription means Free (same as getChurchPlan).
    const subs = await db.subscription.findMany({ select: { churchId: true, plan: true } });
    const planOf = new Map(subs.map((s) => [s.churchId, s.plan || "free"]));
    const all = await db.church.findMany({ select: { id: true, name: true, slug: true } });
    const churches = all.map((c) => ({ ...c, plan: planOf.get(c.id) || "free" })).filter((c) => c.plan !== "max");
    const counts = {};
    for (const c of all) { const p = planOf.get(c.id) || "free"; counts[p] = (counts[p] || 0) + 1; }
    console.log("\nChurches by plan:", JSON.stringify(counts));
    const hurt = [];
    for (const c of churches) {
      if (c.slug === "demo" || /^zz-/.test(c.slug || "")) continue;
      const had = new Set((old[c.plan] && old[c.plan].features) || []);
      if (had.has("fingerprint")) had.add("biometric-devices");
      const keeps = new Set(FEATURES[c.plan]);
      for (const f of [...had].filter((x) => !keeps.has(x))) {
        const count = USAGE[f] ? await USAGE[f](db, c.id).catch(() => 0) : 0;
        if (count > 0) hurt.push(`${c.plan.padEnd(8)} ${c.name} uses ${f} (${count} records)`);
      }
    }
    console.log("\nChurches on Free/Starter/Pro:", churches.length);
    console.log(hurt.length ? "WOULD LOSE A FEATURE THEY USE:\n  " + hurt.join("\n  ") : "No church loses a feature it has records in.");

    if (process.argv.includes("--apply")) {
      if (hurt.length && !process.argv.includes("--force")) {
        console.log("\nNot applied: some churches use a feature that would move up. Re-run with --apply --force once decided.");
        return;
      }
      const backup = path.join(__dirname, `planDefs-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
      fs.writeFileSync(backup, JSON.stringify(old, null, 2));
      await db.platformConfig.update({ where: { id: "default" }, data: { planDefs: next } });
      console.log("\nApplied. Old plans saved to", backup);
    } else {
      console.log("\nDry run only. Add --apply to save.");
    }
  } finally {
    await db.$disconnect();
  }
})();
