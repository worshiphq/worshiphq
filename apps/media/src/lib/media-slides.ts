import type { ServiceItem, Slide } from "../types";
import type { MediaItem } from "../stores/media-store";

export interface MediaOptions {
  fit: "cover" | "contain";
  loop: boolean;
  sound: boolean;
}

export const defaultMediaOptions = (item: MediaItem): MediaOptions => ({
  fit: item.kind === "image" ? "contain" : "cover",
  loop: false,
  sound: true,
});

export function buildMediaSlide(item: MediaItem, o: MediaOptions): Slide {
  return {
    type: "media",
    label: item.name,
    content: { primaryText: "" },
    template: { background: "#000", textLayout: "center" },
    media: { kind: item.kind === "video" ? "video" : "image", src: item.path, fit: o.fit, loop: o.loop, muted: !o.sound },
  };
}

export function mediaToServiceItem(item: MediaItem, o: MediaOptions): ServiceItem {
  return {
    id: crypto.randomUUID(),
    type: "media",
    title: item.name,
    subtitle: item.kind === "video" ? "Video" : "Picture",
    order: 0,
    slides: [buildMediaSlide(item, o)],
  };
}

/** Play / pause / restart the video on the projector (desktop app). */
export async function controlVideo(action: "play" | "pause" | "restart") {
  if (!(window as any).__TAURI_INTERNALS__) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("media_control", { action }).catch(() => {});
}

import type { Presentation } from "../stores/media-store";

export function presentationSlides(p: Presentation): Slide[] {
  return p.slides.map((src, i) => ({
    type: "media" as const,
    label: `${p.name} · ${i + 1}`,
    content: { primaryText: "" },
    template: { background: "#000", textLayout: "center" as const },
    media: { kind: "image" as const, src, fit: "contain" as const },
  }));
}

export function presentationToServiceItem(p: Presentation): ServiceItem {
  return { id: crypto.randomUUID(), type: "media", title: p.name, subtitle: `Presentation · ${p.slides.length} slides`, order: 0, slides: presentationSlides(p) };
}
