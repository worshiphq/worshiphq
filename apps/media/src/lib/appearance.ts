/** How the app itself looks: light, dark, or as Windows is set. Never the projector, stage or livestream words. */
export type Appearance = "light" | "dark" | "auto";
const KEY = "whq-appearance";
const system = window.matchMedia("(prefers-color-scheme: dark)");

export function appearance(): Appearance {
  try { const v = localStorage.getItem(KEY); if (v === "dark" || v === "auto") return v; } catch { /* ignore */ }
  return "light";
}
const apply = () => {
  const a = appearance();
  document.documentElement.dataset.theme = a === "dark" || (a === "auto" && system.matches) ? "dark" : "light";
};
export function setAppearance(v: Appearance) {
  try { localStorage.setItem(KEY, v); } catch { /* ignore */ }
  apply();
}
export function startAppearance() {
  apply();
  system.addEventListener("change", apply);
}
