/** Turns a stored media path into something an <img>/<video> can load. */
export function mediaUrl(src: string): string {
  if (/^(blob:|data:|https?:|asset:)/.test(src)) return src;
  const internals = (window as any).__TAURI_INTERNALS__;
  if (internals?.convertFileSrc) return internals.convertFileSrc(src, "asset");
  return src;
}

export const isDesktopApp = () => typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;

export function formatBytes(n: number): string {
  if (!n) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
