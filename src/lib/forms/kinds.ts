import {
  type FormField,
  getFormDefinition, getVisitorFormDefinition, getChildrenFormDefinition, getTeensFormDefinition,
  DEFAULT_FORM, DEFAULT_VISITOR_FORM, DEFAULT_CHILDREN_FORM, DEFAULT_TEENS_FORM, SYSTEM_FIELD_CATALOG,
  questionFields,
} from "@/lib/forms/registration";

/**
 * Every public form a church can customise, in one place: where it is stored,
 * what it starts as, and what the builder may add. Client-safe.
 */
export type FormKind = "join" | "visitor" | "children" | "teens" | "prayer" | "testimony" | "counsel" | "give" | "book" | "baptism";

/** Column on Church that stores the definition. */
export type FormColumn =
  | "registrationFields" | "visitorFormFields" | "childrenFormFields" | "teensFormFields"
  | "prayerFormFields" | "testimonyFormFields" | "counselFormFields" | "giveFormFields" | "bookingFormFields" | "baptismFormFields";

export interface FormKindInfo {
  kind: FormKind;
  label: string;
  description: string;
  column: FormColumn;
  path: (slug: string) => string;
  /** The form as it starts, and what the builder offers as "standard fields". */
  defaults: FormField[];
  catalog: FormField[];
  resolve: (raw: unknown) => FormField[];
  /** Fields the page draws with its own widget (cannot change type or be removed). */
  special: string[];
  /** The kind keeps its standard fields, and the builder mostly adds your own questions. */
  simple: boolean;
  submitLabel: string;
  /** Used inside the app only (no public page yet). */
  internal?: boolean;
}

const f = (x: FormField): FormField => ({ system: true, ...x });

export const DEFAULT_PRAYER_FORM: FormField[] = [
  f({ id: "name", label: "Your name", type: "text", placeholder: "Full name", showIf: { fieldId: "isAnonymous", equals: "yes", not: true } }),
  f({ id: "request", label: "Prayer request", type: "textarea", required: true, locked: true, placeholder: "Share what you would like prayer for..." }),
  f({ id: "isAnonymous", label: "Submit anonymously", type: "checkbox" }),
];

export const TESTIMONY_CATEGORIES = ["Praise report", "Healing", "Provision", "Deliverance", "Salvation", "Other"];
export const DEFAULT_TESTIMONY_FORM: FormField[] = [
  f({ id: "name", label: "Your name", type: "text", placeholder: "Full name", showIf: { fieldId: "anonymous", equals: "yes", not: true } }),
  f({ id: "title", label: "Title", type: "text", required: true, locked: true, placeholder: "e.g. Healed after prayer" }),
  f({ id: "category", label: "Category", type: "select", options: TESTIMONY_CATEGORIES }),
  f({ id: "body", label: "Your testimony", type: "textarea", required: true, locked: true, placeholder: "Share the full story. Take as much space as you need." }),
  f({ id: "anonymous", label: "Share anonymously", type: "checkbox" }),
];

export const COUNSEL_TYPES = ["General / not sure", "Marriage / family", "Spiritual growth", "Grief / loss", "Financial", "Health", "Other"];
export const DEFAULT_COUNSEL_FORM: FormField[] = [
  f({ id: "name", label: "Your name", type: "text", required: true, placeholder: "Full name" }),
  f({ id: "phone", label: "Phone (so we can reach you)", type: "tel", placeholder: "024 000 0000" }),
  f({ id: "type", label: "What is it about?", type: "select", options: COUNSEL_TYPES }),
  f({ id: "reason", label: "Briefly, how can we help?", type: "textarea", required: true, locked: true, placeholder: "Share as much or as little as you are comfortable with. This is kept confidential." }),
];

export const DEFAULT_GIVE_FORM: FormField[] = [
  f({ id: "donor", label: "Full name", type: "text", placeholder: "Kwame Mensah" }),
  f({ id: "phone", label: "Phone number", type: "tel", placeholder: "+233 24 000 0000" }),
  f({ id: "email", label: "Email", type: "email", placeholder: "you@example.com" }),
  f({ id: "amount", label: "Amount", type: "number", required: true, locked: true }),
  f({ id: "fund", label: "Give towards", type: "select", locked: true }),
];

export const DEFAULT_BOOKING_FORM: FormField[] = [
  f({ id: "facility", label: "Choose a space", type: "select", required: true, locked: true }),
  f({ id: "when", label: "When do you need it?", type: "date", required: true, locked: true }),
  f({ id: "purpose", label: "What is it for?", type: "text", required: true, placeholder: "e.g. Wedding reception, funeral, workshop" }),
  f({ id: "name", label: "Your name", type: "text", required: true, locked: true }),
  f({ id: "phone", label: "Phone number", type: "tel", required: true, locked: true, placeholder: "024 000 0000" }),
  f({ id: "email", label: "Email (optional)", type: "email" }),
  f({ id: "notes", label: "Anything else we should know?", type: "textarea", placeholder: "Number of guests, setup you need, sound system..." }),
];

export const DEFAULT_BAPTISM_FORM: FormField[] = [
  f({ id: "name", label: "Name", type: "text", required: true, locked: true }),
  f({ id: "date", label: "Date of baptism", type: "date", locked: true }),
  f({ id: "place", label: "Place", type: "text", placeholder: "e.g. Grace Chapel, or the river" }),
  f({ id: "officiant", label: "Who baptised them", type: "text", placeholder: "e.g. Pastor Daniel Owusu" }),
  f({ id: "notes", label: "Notes", type: "textarea" }),
];

function coerceList(raw: unknown): FormField[] | null {
  let v = raw;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { return null; } }
  if (!Array.isArray(v)) return null;
  const out: FormField[] = [];
  for (const r of v) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.label !== "string" || !o.id || !o.label) continue;
    out.push(o as unknown as FormField);
  }
  return out;
}

/**
 * Resolve a stored definition for one of the simpler forms. Standard fields that
 * the page depends on are always present and keep their type; labels, hints,
 * order and required (where allowed) can be changed, and your own questions and
 * steps ride along.
 */
export function resolveSimple(raw: unknown, defaults: FormField[]): FormField[] {
  const stored = coerceList(raw);
  if (!stored || stored.length === 0) return defaults;
  const byId = new Map(defaults.map((d) => [d.id, d]));
  const cleaned: FormField[] = stored.map((s) => {
    const d = byId.get(s.id);
    const base: FormField = {
      id: s.id, label: String(s.label).slice(0, 160), type: s.type, required: !!s.required,
      ...(s.placeholder ? { placeholder: String(s.placeholder).slice(0, 160) } : {}),
      ...(s.help ? { help: String(s.help).slice(0, 300) } : {}),
      ...(Array.isArray(s.options) ? { options: s.options.filter((x) => typeof x === "string").slice(0, 100) } : {}),
      ...(s.showIf && typeof s.showIf === "object" ? { showIf: s.showIf } : {}),
      ...(s.system ? { system: true } : {}),
    };
    if (!d) return { ...base, system: false };
    // A standard field: keep its type, lock status and meaning.
    return { ...base, type: d.type, system: true, ...(d.locked ? { locked: true, required: d.required ?? base.required } : {}), ...(d.options && !base.options?.length ? { options: d.options } : {}) };
  });
  // A step marker is allowed anywhere; standard locked fields must exist.
  for (const d of defaults) {
    if (d.locked && !cleaned.some((c) => c.id === d.id)) cleaned.push(d);
  }
  return cleaned;
}

const joinCatalog = SYSTEM_FIELD_CATALOG;
const visitorCatalog: FormField[] = [
  ...DEFAULT_VISITOR_FORM.filter((d) => !["firstName", "lastName"].includes(d.id)),
  ...SYSTEM_FIELD_CATALOG.filter((c) => !DEFAULT_VISITOR_FORM.some((d) => d.id === c.id) && c.id !== "groups"),
];

export const FORM_KINDS: Record<FormKind, FormKindInfo> = {
  join: {
    kind: "join", label: "Member registration", description: "Members fill in their own details and appear in your People list.",
    column: "registrationFields", path: (s) => `/join/${s}`, defaults: DEFAULT_FORM, catalog: joinCatalog,
    resolve: getFormDefinition, special: ["department", "groups"], simple: false, submitLabel: "Submit registration",
  },
  visitor: {
    kind: "visitor", label: "Visitor form", description: "A simple form for first time visitors.",
    column: "visitorFormFields", path: (s) => `/visit/${s}`, defaults: DEFAULT_VISITOR_FORM, catalog: visitorCatalog,
    resolve: getVisitorFormDefinition, special: [], simple: false, submitLabel: "Submit",
  },
  children: {
    kind: "children", label: "Children's registration", description: "Register children with guardian details, school and class.",
    column: "childrenFormFields", path: (s) => `/children/${s}`, defaults: DEFAULT_CHILDREN_FORM, catalog: joinCatalog,
    resolve: getChildrenFormDefinition, special: [], simple: false, submitLabel: "Register child",
  },
  teens: {
    kind: "teens", label: "Teens registration", description: "Teens register with guardian info and choose their department.",
    column: "teensFormFields", path: (s) => `/teens/${s}`, defaults: DEFAULT_TEENS_FORM, catalog: joinCatalog,
    resolve: getTeensFormDefinition, special: ["department", "groups"], simple: false, submitLabel: "Register",
  },
  prayer: {
    kind: "prayer", label: "Prayer requests", description: "Members send prayer requests from their phones.",
    column: "prayerFormFields", path: (s) => `/pray/${s}`, defaults: DEFAULT_PRAYER_FORM, catalog: DEFAULT_PRAYER_FORM,
    resolve: (r) => resolveSimple(r, DEFAULT_PRAYER_FORM), special: [], simple: true, submitLabel: "Submit prayer request",
  },
  testimony: {
    kind: "testimony", label: "Testimonies", description: "Members share testimonies for you to review.",
    column: "testimonyFormFields", path: (s) => `/testify/${s}`, defaults: DEFAULT_TESTIMONY_FORM, catalog: DEFAULT_TESTIMONY_FORM,
    resolve: (r) => resolveSimple(r, DEFAULT_TESTIMONY_FORM), special: [], simple: true, submitLabel: "Share testimony",
  },
  counsel: {
    kind: "counsel", label: "Counselling requests", description: "Members privately ask for counselling.",
    column: "counselFormFields", path: (s) => `/counsel/${s}`, defaults: DEFAULT_COUNSEL_FORM, catalog: DEFAULT_COUNSEL_FORM,
    resolve: (r) => resolveSimple(r, DEFAULT_COUNSEL_FORM), special: [], simple: true, submitLabel: "Request counselling",
  },
  give: {
    kind: "give", label: "Online giving", description: "The page where people give by Mobile Money or card.",
    column: "giveFormFields", path: (s) => `/give/${s}`, defaults: DEFAULT_GIVE_FORM, catalog: DEFAULT_GIVE_FORM,
    resolve: (r) => resolveSimple(r, DEFAULT_GIVE_FORM), special: ["amount", "fund"], simple: true, submitLabel: "Give now",
  },
  book: {
    kind: "book", label: "Facility booking", description: "People ask to book your hall or rooms.",
    column: "bookingFormFields", path: (s) => `/book/${s}`, defaults: DEFAULT_BOOKING_FORM, catalog: DEFAULT_BOOKING_FORM,
    resolve: (r) => resolveSimple(r, DEFAULT_BOOKING_FORM), special: ["facility", "when"], simple: true, submitLabel: "Send booking request",
  },
  baptism: {
    kind: "baptism", label: "Baptism record", description: "The questions you fill in for each baptism. Add your own, or remove the ones you do not use.",
    column: "baptismFormFields", path: () => "", defaults: DEFAULT_BAPTISM_FORM, catalog: DEFAULT_BAPTISM_FORM,
    resolve: (r) => resolveSimple(r, DEFAULT_BAPTISM_FORM), special: ["name"], simple: true, submitLabel: "Save", internal: true,
  },
};

export function isFormKind(v: string): v is FormKind {
  return v in FORM_KINDS;
}

/** Ids of the questions a church added itself (not standard fields). */
export const customFields = (fields: FormField[]) => questionFields(fields).filter((x) => !x.system);

/**
 * Collect the answers to the church's own extra questions from a submitted form,
 * as [{ label, value }] so the record stays readable even if the form changes later.
 */
export function collectExtraAnswers(fields: FormField[], get: (id: string) => string[]): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  for (const q of customFields(fields)) {
    const vals = get(q.id).map((v) => v.trim()).filter(Boolean);
    if (vals.length === 0) continue;
    const value = q.type === "checkbox" ? "Yes" : vals.join(", ");
    out.push({ label: q.label, value: value.slice(0, 2000) });
  }
  return out.slice(0, 40);
}
