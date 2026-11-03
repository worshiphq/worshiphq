// Fixes the wording on the plan cards saved in SuperAdmin (PlatformConfig.planDefs.<plan>.marketingFeatures).
//   node scripts/fix-plan-cards.cjs            dry run: shows each card as it would read
//   node scripts/fix-plan-cards.cjs --apply    saves it (a backup of the old plans is written first)
//
// Only wording changes. Prices, member limits and which features each plan unlocks are left exactly as they are.
//
// What it fixes (decisions of 3 Nov 2026, see DECISIONS-PRICING.md):
//   - Pro sold "recurring giving" as if it existed. It is not built, so it is split out and marked coming soon.
//   - Pro now has SMS send records and automations, which the card did not mention.
//   - Max gets the lines for what it really adds over Pro: its own SMS sender name, restricted funds with enforced
//     balances, and members marked inactive automatically. API access is marked coming soon.
// Run it AFTER those features are live, so a card never advertises something a church cannot yet use.
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

/** Each step: replace `from` with `to` (an array becomes several lines), or insert `add` after `after`. */
const STEPS = {
  pro: [
    { from: "Harvest, pledges & recurring giving", to: ["Harvest & pledges"] },
    { after: "Church accounts & expenses", add: ["Send records for every SMS you send", "Automations: welcome, follow-up & custom reminders"] },
    { after: "Hall bookings", add: ["Coming soon: recurring giving & volunteer scheduling"] },
  ],
  max: [
    { from: "Budgets, fund tracking & assets", to: ["Restricted funds with enforced balances", "Budgets & assets"] },
    { after: "Posters without the WorshipHQ credit line", add: ["Your own SMS sender name", "Members marked inactive automatically"] },
    { after: "Branches & linked churches", add: ["Coming soon: API access"] },
  ],
};

function apply(list, steps) {
  const out = [...list];
  const notes = [];
  for (const s of steps) {
    if (s.from) {
      const i = out.indexOf(s.from);
      if (i < 0) { notes.push(`not found, skipped: "${s.from}"`); continue; }
      out.splice(i, 1, ...s.to);
    } else {
      const fresh = s.add.filter((l) => !out.includes(l));
      if (!fresh.length) continue;
      const i = out.indexOf(s.after);
      if (i < 0) { notes.push(`anchor not found, added at the end: "${s.after}"`); out.push(...fresh); }
      else out.splice(i + 1, 0, ...fresh);
    }
  }
  return { out, notes };
}

(async () => {
  const db = new PrismaClient();
  try {
    const cfg = await db.platformConfig.findUnique({ where: { id: "default" } });
    const old = cfg.planDefs || {};
    const next = JSON.parse(JSON.stringify(old));
    for (const [id, steps] of Object.entries(STEPS)) {
      const list = Array.isArray(old[id] && old[id].marketingFeatures) ? old[id].marketingFeatures : null;
      if (!list) { console.log(`${id}: no saved card wording, the built-in card is used (already updated in code).`); continue; }
      const { out, notes } = apply(list, steps);
      next[id] = { ...old[id], marketingFeatures: out };
      console.log(`\n${id.toUpperCase()} card would read:\n  - ${out.join("\n  - ")}`);
      notes.forEach((n) => console.log(`  ! ${n}`));
    }
    if (process.argv.includes("--apply")) {
      const backup = path.join(__dirname, `planDefs-backup-cards-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
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
