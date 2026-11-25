/** Points of a message announced in so many words: "Point number two, faith comes by hearing". Works without internet. */
const N = "(?:one|two|three|four|five|six|seven|eight|nine|ten|1[0-2]|[1-9])";
const ANNOUNCE = new RegExp(
  `^(?:(?:okay|ok|so|and|now|then|alright|please|church|my|the|our)\\s+)*(?:(?:point|number|lesson|key|principle|reason|step)\\s+(?:number\\s+)?${N}|(?:first|second|third|fourth|fifth|sixth|seventh|last|final|next)\\s+(?:point|lesson|key|principle|reason|step)|firstly|secondly|thirdly|fourthly|lastly)\\b(?:\\s+(?:is|says|that|i want you to (?:know|note)))*[\\s,.:;-]*`,
  "i",
);
const TITLE = /^(?:(?:and|so|now|today|this morning|this evening|tonight|church)[\s,]+)*(?:(?:my|our|the) (?:topic|theme|title|subject)(?: (?:for )?(?:today|this morning|this evening|tonight))?(?: of (?:the|my|our) (?:message|sermon))? is(?: titled| called)?|the title of (?:the|my|our|today's) (?:message|sermon) is|(?:i am|i'm|we are) (?:speaking|preaching|talking) on the (?:topic|theme|subject)(?: of)?)[\s,.:;-]*/i;
const WRITE = /^(?:(?:please|church|somebody|everybody|and|so|now)\s+)*(?:write (?:this|that|it) down|take note(?: of this)?|note this(?: down)?|put this down|this is (?:a |the )?point)\b[\s,.:;-]*(?:that\s+)?/i;

/** "next" = the announcement came on its own, so the point itself is the next sentence. */
export function localPoint(sentence: string, expecting: boolean): { point: string | null; next: boolean; kind: "title" | "point" } {
  const s = sentence.trim();
  const t = s.match(TITLE);
  const kind = t ? ("title" as const) : ("point" as const);
  const m = t ?? s.match(ANNOUNCE) ?? s.match(WRITE);
  if (!m && !expecting) return { point: null, next: false, kind };
  const rest = (m ? s.slice(m[0].length) : s).trim();
  const words = rest.split(/\s+/).filter(Boolean).length;
  if (t && words < 1) return { point: null, next: false, kind };
  if (m && !t && words < 2) return { point: null, next: true, kind };
  // Too long to be a point someone is dictating.
  if ((!t && words < 2) || words > (t ? 14 : 30)) return { point: null, next: false, kind };
  return { point: rest[0].toUpperCase() + rest.slice(1).replace(t ? /[\s,;:.]+$/ : /[\s,;:]+$/, ""), next: false, kind };
}

const ws = (t: string) => new Set(t.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, " ").split(/\s+/).filter((w) => w.length > 2));

/** The same point in nearly the same words (a verse label only matches itself). */
export function samePoint(a: string, b: string): boolean {
  if (a.trim().toLowerCase() === b.trim().toLowerCase()) return true;
  const x = ws(a), y = ws(b);
  if (x.size < 3 || y.size < 3) return false;
  let hits = 0;
  for (const w of x) if (y.has(w)) hits++;
  return hits / Math.min(x.size, y.size) >= 0.75;
}
