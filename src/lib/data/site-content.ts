import "server-only";
import { db } from "@/lib/db";
import { testimonials as defaultTestimonials, type Testimonial } from "@/config/marketing";

export const DEFAULT_HERO_SUBHEAD =
  "Members, giving, attendance, events, messaging — one calm headquarters for everything your church runs.";

export interface MarketingContent {
  heroSubhead: string;
  testimonials: Testimonial[];
}

const FALLBACK: MarketingContent = {
  heroSubhead: DEFAULT_HERO_SUBHEAD,
  testimonials: defaultTestimonials,
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
    return {
      heroSubhead: v.heroSubhead?.trim() || FALLBACK.heroSubhead,
      testimonials:
        Array.isArray(v.testimonials) && v.testimonials.length > 0
          ? v.testimonials
          : FALLBACK.testimonials,
    };
  } catch {
    return FALLBACK;
  }
}

/** Save edited marketing content (SuperAdmin only — caller must authorize). */
export async function saveMarketingContent(content: MarketingContent): Promise<void> {
  await db.siteContent.upsert({
    where: { key: "marketing" },
    create: { key: "marketing", value: content as object },
    update: { value: content as object },
  });
}
