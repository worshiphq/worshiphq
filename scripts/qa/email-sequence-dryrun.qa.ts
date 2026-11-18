// READ-ONLY dry run of the email sequence against the live database: who would get which email on a few days.
// Writes are blocked and no email is sent. Real emails are rendered to files in OUT_DIR (if set) for reading only.
//   npx tsx --require ./scripts/qa/preload.cjs --env-file=.env scripts/qa/email-sequence-dryrun.qa.ts
import fs from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";

// The sequence tables may not exist yet: treat them as empty. Block every write, just in case.
const empty = { findMany: async () => [], count: async () => 0 };
const blocked = () => { throw new Error("write blocked in dry run"); };
for (const [k, v] of Object.entries({ lifecycleSend: { ...empty, create: blocked, update: blocked, delete: blocked }, emailOptOut: empty })) {
  Object.defineProperty(db, k, { value: v, configurable: true });
}

// The new settings column is not in the live database yet: read the plan settings without it.
const pc = db.platformConfig;
Object.defineProperty(db, "platformConfig", {
  value: { ...pc, findUnique: (args: { where: { id: string }; select?: unknown }) => (args.select ? pc.findUnique(args as never) : pc.findUnique({ ...args, omit: { lifecycleSettings: true } } as never)), upsert: blocked, update: blocked },
  configurable: true,
});

(async () => {
  const { dueEmails, buildEmail, mergeData, unsubscribeUrl } = await import("@/lib/lifecycle/run");
  const settings = { enabled: true, dailyCap: 80, steps: {} as Record<string, boolean> };
  const days = [["Wed 18 Nov", "2026-11-18T08:00:00Z"], ["Fri 20 Nov", "2026-11-20T08:00:00Z"], ["Mon 23 Nov", "2026-11-23T08:00:00Z"]] as const;
  const out = process.env.OUT_DIR;
  const shown = new Set<string>();
  for (const [label, iso] of days) {
    const t = Date.now();
    const { list, live } = await dueEmails(new Date(iso), settings);
    const by: Record<string, number> = {};
    for (const c of list) { const s = c.kind === "signup" ? "finish-signup" : c.step; by[s] = (by[s] ?? 0) + 1; }
    console.log(`${label}: ${list.length} due in ${Date.now() - t}ms`, by);
    if (out) {
      for (const c of list) {
        const step = c.kind === "signup" ? "finish-signup" : c.step;
        if (shown.has(step)) continue;
        shown.add(step);
        const data = c.kind === "signup" ? mergeData(live, { name: c.name, church: c.church, resume: "dry-run" }) : mergeData(live, { name: c.name, church: c.church, slug: c.slug, facts: c.facts });
        const mail = buildEmail(step, data, unsubscribeUrl("dry-run@example.test"), c.kind === "signup");
        fs.writeFileSync(path.join(out, `${step}.txt`), `SUBJECT: ${mail.subject}\n\n${mail.body}\n`);
        fs.writeFileSync(path.join(out, `${step}.html`), mail.html);
      }
    }
  }
  console.log("live numbers", JSON.stringify((await dueEmails(new Date(days[0][1]), settings)).live));
  process.exit(0);
})();
