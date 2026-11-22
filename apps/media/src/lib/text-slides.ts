import type { ServiceItem, Slide } from "../types";
import { DEFAULT_TEMPLATES, applyTemplate } from "./slide-templates";

export type TextSlideKind = "announcement" | "title";

/** An announcement ("Youth camp registration closes Sunday") or a title slide ("Sermon: Walking in Faith"). */
export function buildTextItem(kind: TextSlideKind, heading: string, message: string): ServiceItem {
  const templateId = kind === "title" ? "sunrise-gold" : "modern-gradient";
  const template = DEFAULT_TEMPLATES.find((t) => t.id === templateId) ?? DEFAULT_TEMPLATES[0];
  const h = heading.trim();
  const m = message.trim();

  const slide: Slide = applyTemplate(template, {
    primaryText: h || m,
    secondaryText: h && m ? m : undefined,
  });
  slide.type = kind === "title" ? "custom" : "announcement";
  slide.template.textLayout = "center";
  slide.template.fontSize = kind === "title" ? 72 : h && m ? 64 : (m.length > 160 ? 44 : 54);
  slide.label = kind === "title" ? "Title" : "Announcement";

  return {
    id: crypto.randomUUID(),
    type: kind === "title" ? "custom" : "announcement",
    title: h || m.slice(0, 60) || (kind === "title" ? "Title slide" : "Announcement"),
    subtitle: kind === "title" ? "Title slide" : "Announcement",
    order: 0,
    slides: [slide],
  };
}

/** Suggested length when nobody has set one. */
export function defaultMinutes(item: ServiceItem): number {
  switch (item.type) {
    case "song": return 5;
    case "scripture": return Math.max(2, Math.ceil((item.slides?.length ?? 1) * 1.5));
    case "media": return 2;
    case "announcement": return 3;
    default: return 2;
  }
}

export const itemMinutes = (item: ServiceItem) => item.minutes ?? defaultMinutes(item);
