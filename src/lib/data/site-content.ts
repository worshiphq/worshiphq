import "server-only";
import { db } from "@/lib/db";
import { testimonials as defaultTestimonials, type Testimonial } from "@/config/marketing";
import { DEFAULT_STAT_SETTINGS, normalizeStatSettings, type StatSettings } from "@/lib/landing-stats-shared";

export const DEFAULT_HERO_SUBHEAD =
  "Members, giving, attendance, events, messaging - one calm headquarters for everything your church runs.";

export interface MarketingContent {
  heroSubhead: string;
  testimonials: Testimonial[];
  /** The numbers on the landing page: shown or not, and the SuperAdmin's own figure if they typed one. */
  stats: StatSettings;
  /** The WhatsApp / call number on the public Contact page. Empty = the line is not shown. Edited in SuperAdmin, Content. */
  contactPhone: string;
}

/** The number the owner asked to show on the Contact page (13 Nov 2026). SuperAdmin can change or clear it. */
export const DEFAULT_CONTACT_PHONE = "055 239 9981";

const FALLBACK: MarketingContent = {
  heroSubhead: DEFAULT_HERO_SUBHEAD,
  testimonials: defaultTestimonials,
  stats: DEFAULT_STAT_SETTINGS,
  contactPhone: DEFAULT_CONTACT_PHONE,
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
      stats: normalizeStatSettings(v.stats),
      // Saved empty on purpose = hidden. Never saved = the default number.
      contactPhone: typeof v.contactPhone === "string" ? v.contactPhone.trim() : FALLBACK.contactPhone,
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
