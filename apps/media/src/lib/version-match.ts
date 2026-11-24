/** Finds a Bible on this computer from what someone said: "amplified", "N I V", "king james", "Twi", "Asante". */

interface PackLike { id: string; abbreviation: string; name: string; language: string }

/** Words Whisper may write for names it doesn't know, and other names people use. */
const SAID: Record<string, string> = {
  ashanti: "asante", asanti: "asante", twee: "twi", chwi: "twi", tree: "twi", akan: "twi", akuapim: "akuapem",
  amp: "amplified", "king james version": "king james", kjv: "kjv", message: "message", "good news": "good news",
};

/** "…give me the King James version of Mark 2 verse 10": the version asked for inside a longer sentence. */
const NAMED = "new king james|king james|amplified classic|amplified|new living|good news|contemporary english|the message|message|english standard|new american standard|new international|revised standard|asante twi|ashanti twi|akuapem twi|akuapim twi|asante|akuapem|twi|fante|ewe|ga|nkjv|kjv|niv|nlt|esv|nasb|asv|amp|msg|gnb|cev|tpt|csb";
export function versionAsked(text: string): string | null {
  const t = text.toLowerCase().replace(/\b([a-z]) (?=[a-z]\b)/g, "$1").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ");
  const a = t.match(new RegExp(`\\b(${NAMED}) (?:version|translation|bible)\\b`));
  if (a) return a[1];
  const b = t.match(new RegExp(`\\b(?:in|from|use|using|with)(?: the)? (${NAMED})\\b`));
  if (b) return b[1];
  // Initials are only ever a version.
  return t.match(/\b(nkjv|kjv|niv|nlt|esv|nasb)\b/)?.[1] ?? null;
}

const noise = /\b(?:the|version|bible|translation|please)\b/g;

export function findPack<T extends PackLike>(spoken: string, packs: T[]): T | null {
  let q = spoken.toLowerCase().replace(/[.,!?]/g, " ").replace(noise, " ").replace(/\s+/g, " ").trim();
  if (!q) return null;
  q = SAID[q] ?? q.split(" ").map((w) => SAID[w] ?? w).join(" ");
  const letters = q.replace(/[^a-z0-9]/g, "");
  let best: { pack: T; score: number } | null = null;
  for (const p of packs) {
    const abbr = p.abbreviation.toLowerCase().replace(/[^a-z0-9]/g, "");
    const name = p.name.toLowerCase().replace(/[—–-]/g, " ").replace(noise, " ").replace(/\s+/g, " ").trim();
    const lang = p.language.toLowerCase();
    let score = 0;
    if (letters && letters === abbr) score = 100;
    else if (` ${name} `.includes(` ${q} `)) score = 70 - name.length / 10; // "king james" prefers King James over New King James
    else if (lang === q || lang.startsWith(q + " ") || lang.includes(`(${q})`)) score = 55;
    else {
      const words = q.split(" ").filter((w) => w.length > 1);
      if (words.length && words.every((w) => name.includes(w) || lang.includes(w))) score = 40 - name.length / 10;
    }
    if (score > 0 && p.id.startsWith("ew-")) score -= 0.01; // same Bible twice: prefer the built-in one
    if (score > 0 && (!best || score > best.score)) best = { pack: p, score };
  }
  return best?.pack ?? null;
}
