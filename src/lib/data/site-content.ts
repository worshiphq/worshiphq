import "server-only";
import { db } from "@/lib/db";
import { testimonials as defaultTestimonials, type Testimonial } from "@/config/marketing";
import { DEFAULT_STAT_SETTINGS, normalizeStatSettings, type StatSettings } from "@/lib/landing-stats-shared";

export const DEFAULT_HERO_SUBHEAD =
  "A face, palm or fingerprint device at your door checks every member in by name. WorshipHQ handles the rest: the texts, the giving, the follow-up and Monday's numbers.";

export interface MarketingContent {
  heroSubhead: string;
  testimonials: Testimonial[];
  /** The numbers on the landing page: shown or not, and the SuperAdmin's own figure if they typed one. */
  stats: StatSettings;
}

const FALLBACK: MarketingContent = {
  heroSubhead: DEFAULT_HERO_SUBHEAD,
  testimonials: defaultTestimonials,
  stats: DEFAULT_STAT_SETTINGS,
};

/**
 * Editable marketing content, with a safe fallback to the hardcoded defaults.
 * The SuperAdmin edits this from /admin; the marketing site reads it. If the
 * row is missing or the DB is unreachable, the site renders the defaults.
 */
export async function getMarketingContent(): Promise<MarketingContent> {
  try {
    const row = await db.siteContent.findUnique({ where: { key: "marketing" } });
    if (!row) return FALLBACK;
    const v = (row.value ?? {}) as Partial<MarketingContent>;
    // The old default subheading is replaced by the new one unless someone wrote their own.
    const OLD_DEFAULT = "Members, giving, attendance, events, messaging - one calm headquarters for everything your church runs.";
    const sub = v.heroSubhead?.trim();
    return {
      heroSubhead: sub && sub !== OLD_DEFAULT ? sub : FALLBACK.heroSubhead,
      stats: normalizeStatSettings(v.stats),
      testimonials:
        Array.isArray(v.testimonials) && v.testimonials.length > 0
          ? v.testimonials
          : FALLBACK.testimonials,
    };
  } catch {
    return FALLBACK;
  }
}

/** Save edited marketing content (SuperAdmin only - caller must authorize). */
export async function saveMarketingContent(content: MarketingContent): Promise<void> {
  await db.siteContent.upsert({
    where: { key: "marketing" },
    create: { key: "marketing", value: content as object },
    update: { value: content as object },
  });
}
