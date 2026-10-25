/** Make text safe to drop into an HTML email: <, >, &, quotes become entities. */
export function escapeHtml(text: unknown): string {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escaped text with its line breaks kept, for a plain message shown in an email. */
export function textToHtml(text: unknown): string {
  return escapeHtml(text).replace(/\r?\n/g, "<br>");
}
