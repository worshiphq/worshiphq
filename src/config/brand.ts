/**
 * WorshipHQ — central brand configuration.
 *
 * This is the single source of truth for every brand string in the product.
 * To rebrand, change values here and the whole app (marketing site, app shell,
 * metadata, footer, emails) updates. Keep secrets OUT of this file — they live
 * in environment variables (see src/lib/env.ts).
 */

export const brand = {
  /** Wordmark shown in the nav/logo. "HQ" is visually emphasized in the logo component. */
  name: "WorshipHQ",
  nameParts: { lead: "Worship", accent: "HQ" },

  /** Full product name — used in <title>, meta description, footer, app listings. */
  productName: "WorshipHQ — Church Management System",
  productNameShort: "WorshipHQ — Church MS",

  /** Spoken / everyday brand. */
  shortName: "WorshipHQ",

  tagline: "Your church's command center.",
  supportingLine:
    "Everything your church needs to manage, connect, and grow — in one beautiful place.",
  description:
    "WorshipHQ is the all-in-one church management system built for churches in Ghana and across Africa. Manage people, giving, events, communications and more — beautifully.",

  domain: "worshiphq.org",
  url: "https://worshiphq.org",

  email: {
    support: "support@worshiphq.org",
    sales: "sales@worshiphq.org",
    noReply: "no-reply@worshiphq.org",
  },

  /** Optional parent-company line for the footer. Leave empty to hide. */
  parentCompany: "", // e.g. "WorshipHQ is a product of Acme Labs."

  region: {
    country: "Ghana",
    flag: "🇬🇭",
    currency: "GHS",
    currencySymbol: "₵",
    locale: "en-GH",
  },

  socials: [
    { label: "X (Twitter)", href: "https://x.com/worshiphq", icon: "twitter" },
    { label: "Instagram", href: "https://instagram.com/worshiphq", icon: "instagram" },
    { label: "Facebook", href: "https://facebook.com/worshiphq", icon: "facebook" },
    { label: "LinkedIn", href: "https://linkedin.com/company/worshiphq", icon: "linkedin" },
  ],
} as const;

/** Format a number as Ghana Cedi (₵). */
export function formatCurrency(amount: number, opts?: { decimals?: boolean }): string {
  const decimals = opts?.decimals ?? false;
  return `${brand.region.currencySymbol}${amount.toLocaleString("en-GH", {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  })}`;
}

export type Brand = typeof brand;
