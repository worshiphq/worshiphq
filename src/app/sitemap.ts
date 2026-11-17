import type { MetadataRoute } from "next";
import { brand } from "@/config/brand";
import { DOC_ARTICLES } from "@/lib/docs";

type Freq = "weekly" | "monthly" | "yearly";

/** Every public page Google should index: the marketing site plus each user-manual article. No database reads. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const pages: { path: string; priority: number; changeFrequency: Freq }[] = [
    { path: "", priority: 1, changeFrequency: "weekly" },
    { path: "/devices", priority: 0.9, changeFrequency: "monthly" },
    { path: "/features", priority: 0.9, changeFrequency: "monthly" },
    { path: "/pricing", priority: 0.9, changeFrequency: "monthly" },
    { path: "/solutions", priority: 0.8, changeFrequency: "monthly" },
    { path: "/contact", priority: 0.7, changeFrequency: "yearly" },
    { path: "/about", priority: 0.6, changeFrequency: "yearly" },
    { path: "/docs", priority: 0.6, changeFrequency: "weekly" },
    { path: "/help", priority: 0.5, changeFrequency: "monthly" },
    { path: "/privacy", priority: 0.2, changeFrequency: "yearly" },
    { path: "/terms", priority: 0.2, changeFrequency: "yearly" },
    { path: "/refund-policy", priority: 0.2, changeFrequency: "yearly" },
  ];
  return [
    ...pages.map((p) => ({ url: `${brand.url}${p.path}`, lastModified: now, changeFrequency: p.changeFrequency, priority: p.priority })),
    ...DOC_ARTICLES.map((a) => ({ url: `${brand.url}/docs/${a.slug}`, lastModified: now, changeFrequency: "monthly" as Freq, priority: 0.4 })),
  ];
}
