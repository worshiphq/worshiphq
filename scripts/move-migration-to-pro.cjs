// Free data migration starts from Pro, not Starter (owner's decision, 4 Nov 2026), as a reason to upgrade.
//   node scripts/move-migration-to-pro.cjs            dry run: shows what would change
//   node scripts/move-migration-to-pro.cjs --apply    saves it (a backup of the old plans is written first)
//
// Changes only the plans saved in SuperAdmin (PlatformConfig.planDefs): the Starter card loses "Free data migration"
// and the Starter plan loses the data-migration feature; the Pro card gains the line. Max already says "Everything in
// Pro". Prices, member limits and every other feature stay as they are. The self-service spreadsheet importer
// (import-export) stays on Starter: only the service where we move a church's records for them is moving.
//
// Running it twice changes nothing.
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const LINE = "Free data migration";
const KEY = "data-migration";
const APPLY = process.argv.includes("--apply");

(async () => {
  const db = new PrismaClient();
  try {
    const cfg = await db.platformConfig.findUnique({ where: { id: "default" }, select: { planDefs: true } });
    if (!cfg?.planDefs) throw new Error("No saved plans found.");
    const defs = JSON.parse(JSON.stringify(cfg.planDefs));
    const { starter, pro } = defs;
    if (!starter || !pro) throw new Error("Starter or Pro plan is missing from the saved plans.");

    starter.marketingFeatures = (starter.marketingFeatures ?? []).filter((l) => l !== LINE);
    starter.features = (starter.features ?? []).filter((f) => f !== KEY);

    pro.features = pro.features ?? [];
    if (!pro.features.includes(KEY)) pro.features.push(KEY);
    pro.marketingFeatures = pro.marketingFeatures ?? [];
    if (!pro.marketingFeatures.includes(LINE)) {
      // Right after "Everything in Starter", so it is one of the first reasons to move up.
      const at = pro.marketingFeatures.indexOf("Everything in Starter");
      pro.marketingFeatures.splice(at + 1, 0, LINE);
    }

    const changed = JSON.stringify(defs) !== JSON.stringify(cfg.planDefs);
    console.log("Starter card:", starter.marketingFeatures);
    console.log("Pro card:", pro.marketingFeatures);
    console.log("Starter has data-migration:", starter.features.includes(KEY), "| Pro has it:", pro.features.includes(KEY));
    if (!changed) { console.log("\nAlready done. Nothing to change."); return; }
    if (!APPLY) { console.log("\nDry run only. Add --apply to save."); return; }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backup = path.join(__dirname, `planDefs-backup-migration-${stamp}.json`);
    fs.writeFileSync(backup, JSON.stringify(cfg.planDefs, null, 2));
    await db.platformConfig.update({ where: { id: "default" }, data: { planDefs: defs } });
    console.log(`\nSaved. Backup: ${path.basename(backup)}`);
  } finally {
    await db.$disconnect();
  }
})();
