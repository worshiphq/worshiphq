/**
 * One-off: churches that already have departments but whose member form does not ask "Department / ministry".
 * Adds the question (before the emergency contact, or at the end). Dry run unless --apply is passed.
 *   npx tsx --require ./scripts/qa/preload.cjs --env-file=.env scripts/backfill-department-field.ts [--apply]
 */
import { db } from "@/lib/db";
import { getFormDefinition } from "@/lib/forms/registration";
import { withDepartmentField } from "@/lib/forms/ensure-department";

async function main() {
  const apply = process.argv.includes("--apply");
  const cs = await db.church.findMany({ where: { departments: { some: {} }, isInternal: false }, select: { id: true, name: true, registrationFields: true } });
  const missing = cs.filter((c) => !getFormDefinition(c.registrationFields).some((f) => f.id === "department"));
  console.log(`${missing.length} churches need the Department question${apply ? "" : " (dry run, pass --apply to write)"}`);
  if (!apply) return;
  let done = 0;
  for (const c of missing) {
    await db.church.update({ where: { id: c.id }, data: { registrationFields: withDepartmentField(getFormDefinition(c.registrationFields)) as object } });
    done++;
  }
  console.log(`Updated ${done}`);
}
main().finally(() => db.$disconnect());
