/** Small, dependency-free hex colour helpers for theming. */

function clamp(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

export function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.trim().replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("");
}

/** Mix a hex colour with white by `amount` (0–1). */
export function mixWithWhite(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb;
  return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
}

/** Mix a hex colour with black by `amount` (0–1). */
export function mixWithBlack(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb;
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

/** Derive the primary/bright/soft theme triple from a single accent colour. */
export function themeFromAccent(accent: string) {
  return {
    primary: accent,
    bright: mixWithWhite(accent, 0.12),
    soft: mixWithWhite(accent, 0.9),
  };
}
