/** The colour of a song part, so a chorus or bridge is found at a glance. Null = not a song part. */
export function partColor(label?: string): string | null {
  const l = (label ?? "").toLowerCase();
  if (/^pre[- ]?chorus/.test(l)) return "#db2777";
  if (/^(chorus|refrain|hook)/.test(l)) return "#dc2626";
  if (/^verse/.test(l)) return "#2563eb";
  if (/^(bridge|vamp)/.test(l)) return "#9333ea";
  if (/^(tag|ending|outro|coda)/.test(l)) return "#b45309";
  if (/^(intro|interlude|instrumental)/.test(l)) return "#4d7c0f";
  return null;
}
