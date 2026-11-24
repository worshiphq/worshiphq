import { normalisePhone } from "@/lib/phone";

/**
 * What a saved phone number is, as far as a WorshipHQ text is concerned:
 *   ghana   can be texted
 *   abroad  outside Ghana, so the message is emailed instead
 *   wrong   does not look like a real number
 *   none    no number saved
 */
export type PhoneKind = "ghana" | "abroad" | "wrong" | "none";

export function phoneKind(raw: string | null | undefined): PhoneKind {
  if (!raw?.trim()) return "none";
  const p = normalisePhone(raw);
  if (p.startsWith("233")) return /^233[2-5]\d{8}$/.test(p) ? "ghana" : "wrong";
  return p.length >= 9 && p.length <= 15 && !p.startsWith("0") ? "abroad" : "wrong";
}

export const PHONE_KIND_LABEL: Record<PhoneKind, string> = {
  ghana: "Ghana number",
  abroad: "Outside Ghana",
  wrong: "Number looks wrong",
  none: "No phone number",
};
