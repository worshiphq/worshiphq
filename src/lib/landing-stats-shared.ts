/** Client-safe parts of the landing page numbers (no database). The database read is in lib/data/landing-stats. */

/**
 * Numbers for the landing page. By default they are read from the database and rounded DOWN to a clean figure with a
 * plus (271 churches shows as "270+"). The SuperAdmin can switch any of them off, or type a figure of their own, in
 * SuperAdmin, Content. The page is rebuilt at most once an hour, so this runs about 24 times a day, never per visitor.
 */
export const STAT_KEYS = ["churches", "countries", "members", "giving", "checkIns"] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export const STAT_LABELS: Record<StatKey, string> = {
  churches: "Churches on WorshipHQ",
  countries: "Countries",
  members: "Members recorded",
  giving: "Giving recorded (GHS)",
  checkIns: "Check-ins recorded",
};

/**
 * What the SuperAdmin chose for one number. override null = the live figure. When they type their own figure, the
 * real figure at that moment is kept in realAtSet, and the number then grows with every real addition after it
 * (300 typed when there were 271, then 5 more churches join: 305). It never shows less than the real figure.
 */
export type StatSetting = { show: boolean; override: number | null; realAtSet?: number | null };
export type StatSettings = Record<StatKey, StatSetting>;

export const DEFAULT_STAT_SETTINGS: StatSettings = {
  churches: { show: true, override: null },
  countries: { show: true, override: null },
  members: { show: false, override: null },
  giving: { show: false, override: null },
  checkIns: { show: true, override: null },
};

export function normalizeStatSettings(raw: unknown): StatSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<StatKey, Partial<StatSetting>>>;
  const out = { ...DEFAULT_STAT_SETTINGS };
  for (const k of STAT_KEYS) {
    const v = r[k];
    if (!v) continue;
    const o = Number(v.override);
    const base = Number(v.realAtSet);
    out[k] = {
      show: typeof v.show === "boolean" ? v.show : DEFAULT_STAT_SETTINGS[k].show,
      override: v.override != null && Number.isFinite(o) && o >= 0 ? Math.round(o) : null,
      realAtSet: v.realAtSet != null && Number.isFinite(base) ? Math.round(base) : null,
    };
  }
  return out;
}

/** Round down to a clean figure: 271 -> 270, 1,465 -> 1,400, 30,425 -> 30,000. */
export function niceFloor(n: number): number {
  if (n < 10) return n;
  const step = n < 1000 ? 10 : n < 10000 ? 100 : n < 100000 ? 1000 : 10000;
  return Math.floor(n / step) * step;
}

export type RealStats = Record<StatKey, number>;

/** What a number shows right now, for the SuperAdmin editor. */
export function shownValue(k: StatKey, real: RealStats, s: StatSetting): number {
  return s.override == null ? niceFloor(real[k]) : Math.max(real[k], s.override + Math.max(0, real[k] - (s.realAtSet ?? real[k])));
}


export type LandingStat = { key: StatKey; label: string; value: number; plus: boolean; prefix?: string };

/** The numbers to show, in order: the SuperAdmin's figure where one is typed, otherwise the real one rounded down. */
export function landingStats(real: RealStats, settings: StatSettings): LandingStat[] {
  return STAT_KEYS.filter((k) => settings[k].show).map((k) => {
    const s = settings[k];
    // The SuperAdmin's figure plus everything real that came in after they typed it, never below the real figure.
    const own = s.override == null ? null : Math.max(real[k], s.override + Math.max(0, real[k] - (s.realAtSet ?? real[k])));
    const value = own ?? niceFloor(real[k]);
    return { key: k, label: STAT_LABELS[k].replace(" (GHS)", ""), value, plus: own == null ? value < real[k] || real[k] >= 10 : true, prefix: k === "giving" ? "GHS " : undefined };
  }).filter((s) => s.value > 0);
}
