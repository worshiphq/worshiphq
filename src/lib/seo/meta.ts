import type { Metadata } from "next";
import { brand } from "@/config/brand";

/**
 * Metadata for one public page: title, description, canonical URL, and matching social-share tags.
 * A page that sets its own openGraph replaces the site-wide one, so this rebuilds it with the page's
 * own title and URL (the share image still comes from src/app/opengraph-image.tsx).
 */
export function pageMeta({ title, description, path, absoluteTitle }: {
  title: string;
  description: string;
  /** e.g. "/pricing". "/" for the home page. */
  path: string;
  /** Use the title as written, without the " · WorshipHQ" ending. */
  absoluteTitle?: boolean;
}): Metadata {
  const shareTitle = absoluteTitle ? title : `${title} · ${brand.shortName}`;
  // Named explicitly: once a page sets its own openGraph, Next stops adding the file-based image by itself.
  const images = [{ url: "/opengraph-image", width: 1200, height: 630, alt: `${brand.name} - church management software` }];
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: brand.name,
      locale: "en_GH",
      url: path,
      title: shareTitle,
      description,
      images,
    },
    twitter: { card: "summary_large_image", title: shareTitle, description, images },
  };
}
