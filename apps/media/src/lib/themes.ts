/**
 * How slides look on the projector. One style per kind of slide (songs, Bible, announcements),
 * edited in Settings › Look & fonts. Sizes are in pixels on a 1920×1080 screen and scale with the real screen.
 */

export type ThemeKind = "song" | "scripture" | "announcement";

export interface SlideBackground {
  kind: "color" | "gradient" | "image" | "video";
  /** CSS colour or gradient for color/gradient, file path for image/video. */
  value: string;
  /** 0 – 0.9: darkens a picture or video so the words stay readable. */
  dim: number;
}

export interface SlideStyle {
  fontFamily: string;
  fontWeight: number;
  /** Largest size the words may have (px at 1080p). With shrinkToFit they get smaller only when needed. */
  fontSize: number;
  shrinkToFit: boolean;
  color: string;
  uppercase: boolean;
  italic: boolean;
  align: "left" | "center" | "right";
  position: "top" | "middle" | "bottom" | "lower-third";
  lineHeight: number;
  letterSpacing: number;
  shadow: "none" | "soft" | "strong";
  outlineWidth: number;
  outlineColor: string;
  /** Space around the words, as a share of the screen (0.02 – 0.2). */
  margin: number;
  background: SlideBackground;
  /** Bible reference / announcement message line. */
  sub: {
    show: boolean;
    size: number;
    color: string;
    position: "below" | "above";
    uppercase: boolean;
  };
}

export const FONTS: { value: string; label: string }[] = [
  { value: "'Segoe UI', system-ui, sans-serif", label: "Segoe UI (clean)" },
  { value: "Arial, Helvetica, sans-serif", label: "Arial" },
  { value: "'Arial Black', 'Arial', sans-serif", label: "Arial Black (heavy)" },
  { value: "Calibri, 'Segoe UI', sans-serif", label: "Calibri" },
  { value: "Bahnschrift, 'Segoe UI', sans-serif", label: "Bahnschrift (modern)" },
  { value: "Verdana, Geneva, sans-serif", label: "Verdana (wide, very readable)" },
  { value: "Tahoma, Verdana, sans-serif", label: "Tahoma" },
  { value: "'Trebuchet MS', sans-serif", label: "Trebuchet" },
  { value: "Impact, 'Arial Black', sans-serif", label: "Impact (poster)" },
  { value: "Georgia, 'Times New Roman', serif", label: "Georgia (classic)" },
  { value: "'Times New Roman', Times, serif", label: "Times New Roman" },
  { value: "Cambria, Georgia, serif", label: "Cambria" },
  { value: "'Palatino Linotype', 'Book Antiqua', serif", label: "Palatino (Bible style)" },
  { value: "'Book Antiqua', 'Palatino Linotype', serif", label: "Book Antiqua" },
  { value: "'Akan Times New Roman', 'Times New Roman', serif", label: "Akan Times New Roman (j = ɛ, c = ɔ)" },
];

export const GRADIENTS: { value: string; label: string }[] = [
  { value: "#000000", label: "Black" },
  { value: "linear-gradient(180deg, #000428 0%, #004e92 100%)", label: "Deep blue" },
  { value: "linear-gradient(135deg, #0f766e 0%, #134e4a 50%, #042f2e 100%)", label: "Teal" },
  { value: "linear-gradient(135deg, #1e1b4b 0%, #4c1d95 55%, #1e1b4b 100%)", label: "Royal purple" },
  { value: "linear-gradient(180deg, #1a0a00 0%, #3d2314 55%, #1a0a00 100%)", label: "Warm brown" },
  { value: "linear-gradient(180deg, #052e16 0%, #14532d 55%, #052e16 100%)", label: "Forest" },
  { value: "linear-gradient(135deg, #450a0a 0%, #7f1d1d 55%, #450a0a 100%)", label: "Crimson" },
  { value: "linear-gradient(135deg, #0c0c1d 0%, #1a1a2e 50%, #16213e 100%)", label: "Midnight" },
  { value: "#ffffff", label: "White" },
];

const base: SlideStyle = {
  fontFamily: FONTS[0].value,
  fontWeight: 700,
  fontSize: 96,
  shrinkToFit: true,
  color: "#ffffff",
  uppercase: false,
  italic: false,
  align: "center",
  position: "middle",
  lineHeight: 1.25,
  letterSpacing: 0,
  shadow: "strong",
  outlineWidth: 0,
  outlineColor: "#000000",
  margin: 0.06,
  background: { kind: "gradient", value: GRADIENTS[1].value, dim: 0.35 },
  sub: { show: true, size: 44, color: "#facc15", position: "below", uppercase: false },
};

export const DEFAULT_THEMES: Record<ThemeKind, SlideStyle> = {
  song: { ...base, fontSize: 104 },
  scripture: {
    ...base,
    fontFamily: FONTS[0].value,
    fontSize: 84,
    lineHeight: 1.3,
    background: { kind: "gradient", value: "#000000", dim: 0.35 },
    sub: { show: true, size: 46, color: "#facc15", position: "below", uppercase: false },
  },
  announcement: {
    ...base,
    fontSize: 110,
    background: { kind: "gradient", value: GRADIENTS[2].value, dim: 0.35 },
    sub: { show: true, size: 56, color: "#ffffff", position: "below", uppercase: false },
  },
};

export const THEME_LABELS: Record<ThemeKind, string> = {
  song: "Songs",
  scripture: "Bible verses",
  announcement: "Announcements & titles",
};

export function themeKindFor(slideType: string): ThemeKind {
  if (slideType === "song") return "song";
  if (slideType === "scripture") return "scripture";
  return "announcement";
}

export function textShadowFor(style: SlideStyle): string {
  if (style.shadow === "none") return "none";
  if (style.shadow === "soft") return "0 4px 18px rgba(0,0,0,0.55)";
  return "0 4px 6px rgba(0,0,0,0.85), 0 0 30px rgba(0,0,0,0.7)";
}

/** How one slide changes to the next on the projector. */
export type TransitionKind = "dissolve" | "cut" | "slide-up" | "push-left" | "zoom" | "fade-black";

export interface Transition {
  kind: TransitionKind;
  /** Length in milliseconds. */
  ms: number;
}

export const DEFAULT_TRANSITION: Transition = { kind: "dissolve", ms: 450 };

export const TRANSITIONS: { id: TransitionKind; label: string; detail: string }[] = [
  { id: "dissolve", label: "Dissolve", detail: "New words fade in over the old ones. The background stays still." },
  { id: "cut", label: "Cut", detail: "Changes instantly." },
  { id: "slide-up", label: "Slide up", detail: "New words rise gently into place." },
  { id: "zoom", label: "Zoom", detail: "New words settle in from slightly larger." },
  { id: "push-left", label: "Push", detail: "New slide comes in from the right." },
  { id: "fade-black", label: "Fade through black", detail: "Old slide fades out, then the new one fades in." },
];
