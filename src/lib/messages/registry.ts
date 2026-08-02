/**
 * Editable system-SMS templates. These are the automatic texts the app sends
 * that aren't already customizable elsewhere (tithe/harvest/pledge/welfare have
 * their own editors). Defaults are kept ASCII-clean so no characters turn into
 * "?" on phones that don't support the extended GSM charset.
 *
 * Client-safe (no server-only) so the editor UI can read defaults + metadata.
 */

export interface MessageTemplate {
  key: string;
  label: string;
  description: string;
  placeholders: string[];
  default: string;
}

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    key: "roster_reminder",
    label: "Roster duty reminder",
    description: "Texted to each person on a service sheet when you tap 'Text everyone'.",
    placeholders: ["name", "church", "duties"],
    default: "Hello {name}, you are serving at {church}:\n{duties}\nPlease be ready. God bless.",
  },
  {
    key: "followup_assigned",
    label: "Follow-up assigned",
    description: "Texted to a team member when a follow-up task is assigned to them.",
    placeholders: ["name", "church", "title", "details"],
    default: "New follow-up assigned to you at {church}: \"{title}\". {details} Please action it. God bless.",
  },
  {
    key: "birthday_digest",
    label: "Weekly birthday digest (to admins)",
    description: "Texted to admins with the week's upcoming birthdays.",
    placeholders: ["count", "church", "list"],
    default: "{count} birthday(s) this week at {church}: {list}. Open WorshipHQ for the full list.",
  },
];

/** Replace {placeholders} in a template. Unknown placeholders become "". */
export function renderTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

/** The custom text for a key (from Church.messageTemplates) or its default. */
export function templateFor(store: unknown, key: string): string {
  const def = MESSAGE_TEMPLATES.find((t) => t.key === key)?.default ?? "";
  if (store && typeof store === "object") {
    const v = (store as Record<string, unknown>)[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  return def;
}
