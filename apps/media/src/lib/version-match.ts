/** Finds a Bible on this computer from what someone said: "amplified", "N I V", "king james", "Twi", "Asante". */

interface PackLike { id: string; abbreviation: string; name: string; language: string }

/** Words Whisper may write for names it doesn't know, and other names people use. */
const SAID: Record<string, string> = {
  ashanti: "asante", asanti: "asante", twee: "twi", chwi: "twi", tree: "twi", akan: "twi", akuapim: "akuapem",
  amp: "amplified", "king james version": "king james", kjv: "kjv", message: "message", "good news": "good news",
};

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
