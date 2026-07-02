import { useState } from "react";
import { Loader2, Plus, Trash2, GripVertical, Lock, Save } from "lucide-react";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";

/* ── Form field types (mirrors web src/lib/forms/registration.ts) ── */
export type FieldType =
  | "text" | "textarea" | "number" | "date" | "tel" | "email"
  | "select" | "radio" | "checkbox" | "image";

export interface FormField {
  id: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  system?: boolean;
  locked?: boolean;
}

const GENDER = ["Male", "Female"];
const TITLES = ["Mr", "Mrs", "Ms", "Dr", "Rev", "Pastor", "Elder", "Deacon", "Deaconess"];
const MARITAL = ["Single", "Married", "Divorced", "Widowed"];
const YESNO = ["Yes", "No"];

/* System field catalog an admin can add from the palette. */
export const SYSTEM_FIELD_CATALOG: FormField[] = [
  { id: "photoUrl", label: "Profile photo", type: "image", system: true },
  { id: "otherNames", label: "Other names", type: "text", system: true },
  { id: "gender", label: "Gender", type: "select", options: GENDER, system: true },
  { id: "title", label: "Title", type: "select", options: TITLES, system: true },
  { id: "dateOfBirth", label: "Date of birth", type: "date", system: true },
  { id: "maritalStatus", label: "Marital status", type: "select", options: MARITAL, system: true },
  { id: "occupation", label: "Occupation", type: "text", system: true },
  { id: "employer", label: "Employer", type: "text", system: true },
  { id: "previousChurch", label: "Previous church", type: "text", system: true },
  { id: "dateOfMembership", label: "Date of membership", type: "date", system: true },
  { id: "placeOfBirth", label: "Place of birth", type: "text", system: true },
  { id: "nationality", label: "Nationality", type: "text", system: true },
  { id: "country", label: "Country", type: "text", system: true },
  { id: "region", label: "Region", type: "text", system: true },
  { id: "district", label: "District", type: "text", system: true },
  { id: "town", label: "Town", type: "text", system: true },
  { id: "nationalId", label: "National ID (Ghana Card)", type: "text", system: true },
  { id: "houseAddress", label: "House address", type: "text", system: true },
  { id: "homeTown", label: "Home town", type: "text", system: true },
  { id: "workPhone", label: "Work phone", type: "tel", system: true },
  { id: "homePhone", label: "Home phone", type: "tel", system: true },
  { id: "postalAddress", label: "Postal address", type: "text", system: true },
  { id: "specialInterest", label: "Special interest / skills", type: "text", system: true },
  { id: "baptized", label: "Have you been baptised?", type: "select", options: YESNO, system: true },
  { id: "emergencyName", label: "Emergency contact name", type: "text", system: true },
  { id: "emergencyPhone", label: "Emergency contact phone", type: "tel", system: true },
  { id: "emergencyRelation", label: "Emergency contact relationship", type: "text", system: true },
  { id: "emergencyEmail", label: "Emergency contact email", type: "email", system: true },
  { id: "emergencyAddress", label: "Emergency contact address", type: "text", system: true },
  { id: "department", label: "Department / ministry", type: "select", system: true },
  { id: "guardianName", label: "Parent / guardian name", type: "text", system: true },
  { id: "guardianPhone", label: "Parent / guardian phone", type: "tel", system: true },
  { id: "school", label: "School", type: "text", system: true },
  { id: "grade", label: "Class / grade", type: "text", system: true },
];

/* Default definitions matching web fallbacks. */
export const DEFAULT_FORM: FormField[] = [
  { id: "firstName", label: "First name", type: "text", required: true, system: true, locked: true },
  { id: "lastName", label: "Last name", type: "text", required: true, system: true, locked: true },
  { id: "phone", label: "Phone Number (Call & SMS)", type: "tel", required: true, system: true },
  { id: "email", label: "Email", type: "email", system: true },
  { id: "gender", label: "Gender", type: "select", options: GENDER, system: true },
  { id: "dateOfBirth", label: "Date of birth", type: "date", system: true },
  { id: "maritalStatus", label: "Marital status", type: "select", options: MARITAL, system: true },
  { id: "occupation", label: "Occupation", type: "text", system: true },
  { id: "town", label: "Town", type: "text", system: true },
  { id: "region", label: "Region", type: "text", system: true },
  { id: "baptized", label: "Have you been baptised?", type: "select", options: YESNO, system: true },
  { id: "emergencyName", label: "Emergency contact name", type: "text", system: true },
  { id: "emergencyPhone", label: "Emergency contact phone", type: "tel", system: true },
];

export const DEFAULT_VISITOR_FORM: FormField[] = [
  { id: "firstName", label: "First name", type: "text", required: true, system: true, locked: true },
  { id: "lastName", label: "Last name", type: "text", required: true, system: true, locked: true },
  { id: "phone", label: "Phone number", type: "tel", system: true },
  { id: "email", label: "Email", type: "email", system: true },
  { id: "purpose", label: "Purpose of visit", type: "select", options: ["Sunday Service", "Midweek Service", "Special Event", "Counselling", "Other"], system: true },
  { id: "notes", label: "Prayer request or notes", type: "textarea", system: true },
];

export const DEFAULT_CHILDREN_FORM: FormField[] = [
  { id: "firstName", label: "Child's first name", type: "text", required: true, system: true, locked: true },
  { id: "lastName", label: "Child's last name", type: "text", required: true, system: true, locked: true },
  { id: "gender", label: "Gender", type: "select", options: GENDER, system: true },
  { id: "dateOfBirth", label: "Date of birth", type: "date", system: true, required: true },
  { id: "guardianName", label: "Parent / guardian name", type: "text", system: true, required: true },
  { id: "guardianPhone", label: "Parent / guardian phone", type: "tel", system: true, required: true },
  { id: "school", label: "School", type: "text", system: true },
  { id: "grade", label: "Class / grade", type: "text", system: true },
];

export const DEFAULT_TEENS_FORM: FormField[] = [
  { id: "firstName", label: "First name", type: "text", required: true, system: true, locked: true },
  { id: "lastName", label: "Last name", type: "text", required: true, system: true, locked: true },
  { id: "phone", label: "Phone number", type: "tel", system: true },
  { id: "gender", label: "Gender", type: "select", options: GENDER, system: true },
  { id: "dateOfBirth", label: "Date of birth", type: "date", system: true, required: true },
  { id: "guardianName", label: "Parent / guardian name", type: "text", system: true, required: true },
  { id: "guardianPhone", label: "Parent / guardian phone", type: "tel", system: true, required: true },
  { id: "school", label: "School", type: "text", system: true },
  { id: "grade", label: "Class / grade", type: "text", system: true },
  { id: "department", label: "Department / ministry", type: "select", system: true },
];

/** Resolve stored JSON into a valid field array, guaranteeing locked name fields lead. */
export function resolveFormDefinition(raw: unknown, fallback: FormField[]): FormField[] {
  let fields: FormField[] = fallback;
  if (typeof raw === "string" && raw.trim()) {
    try { raw = JSON.parse(raw); } catch { raw = null; }
  }
  if (Array.isArray(raw)) {
    const coerced = raw
      .map((r: any) => (r && typeof r === "object" && r.id && r.label ? r as FormField : null))
      .filter((f): f is FormField => f !== null);
    if (coerced.length > 0) fields = coerced;
  }
  const ensure = (id: string, fb: FormField) => fields.find((f) => f.id === id) ?? fb;
  const first = { ...ensure("firstName", fallback[0]), required: true, locked: true, system: true };
  const last = { ...ensure("lastName", fallback[1]), required: true, locked: true, system: true };
  const rest = fields.filter((f) => f.id !== "firstName" && f.id !== "lastName");
  return [first, last, ...rest];
}

const TYPE_LABELS: Record<FieldType, string> = {
  text: "Text", textarea: "Paragraph", number: "Number", date: "Date",
  tel: "Phone", email: "Email", select: "Dropdown", radio: "Choice",
  checkbox: "Checkbox", image: "Image",
};

/**
 * Reusable form builder. Persists the definition JSON to the given church column.
 * Column defaults to "registration_fields"; visitor/children/teens override.
 */
export function FormBuilder({
  initial,
  churchId,
  column = "registration_fields",
  title = "Registration form builder",
  description = "Choose which fields new members fill in. First and last name are always required.",
  departments = [],
}: {
  initial: FormField[];
  churchId: string;
  column?: string;
  title?: string;
  description?: string;
  departments?: { id: string; name: string }[];
}) {
  const { showToast } = useAppStore();
  const [fields, setFields] = useState<FormField[]>(initial);
  const [saving, setSaving] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [customType, setCustomType] = useState<FieldType>("text");

  const usedIds = new Set(fields.map((f) => f.id));
  const available = SYSTEM_FIELD_CATALOG.filter((f) => !usedIds.has(f.id));

  function addField(f: FormField) {
    setFields((prev) => [...prev, { ...f }]);
    setShowPalette(false);
  }

  function addCustom() {
    if (!customLabel.trim()) return;
    const id = "custom_" + customLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    if (usedIds.has(id)) { showToast("A field with that name already exists", "error"); return; }
    setFields((prev) => [...prev, { id, label: customLabel.trim(), type: customType }]);
    setCustomLabel("");
    setShowPalette(false);
  }

  function removeField(id: string) {
    setFields((prev) => prev.filter((f) => f.id !== id));
  }

  function toggleRequired(id: string) {
    setFields((prev) => prev.map((f) => (f.id === id && !f.locked ? { ...f, required: !f.required } : f)));
  }

  function move(idx: number, dir: -1 | 1) {
    setFields((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 2 || target >= next.length) return prev; // keep name fields locked at top
      if (idx < 2) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await db.update("church", churchId, { [column]: JSON.stringify(fields) });
      showToast("Form saved! Changes will sync.");
    } catch {
      showToast("Failed to save form", "error");
    }
    setSaving(false);
  }

  return (
    <div className="card space-y-4">
      <div>
        <h3 className="text-sm font-bold text-ink">{title}</h3>
        <p className="text-xs text-ink-muted mt-0.5">{description}</p>
      </div>

      <div className="space-y-2">
        {fields.map((f, idx) => (
          <div key={f.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
            <div className="flex flex-col text-ink-faint">
              <button disabled={idx < 2} onClick={() => move(idx, -1)} className="hover:text-ink disabled:opacity-20 leading-none">▲</button>
              <button disabled={idx < 2 || idx >= fields.length - 1} onClick={() => move(idx, 1)} className="hover:text-ink disabled:opacity-20 leading-none">▼</button>
            </div>
            <GripVertical className="size-3.5 text-ink-faint" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-ink truncate">{f.label}</p>
                {f.locked && <Lock className="size-3 text-ink-faint" />}
                {f.id === "department" && departments.length > 0 && (
                  <span className="text-[10px] text-ink-faint">({departments.length} options)</span>
                )}
              </div>
              <p className="text-[10px] text-ink-faint">{TYPE_LABELS[f.type]}{f.system ? " · system" : " · custom"}</p>
            </div>
            <label className="flex items-center gap-1.5 text-xs text-ink-muted cursor-pointer">
              <input type="checkbox" checked={!!f.required} disabled={f.locked}
                onChange={() => toggleRequired(f.id)} className="rounded border-line accent-primary" />
              Required
            </label>
            {!f.locked && (
              <button onClick={() => removeField(f.id)}
                className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger">
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      <div>
        <button onClick={() => setShowPalette(!showPalette)} className="btn-secondary btn-sm">
          <Plus className="size-3.5" /> Add field
        </button>

        {showPalette && (
          <div className="mt-3 rounded-xl border border-line p-3 space-y-3">
            {available.length > 0 && (
              <div>
                <p className="text-xs font-medium text-ink-muted mb-2">System fields</p>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {available.map((f) => (
                    <button key={f.id} onClick={() => addField(f)}
                      className="rounded-lg border border-line px-2 py-1.5 text-left text-xs text-ink-muted hover:bg-surface-2 hover:text-ink">
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="border-t border-line pt-3">
              <p className="text-xs font-medium text-ink-muted mb-2">Custom field</p>
              <div className="flex items-center gap-2">
                <input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)}
                  className="input flex-1" placeholder="Field label..." />
                <select value={customType} onChange={(e) => setCustomType(e.target.value as FieldType)} className="input w-32">
                  {(Object.keys(TYPE_LABELS) as FieldType[]).map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                </select>
                <button onClick={addCustom} className="btn-primary btn-sm">Add</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-line pt-3">
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? <Loader2 className="size-4 whq-spin" /> : <Save className="size-4" />}
          {saving ? "Saving..." : "Save Form"}
        </button>
      </div>
    </div>
  );
}
