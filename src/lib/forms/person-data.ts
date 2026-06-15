import "server-only";
import { type FormField, isSystemColumn, DEPARTMENT_FIELD_ID } from "./registration";

const DATE_FIELDS = new Set(["dateOfBirth", "dateOfMembership"]);
const pad = (n: number) => String(n).padStart(2, "0");
const MAX_PHOTO = 1_500_000; // ~1.5MB data URL

export interface BuiltPerson {
  data: Record<string, unknown>;
  customFields: Record<string, string>;
  departmentNames: string[];
}

/**
 * Map a submitted form (built from a FormField[] definition) to Person columns.
 * Shared by public self-registration and the admin add/edit member form so all
 * three render and save the exact same fields.
 */
export function buildPersonData(fields: FormField[], formData: FormData): BuiltPerson {
  const data: Record<string, unknown> = {};
  const customFields: Record<string, string> = {};
  const departmentNames: string[] = [];

  for (const field of fields) {
    if (field.id === DEPARTMENT_FIELD_ID) {
      departmentNames.push(
        ...formData.getAll(field.id).map((v) => String(v).trim()).filter(Boolean),
      );
      continue;
    }

    const raw = String(formData.get(field.id) ?? "").trim();

    if (field.id === "firstName" || field.id === "lastName") {
      if (raw) data[field.id] = raw;
      continue;
    }
    if (!raw) continue;

    if (isSystemColumn(field.id)) {
      if (DATE_FIELDS.has(field.id)) {
        const d = new Date(raw);
        if (!isNaN(d.getTime())) data[field.id] = d;
      } else if (field.id === "baptized") {
        data.baptized = /^(yes|true)$/i.test(raw) ? true : /^(no|false)$/i.test(raw) ? false : null;
      } else if (field.id === "photoUrl") {
        if (raw.startsWith("data:image/") && raw.length < MAX_PHOTO) data.photoUrl = raw;
        else if (raw.startsWith("http")) data.photoUrl = raw;
      } else {
        data[field.id] = raw;
      }
    } else {
      customFields[field.label] = raw;
    }
  }

  if (data.dateOfBirth instanceof Date) {
    const d = data.dateOfBirth as Date;
    data.birthday = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  data.location = (data.town as string) || (data.region as string) || (data.location as string) || null;

  return { data, customFields, departmentNames };
}
