/** A church's age bands. Client-safe (no database here). */
export type AgeConfig = {
  childMax: number;
  teenMax: number;
  youthOn: boolean;
  youthMax: number;
  youthLabel: string;
  autoOn: boolean;
};

export const DEFAULT_AGE_CONFIG: AgeConfig = { childMax: 12, teenMax: 17, youthOn: false, youthMax: 35, youthLabel: "Youth", autoOn: false };

export type StoredAgeGroup = "child" | "teen" | "adult";

/** Whole years old today, or null when there is no date of birth. */
export function ageOf(dob: Date | string | null | undefined, now = new Date()): number | null {
  if (!dob) return null;
  const d = typeof dob === "string" ? new Date(dob) : dob;
  if (isNaN(d.getTime())) return null;
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

/** The stored group (child, teen or adult) a person of this age belongs in. */
export function groupForAge(age: number, cfg: Pick<AgeConfig, "childMax" | "teenMax">): StoredAgeGroup {
  if (age <= cfg.childMax) return "child";
  if (age <= cfg.teenMax) return "teen";
  return "adult";
}

/** Is this adult in the church's youth band? (Youth is a label among the adults, worked out from the date of birth.) */
export function isYouthAge(age: number | null, cfg: AgeConfig): boolean {
  return cfg.youthOn && age !== null && age > cfg.teenMax && age <= cfg.youthMax;
}

/** Clean up what an admin typed so the bands always make sense (children < teens < youth). */
export function normaliseAgeConfig(input: Partial<AgeConfig>): AgeConfig {
  const childMax = clamp(input.childMax, 1, 17, DEFAULT_AGE_CONFIG.childMax);
  const teenMax = clamp(input.teenMax, childMax + 1, 25, Math.max(childMax + 1, DEFAULT_AGE_CONFIG.teenMax));
  const youthMax = clamp(input.youthMax, teenMax + 1, 60, Math.max(teenMax + 1, DEFAULT_AGE_CONFIG.youthMax));
  return {
    childMax, teenMax, youthMax,
    youthOn: !!input.youthOn,
    youthLabel: String(input.youthLabel ?? DEFAULT_AGE_CONFIG.youthLabel).trim().slice(0, 30) || DEFAULT_AGE_CONFIG.youthLabel,
    autoOn: !!input.autoOn,
  };
}

function clamp(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
