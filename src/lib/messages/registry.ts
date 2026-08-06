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
    description: "Texted to each person on a service sheet when you tap 'Text everyone'. Use {title} for Mr./Mrs./Rev. etc.",
    placeholders: ["title", "name", "church", "duties"],
    default: "Hello {title} {name}, you are serving at {church}:\n{duties}\nPlease be ready. God bless.",
  },
  {
    key: "roster_announcement",
    label: "Roster announcement (to a group)",
    description: "The whole service sheet, sent to a group ahead of the service (auto or manual).",
    placeholders: ["church", "service", "date", "list"],
    default: "{church} - {service} ({date}):\n{list}",
  },
  {
    key: "followup_assigned",
    label: "Follow-up assigned",
    description: "Texted to a team member when a follow-up task is assigned to them.",
    placeholders: ["name", "church", "title", "details"],
    default: "New follow-up assigned to you at {church}: \"{title}\". {details} Please action it. God bless.",
  },
  {
    key: "birthday_wish",
    label: "Birthday wish (to the member)",
    description: "Texted to a member on their birthday. Use {title} for Mr./Mrs./Rev. etc.",
    placeholders: ["title", "name", "church"],
    default: "Happy birthday {title} {name}! The whole family at {church} is celebrating you today. May God bless your new year.",
  },
  {
    key: "birthday_admin_today",
    label: "Today's birthdays (to admins)",
    description: "Texted/emailed to admins on the day, listing who is celebrating today.",
    placeholders: ["count", "church", "list"],
    default: "Today at {church}: {count} birthday(s) - {list}. Reach out and celebrate them!",
  },
  {
    key: "birthday_digest",
    label: "Weekly birthday digest (to admins)",
    description: "Texted/emailed to admins with the week's upcoming birthdays.",
    placeholders: ["count", "church", "list"],
    default: "{count} birthday(s) this week at {church}: {list}. Open WorshipHQ for the full list.",
  },
];

/** Replace {placeholders} in a template. Unknown placeholders become "".
 *  Collapses runs of spaces (so an empty {title} doesn't leave a double space)
 *  and trims spaces before punctuation — newlines are preserved. */
export function renderTemplate(text: string, vars: Record<string, string>): string {
  return text
    .replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ ([,.!?:])/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
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
