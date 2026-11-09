/** Monday briefing settings (client-safe). Stored as Church.briefing JSON. */

/** Extra sections a church can tick on or off (the core numbers are always there). */
export const BRIEFING_SECTIONS = [
  { key: "funds", label: "Giving by type", hint: "Tithes, offerings and each fund last week" },
  { key: "tithers", label: "Tithers this month", hint: "How many people paid tithe, against last month" },
  { key: "returners", label: "First-timers who came back", hint: "Visitors who returned last week" },
  { key: "pledges", label: "Pledge progress", hint: "How far each campaign is towards its goal" },
  { key: "sms", label: "SMS credit balance", hint: "A warning when credits are running low" },
] as const;
export type BriefingSection = (typeof BRIEFING_SECTIONS)[number]["key"];
const SECTION_KEYS: string[] = BRIEFING_SECTIONS.map((x) => x.key);
export type BriefingSettings = {
  on: boolean;
  /** 0 = Sunday ... 6 = Saturday. Monday by default. */
  day: number;
  /** Local hour it goes out (0-23). */
  hour: number;
  /** Team members who get it. Empty = every Owner, Admin and Pastor. */
  userIds: string[];
  email: boolean;
  sms: boolean;
  /** Extra sections included (all on by default). */
  sections: BriefingSection[];
  /** One-time launch notes, set by the platform owner (SQL), cleared after sending. */
  intro?: boolean;
  sample?: boolean;
};

export const DEFAULT_BRIEFING: BriefingSettings = { on: false, day: 1, hour: 7, userIds: [], email: true, sms: false, sections: BRIEFING_SECTIONS.map((x) => x.key) };

export function normalizeBriefing(raw: unknown): BriefingSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<BriefingSettings>;
  const int = (v: unknown, lo: number, hi: number, d: number) => {
    const n = Math.trunc(Number(v));
    return Number.isFinite(n) && n >= lo && n <= hi ? n : d;
  };
  return {
    on: r.on === true,
    day: int(r.day, 0, 6, DEFAULT_BRIEFING.day),
    hour: int(r.hour, 0, 23, DEFAULT_BRIEFING.hour),
    userIds: Array.isArray(r.userIds) ? r.userIds.filter((x): x is string => typeof x === "string").slice(0, 30) : [],
    email: r.email !== false,
    sms: r.sms === true,
    sections: Array.isArray(r.sections) ? (r.sections.filter((x) => SECTION_KEYS.includes(x)) as BriefingSection[]) : [...DEFAULT_BRIEFING.sections],
    ...(r.intro === true ? { intro: true } : {}),
    ...(r.sample === true ? { sample: true } : {}),
  };
}
