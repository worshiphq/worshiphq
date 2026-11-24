import { currentNameLine } from "@/lib/sms/message-name";

/**
 * What the name on an SMS record is:
 *   id      the church's own approved sender ID: the text arrives FROM this name
 *   prefix  the text arrives from WorshipHQ's sender, and this name is the first line of the message
 *   null    cannot be told (an old record from before the church changed its names)
 */
export type SenderKind = "id" | "prefix" | null;

type ChurchNames = { name: string; smsSenderId: string | null; smsSenderIdStatus: string | null; smsPrefix: string | null };

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function senderKind(senderName: string | null, church: ChurchNames): SenderKind {
  if (!senderName) return null;
  if (church.smsSenderId && church.smsSenderIdStatus === "approved" && same(senderName, church.smsSenderId)) return "id";
  // Sender IDs are 3 to 11 letters and numbers, so anything with a space or longer is the name line.
  if (same(senderName, currentNameLine(church.smsPrefix, church.name)) || !/^[a-z0-9]{3,11}$/i.test(senderName.trim())) return "prefix";
  return null;
}

/** With its own sender ID, numbers outside Ghana still get WorshipHQ's sender with the church's name first. */
export function hasPrefixedNumbers(kind: SenderKind, numbers: { to: string }[]): boolean {
  return kind === "id" && numbers.some((n) => /^\d{9,15}$/.test(n.to) && !n.to.startsWith("233") && !n.to.startsWith("0"));
}
