import "server-only";
import { db } from "@/lib/db";
import { getFormDefinition, DEPARTMENT_FIELD_ID, type FormField } from "./registration";

export const DEPARTMENT_FORM_FIELD: FormField = { id: DEPARTMENT_FIELD_ID, label: "Department / ministry", type: "select", system: true };

/** Put the department question in the list, just before the emergency contact if the form has one. */
export function withDepartmentField(fields: FormField[]): FormField[] {
  if (fields.some((f) => f.id === DEPARTMENT_FIELD_ID)) return fields;
  const at = fields.findIndex((f) => f.id === "emergencyName");
  return at === -1 ? [...fields, DEPARTMENT_FORM_FIELD] : [...fields.slice(0, at), DEPARTMENT_FORM_FIELD, ...fields.slice(at)];
}

/**
 * Ask "Department / ministry" on the church's member form (the Add member form and the public join form share it).
 * Called when a church creates its FIRST department, so members can pick it without the church needing the form
 * builder (a paid feature). Later departments do not re-add it, so a church that removed the question keeps it removed.
 */
export async function ensureDepartmentOnForm(churchId: string): Promise<boolean> {
  const church = await db.church.findUnique({ where: { id: churchId }, select: { registrationFields: true } });
  const fields = getFormDefinition(church?.registrationFields ?? null);
  if (fields.some((f) => f.id === DEPARTMENT_FIELD_ID)) return false;
  await db.church.update({ where: { id: churchId }, data: { registrationFields: withDepartmentField(fields) as object } });
  return true;
}
