/**
 * The name line at the start of a church's text messages. A church without its own approved sender name sends from
 * "WorshipHQ", and this line (the full church name, or a shorter name it chooses) is the first line of every message.
 * It counts toward the 160 characters in one text, so a long name can push a message into a second text and double the cost.
 */

export const MAX_MESSAGE_NAME = 30;
export const SAMPLE_MESSAGE = "Shalom! Join us this Sunday at 8am for our Celebration Service. God bless you!";

const FILLER = new Set(["the", "of", "and", "church", "chapel", "ministries", "ministry", "international", "inc", "ltd", "assembly", "congregation", "centre", "center"]);

/** One name line, tidied: single spaces, no line breaks, not too long. */
export function cleanMessageName(raw: unknown): string {
  return String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_MESSAGE_NAME);
}

/** A shorter version of the church's name that still reads well, for example "Grace Baptist" from "Grace Baptist Church - Theophany House". */
export function suggestShortName(churchName: string): string {
  const words = churchName
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^A-Za-z0-9']+/)
    .filter(Boolean);
  const meaningful = words.filter((w) => !FILLER.has(w.toLowerCase()));
  const pick = meaningful.length ? meaningful : words;
  let out = "";
  for (const w of pick) {
    const next = out ? `${out} ${w}` : w;
    if (next.length > 16) break;
    out = next;
  }
  return out || (pick[0] ?? churchName).slice(0, 16);
}

/** The line a church's texts will start with right now. */
export function currentNameLine(chosen: string | null | undefined, churchName: string): string {
  return cleanMessageName(chosen) || cleanMessageName(churchName) || "WorshipHQ";
}
