/** Monday briefing settings (client-safe). Stored as Church.briefing JSON. */
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
};

export const DEFAULT_BRIEFING: BriefingSettings = { on: false, day: 1, hour: 7, userIds: [], email: true, sms: false };

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
  };
}
