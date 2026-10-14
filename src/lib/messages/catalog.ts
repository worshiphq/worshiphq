import { MESSAGE_TEMPLATES } from "@/lib/messages/registry";
import { DEFAULT_TEMPLATES } from "@/lib/messages/automation-defaults";
import { DEFAULT_ATTENDANCE_REPORT } from "@/lib/attendance/report";
import { DEFAULT_HARVEST_RECEIPT } from "@/lib/harvest/receipt";
import { DEFAULT_PLEDGE_TEMPLATE, DEFAULT_PLEDGE_REMINDER_TEMPLATE } from "@/lib/pledges/templates";

/**
 * Every text the app sends for the church, in one list, so one editor can show
 * and change all of them. Client-safe (defaults and sample values only).
 *
 *  registry   -> Church.messageTemplates (JSON map by key)
 *  church     -> a text column on Church
 *  automation -> Automation.messageTemplate for the automation with that trigger
 */
export type MessageStore = "registry" | "church" | "automation";

export interface CatalogItem {
  key: string;
  group: GroupId;
  label: string;
  description: string;
  placeholders: string[];
  default: string;
  store: MessageStore;
  /** Column on Church (store = church) or automation trigger (store = automation). */
  field?: string;
  /** Sent to your team instead of members. */
  toAdmins?: boolean;
}

export type GroupId = "members" | "attendance" | "birthdays" | "rosters" | "care" | "giving" | "welfare";

export const GROUPS: { id: GroupId; label: string; hint: string }[] = [
  { id: "members", label: "Members and visitors", hint: "Welcomes, thanks and gentle check-ins" },
  { id: "attendance", label: "Attendance", hint: "Not seen in a while, and service reports" },
  { id: "birthdays", label: "Birthdays", hint: "Wishes and the digest for admins" },
  { id: "rosters", label: "Rosters", hint: "Duty reminders and announcements" },
  { id: "care", label: "Follow-ups and counselling", hint: "Assignments, appointments and reminders" },
  { id: "giving", label: "Giving and pledges", hint: "Receipts and reminders" },
  { id: "welfare", label: "Welfare", hint: "Dues receipts and owing reminders" },
];

const REGISTRY_GROUP: Record<string, GroupId> = {
  roster_reminder: "rosters", roster_announcement: "rosters",
  followup_assigned: "care", counseling_scheduled: "care", counseling_reminder: "care", counseling_update: "care",
  visitor_return: "members",
  birthday_wish: "birthdays", birthday_admin_today: "birthdays", birthday_digest: "birthdays",
  absent_member: "attendance", absent_admin: "attendance", service_thanks: "attendance", service_welcome_back: "attendance",
};
const ADMIN_KEYS = new Set(["birthday_admin_today", "birthday_digest", "absent_admin", "followup_assigned"]);

const AUTOMATION: CatalogItem[] = [
  { key: "auto_visitor_followup", group: "members", label: "Thank you for visiting (first time visitors)", description: "Texted a few days after a visitor registers. Set the delay under Reminders.", placeholders: ["name", "church"], default: DEFAULT_TEMPLATES.visitor_followup, store: "automation", field: "visitor_followup" },
  { key: "auto_new_member", group: "members", label: "Welcome (new members)", description: "Texted to newly registered members.", placeholders: ["name", "church"], default: DEFAULT_TEMPLATES.new_member, store: "automation", field: "new_member" },
  { key: "auto_giving_thanks", group: "giving", label: "Thank you for giving", description: "Texted to members after they have given.", placeholders: ["name", "church"], default: DEFAULT_TEMPLATES.giving_thanks, store: "automation", field: "giving_thanks" },
  { key: "auto_anniversary", group: "members", label: "Anniversary wish", description: "Texted to each partner on their wedding anniversary. Add the date on a member's profile under Family and marriage, or ask for it on your join form.", placeholders: ["name", "church"], default: DEFAULT_TEMPLATES.anniversary, store: "automation", field: "anniversary" },
];

const CHURCH: CatalogItem[] = [
  { key: "church_attendance_report", group: "attendance", label: "End of service report", description: "Texted to the leaders you choose when you end a service.", placeholders: ["church", "service", "date", "total", "adults", "teens", "children", "visitors"], default: DEFAULT_ATTENDANCE_REPORT, store: "church", field: "attendanceReportTemplate", toAdmins: true },
  { key: "church_tithe_receipt", group: "giving", label: "Tithe receipt", description: "Texted to a member when their tithe is recorded.", placeholders: ["name", "amount", "church"], default: "Dear {name}, your Tithe of GHS {amount} has been received by {church}. God Bless You for paying your Tithes to the Lord. Malachi 3:10 Shalom!", store: "church", field: "titheReceiptTemplate" },
  { key: "church_harvest_receipt", group: "giving", label: "Harvest receipt", description: "Texted to each harvest giver when their contribution is recorded.", placeholders: ["name", "amount", "church"], default: DEFAULT_HARVEST_RECEIPT, store: "church", field: "harvestReceiptTemplate" },
  { key: "church_pledge_receipt", group: "giving", label: "Pledge recorded", description: "Texted when a pledge is recorded.", placeholders: ["name", "amount", "church", "due"], default: DEFAULT_PLEDGE_TEMPLATE, store: "church", field: "pledgeReceiptTemplate" },
  { key: "church_pledge_reminder", group: "giving", label: "Pledge reminder", description: "Texted automatically before a pledge is due.", placeholders: ["name", "total", "church", "days", "balance"], default: DEFAULT_PLEDGE_REMINDER_TEMPLATE, store: "church", field: "pledgeReminderTemplate" },
  { key: "church_welfare_receipt", group: "welfare", label: "Welfare dues receipt", description: "Texted to a member when their dues are recorded.", placeholders: ["title", "name", "church", "amount", "months", "balance"], default: "Dear {title} {name}, your welfare dues of GHS {amount} for {months} have been received by {church}. {balance} God bless.", store: "church", field: "welfareDuesReceiptTemplate" },
  { key: "church_welfare_reminder", group: "welfare", label: "Welfare dues reminder", description: "Texted to members who owe dues.", placeholders: ["title", "name", "church", "owed", "balance"], default: "Dear {title} {name}, a friendly reminder from {church}: your welfare dues balance is GHS {owed}. Kindly settle when you can. God bless you.", store: "church", field: "welfareDuesReminderTemplate" },
];

export const CATALOG: CatalogItem[] = [
  ...MESSAGE_TEMPLATES.map((t): CatalogItem => ({
    key: t.key, group: REGISTRY_GROUP[t.key] ?? "members", label: t.label, description: t.description,
    placeholders: t.placeholders, default: t.default, store: "registry", toAdmins: ADMIN_KEYS.has(t.key),
  })),
  ...AUTOMATION,
  ...CHURCH,
];

/** Example values so the preview reads like a real message. */
export const SAMPLE: Record<string, string> = {
  name: "Ama", title: "Mrs.", church: "Grace Chapel", weeks: "3", count: "3", list: "Kofi Mensah (3w), Esi Owusu (4w)",
  service: "2nd Service", date: "Sun 11 Oct", duties: "Offertory, Announcements", details: "Reach out to Kofi (0241234567). Due 16 Oct.",
  counselor: "Rev. Owusu", when: "Fri 16 Oct, 3:00 PM", amount: "150.00", months: "Jan to Mar 2026", balance: "Balance: GHS 0.", owed: "90.00",
  total: "250", adults: "180", teens: "30", children: "25", visitors: "15", due: ", due 30 Nov", days: "3", paid: "400.00",
};

export function itemByKey(key: string) {
  return CATALOG.find((c) => c.key === key);
}
