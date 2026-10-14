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
    key: "counseling_scheduled",
    label: "Counselling appointment booked",
    description: "Texted to the person when a counselling session is booked for them. Never includes what it is about.",
    placeholders: ["name", "church", "counselor", "when"],
    default: "Hi {name}, your counselling appointment at {church} with {counselor} is booked for {when}. Reply or call the church office if you need to change it. God bless you.",
  },
  {
    key: "counseling_reminder",
    label: "Counselling appointment reminder",
    description: "Texted automatically the day before a counselling appointment (and when you tap Send reminder).",
    placeholders: ["name", "church", "counselor", "when"],
    default: "Hi {name}, a reminder of your counselling appointment at {church} with {counselor} on {when}. We look forward to seeing you. God bless.",
  },
  {
    key: "counseling_update",
    label: "Counselling appointment changed",
    description: "Texted when a counselling appointment is moved or its details change.",
    placeholders: ["name", "church", "counselor", "when"],
    default: "Hi {name}, your counselling appointment at {church} with {counselor} has been updated. It is now {when}. God bless you.",
  },
  {
    key: "service_thanks",
    label: "Thank you after service (to each member who came)",
    description: "Texted to every member who checked in, when you end a service and choose to thank everyone. Off by default.",
    placeholders: ["name", "church", "service"],
    default: "Dear {name}, thank you for worshipping with us at {church} today. We were truly blessed to have you. Have a blessed week ahead!",
  },
  {
    key: "service_welcome_back",
    label: "Welcome back after service (to a returning visitor)",
    description: "Texted to a visitor who has been before and checked in again, when you end a service and choose to thank everyone who came. Off unless you tick it.",
    placeholders: ["name", "church", "service"],
    default: "Dear {name}, welcome back! It was lovely to see you again at {church} today. You are always welcome with us. Have a blessed week ahead!",
  },
  {
    key: "absent_member",
    label: "We have not seen you in a while (to the member)",
    description: "Texted to a member who has not been to church for the number of weeks you set. By default once; you can allow a gentle reminder or two. Attending again resets it.",
    placeholders: ["name", "church", "weeks"],
    default: "Hi {name}, we have missed you at {church}. You are always welcome, and we would love to see you again. Is there any way we can pray with you or support you? God bless you.",
  },
  {
    key: "absent_admin",
    label: "Members not seen in a while (to admins)",
    description: "Texted and emailed to the team members you choose (every admin if you choose nobody) once, when members have been away for the number of weeks you set.",
    placeholders: ["count", "church", "list", "weeks"],
    default: "{count} member(s) at {church} have not been seen for {weeks} week(s) or more: {list}. Please open WorshipHQ > Follow-ups and assign someone to check on them.",
  },
  {
    key: "visitor_return",
    label: "Good to see you again (returning visitor)",
    description: "Send this from a visitor's profile when they check in or visit again - it's never sent automatically.",
    placeholders: ["name", "church"],
    default: "Hi {name}, so good to see you again at {church}! We're grateful you keep coming back. God bless you.",
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
 *  and trims spaces before punctuation - newlines are preserved. */
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
