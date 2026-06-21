/**
 * Registration form definition — shared by the settings form builder and the
 * public join form. Stored as JSON in Church.registrationFields.
 *
 * A field is either a "system" field (id maps to a Person column) or a custom
 * field (stored into Person.customFields). firstName/lastName are locked.
 */

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "tel"
  | "email"
  | "select"
  | "radio"
  | "checkbox"
  | "image";

export interface FieldCondition {
  fieldId: string; // show this field only when…
  equals: string; // …another field's value equals this
}

export interface FormField {
  id: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  options?: string[]; // for select
  showIf?: FieldCondition;
  system?: boolean; // maps to a Person column (id is the column key)
  locked?: boolean; // cannot be removed (first/last name)
}

/** Person columns a system field can map to (id === column key). */
export const SYSTEM_COLUMNS = [
  "firstName", "lastName", "otherNames", "email", "phone", "photoUrl",
  "gender", "title", "dateOfBirth", "occupation", "employer",
  "previousChurch", "dateOfMembership", "placeOfBirth", "nationality",
  "country", "region", "district", "town", "nationalId", "houseAddress",
  "homeTown", "workPhone", "postalAddress", "homePhone", "specialInterest",
  "maritalStatus", "baptized", "emergencyName", "emergencyPhone",
  "emergencyRelation", "emergencyEmail", "emergencyAddress",
] as const;

export type SystemColumn = (typeof SYSTEM_COLUMNS)[number];

export function isSystemColumn(id: string): id is SystemColumn {
  return (SYSTEM_COLUMNS as readonly string[]).includes(id);
}

const GENDER = ["Male", "Female"];
const TITLES = ["Mr", "Mrs", "Ms", "Dr", "Rev", "Pastor", "Elder", "Deacon", "Deaconess"];
const MARITAL = ["Single", "Married", "Divorced", "Widowed"];
const YESNO = ["Yes", "No"];

const NATIONALITIES = [
  "Ghanaian", "Nigerian", "South African", "Kenyan", "Tanzanian", "Ugandan",
  "Ethiopian", "Cameroonian", "Ivorian", "Senegalese", "Togolese", "Beninese",
  "Burkinabe", "Malian", "Nigerien", "Liberian", "Sierra Leonean", "Gambian",
  "Guinean", "Rwandan", "Congolese", "Zambian", "Zimbabwean", "Mozambican",
  "Angolan", "Namibian", "Botswanan", "Swazi", "Lesothan", "Malawian",
  "Malagasy", "Mauritian", "Seychellois", "Sudanese", "South Sudanese",
  "Somali", "Eritrean", "Djiboutian", "Egyptian", "Libyan", "Tunisian",
  "Algerian", "Moroccan", "American", "British", "Canadian", "Australian",
  "German", "French", "Italian", "Spanish", "Dutch", "Belgian", "Swiss",
  "Swedish", "Norwegian", "Danish", "Finnish", "Portuguese", "Greek",
  "Polish", "Austrian", "Irish", "Brazilian", "Mexican", "Colombian",
  "Argentine", "Peruvian", "Chilean", "Venezuelan", "Cuban", "Jamaican",
  "Trinidadian", "Barbadian", "Guyanese", "Indian", "Chinese", "Japanese",
  "Korean", "Filipino", "Indonesian", "Malaysian", "Thai", "Vietnamese",
  "Pakistani", "Bangladeshi", "Sri Lankan", "Nepalese", "Lebanese",
  "Israeli", "Turkish", "Iranian", "Iraqi", "Saudi", "Emirati", "Qatari",
  "Kuwaiti", "Bahraini", "Omani", "Jordanian", "Palestinian", "Syrian",
  "Yemeni", "Afghan", "Russian", "Ukrainian", "Belarusian", "Georgian",
  "Armenian", "Azerbaijani", "Kazakh", "Uzbek", "New Zealander", "Fijian",
  "Samoan", "Tongan", "Papua New Guinean",
];

/** Catalogue of system fields an admin can add from the builder palette. */
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
  { id: "nationality", label: "Nationality", type: "select", options: NATIONALITIES, system: true },
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
];

/** Department is a system field whose options come from the church's departments. */
export const DEPARTMENT_FIELD_ID = "department";

/** The default form shown to churches that haven't customised it. */
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

const VALID_TYPES: FieldType[] = ["text", "textarea", "number", "date", "tel", "email", "select", "radio", "checkbox", "image"];

/** Coerce one stored object into a valid FormField (defensive against bad JSON). */
function coerceField(raw: unknown): FormField | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id : "";
  const label = typeof r.label === "string" ? r.label : "";
  if (!id || !label) return null;
  const type = VALID_TYPES.includes(r.type as FieldType) ? (r.type as FieldType) : "text";
  const field: FormField = { id, label, type };
  if (r.required) field.required = true;
  if (typeof r.placeholder === "string") field.placeholder = r.placeholder;
  if (Array.isArray(r.options)) field.options = r.options.filter((o) => typeof o === "string") as string[];
  if (r.system) field.system = true;
  if (r.locked) field.locked = true;
  if (r.showIf && typeof r.showIf === "object") {
    const s = r.showIf as Record<string, unknown>;
    if (typeof s.fieldId === "string" && typeof s.equals === "string") {
      field.showIf = { fieldId: s.fieldId, equals: s.equals };
    }
  }
  return field;
}

/**
 * Resolve the stored value into a usable FormField[].
 * - new shape: an array of field objects → used as-is (validated)
 * - legacy shape: a { key: boolean } map → enable matching system fields
 * - null/unknown: the DEFAULT_FORM
 * firstName/lastName are always guaranteed first.
 */
export function getFormDefinition(raw: unknown): FormField[] {
  let fields: FormField[];

  if (Array.isArray(raw)) {
    fields = raw.map(coerceField).filter((f): f is FormField => f !== null);
  } else if (raw && typeof raw === "object") {
    // legacy boolean toggle map → start from default name/phone/email + enabled system fields
    const map = raw as Record<string, boolean>;
    const enabled = SYSTEM_FIELD_CATALOG.filter((f) => map[f.id] === true);
    fields = [
      DEFAULT_FORM[0], DEFAULT_FORM[1],
      { id: "phone", label: "Phone Number (Call & SMS)", type: "tel", required: true, system: true },
      { id: "email", label: "Email", type: "email", system: true },
      ...enabled,
    ];
  } else {
    fields = DEFAULT_FORM;
  }

  // Guarantee locked name fields exist and lead.
  const ensure = (id: string, fallback: FormField) =>
    fields.find((f) => f.id === id) ?? fallback;
  const first = { ...ensure("firstName", DEFAULT_FORM[0]), required: true, locked: true, system: true };
  const last = { ...ensure("lastName", DEFAULT_FORM[1]), required: true, locked: true, system: true };
  const rest = fields.filter((f) => f.id !== "firstName" && f.id !== "lastName");
  return [first, last, ...rest];
}
