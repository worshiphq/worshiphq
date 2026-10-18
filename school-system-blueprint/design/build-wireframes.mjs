// Usage: node design/build-wireframes.mjs [id-prefix]   → writes wireframes/*.html and images/*.png + index.html gallery
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { wrap } from "./lib.mjs";
import { pages as a } from "./pages-a.mjs";
import { pages as b } from "./pages-b.mjs";
import { pages as c } from "./pages-c.mjs";
import { pages as d } from "./pages-d.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const only = process.argv[2];
const all = [...a, ...b, ...c, ...d].sort((x, y) => x.id.localeCompare(y.id));
const pages = only ? all.filter((p) => p.id.startsWith(only)) : all;
for (const dir of ["wireframes", "images"]) mkdirSync(join(here, dir), { recursive: true });

const exe = process.env.CHROMIUM_PATH || ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find(existsSync);
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
for (const p of pages) {
  const file = `${p.id}-${p.slug}`;
  writeFileSync(join(here, "wireframes", `${file}.html`), wrap(p));
  const ctx = await browser.newContext({ viewport: { width: p.width ?? 1360, height: 800 }, deviceScaleFactor: 1.5 });
  const page = await ctx.newPage();
  await page.goto("file://" + join(here, "wireframes", `${file}.html`));
  await page.screenshot({ path: join(here, "images", `${file}.png`), fullPage: true });
  await ctx.close();
  console.log("✓", file);
}
await browser.close();

// gallery (always built from the full list)
const groups = [...new Set(all.map((p) => p.group))];
const gal = groups.map((g) => `<h2>${g}</h2><div class="g">${all.filter((p) => p.group === g).map((p) => `<a href="images/${p.id}-${p.slug}.png"><img loading="lazy" src="images/${p.id}-${p.slug}.png"><b>${p.id}</b> ${p.title}<br><small>${p.route} · ${p.roles}</small></a>`).join("")}</div>`).join("");
writeFileSync(join(here, "index.html"), `<!doctype html><meta charset="utf-8"><title>SchoolOS wireframes</title><style>body{font:14px system-ui;margin:0;background:#f1f3f5;padding:24px}h1{margin:0 0 4px}h2{margin:28px 0 10px;border-bottom:2px solid #0f766e;padding-bottom:4px}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}a{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:10px;color:#111;text-decoration:none}img{width:100%;height:210px;object-fit:cover;object-position:top;border-radius:6px;border:1px solid #eee;margin-bottom:6px}small{color:#6b7280}</style><h1>SchoolOS — wireframes (${all.length})</h1><p>Click any thumbnail for the full-size image. Regenerate with <code>npm run wireframes</code>.</p>${gal}`);
console.log(`gallery: ${all.length} screens`);
