#!/usr/bin/env node
// Fails if a church filter is written as the literal `isDemo: false` instead of LIVE_CHURCH
// (src/lib/live-church.ts), which also hides the internal QA church. A line that is not a
// church filter (for example a session object) can opt out with the comment `live-church-ok`.
// Usage: node scripts/check-live-church.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const allowed = new Set([join("src", "lib", "live-church.ts")]);
const problems = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      walk(full);
    } else if (/\.(ts|tsx|js|mjs)$/.test(name)) {
      const rel = relative(root, full);
      if (allowed.has(rel)) continue;
      readFileSync(full, "utf8").split(/\r?\n/).forEach((line, i) => {
        if (/isDemo\s*:\s*false/.test(line) && !line.includes("live-church-ok")) problems.push(`${rel.split(sep).join("/")}:${i + 1}: ${line.trim()}`);
      });
    }
  }
}

walk(join(root, "src"));
if (problems.length) {
  console.error("Use LIVE_CHURCH from src/lib/live-church.ts instead of `isDemo: false`:");
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
console.log("check-live-church: ok (no literal isDemo: false church filters)");
