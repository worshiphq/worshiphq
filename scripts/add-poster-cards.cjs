// Adds the poster maker lines to the plan cards in SuperAdmin (PlatformConfig.planDefs.<plan>.marketingFeatures).
//   node scripts/add-poster-cards.cjs            dry run: shows the cards as they would read
//   node scripts/add-poster-cards.cjs --apply    saves it (a backup of the old plans is written first)
// Only the wording on the Starter and Max cards changes. Which features each plan unlocks follows the built-in tier
// (poster-maker from Starter, white-label-posters on Max), so prices, limits and feature lists are left exactly as they are.
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const ADD = {
  starter: { line: "QR poster maker: design, print or save as PDF", after: "Member ID cards & baptism certificates" },
  max: { line: "Posters without the WorshipHQ credit line", after: "Face, palm & fingerprint check-in devices (sold separately)" },
};

(async () => {
  const db = new PrismaClient();
  try {
    const cfg = await db.platformConfig.findUnique({ where: { id: "default" } });
    const old = cfg.planDefs || {};
    const next = JSON.parse(JSON.stringify(old));
    for (const [id, { line, after }] of Object.entries(ADD)) {
      const list = Array.isArray(old[id] && old[id].marketingFeatures) ? [...old[id].marketingFeatures] : null;
      if (!list) { console.log(`${id}: no saved card wording, the built-in card is used (already updated in code).`); continue; }
      if (list.includes(line)) { console.log(`${id}: already has the line.`); continue; }
      const at = list.indexOf(after);
      list.splice(at >= 0 ? at + 1 : list.length, 0, line);
      next[id] = { ...old[id], marketingFeatures: list };
      console.log(`\n${id.toUpperCase()} card would read:\n  - ${list.join("\n  - ")}`);
    }
    if (process.argv.includes("--apply")) {
      const backup = path.join(__dirname, `planDefs-backup-posters-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
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
