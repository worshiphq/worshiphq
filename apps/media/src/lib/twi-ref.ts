import { CHAPTER_COUNTS, type ScriptureRef } from "./scripture-ref";

/**
 * Bible references said in Twi (Asante or Akuapem), or Twi mixed with English: "Yohane ti baako nkyekyɛmu du" is
 * John 1:10. Speech models spell Twi loosely, so names and numbers are compared by sound, but only inside a phrase
 * that is clearly a reference.
 */

/** The same word however it was written: ɛ/e, ɔ/o, double letters, j/y, ch/ky… */
function sound(w: string): string {
  return w.toLowerCase()
    .replace(/[ɛèéê]/g, "e").replace(/[ɔòóô]/g, "o").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .replace(/ph/g, "f").replace(/ch|ky|tch|tw(?=i)/g, "k").replace(/gy|dj|dw(?=[ie])/g, "j").replace(/^j/g, "y").replace(/c|q/g, "k").replace(/sh|z/g, "s")
    .replace(/([a-z])\1+/g, "$1");
}

/** How far apart two words are (letters changed, added or lost). */
function apart(a: string, b: string, most: number): number {
  if (Math.abs(a.length - b.length) > most) return most + 1;
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}
const near = (w: string, target: string) => {
  const most = target.length >= 9 ? 2 : target.length >= 5 ? 1 : 0;
  return apart(w, target, most) <= most;
};

/* ───────────── Numbers ───────────── */

const ONES: Record<number, string> = {
  1: "baako biako bako koro", 2: "mmienu abien mienu ebien mmeenu meenu", 3: "mmiensa abiesa miensa ebiesa mmeensa mensa", 4: "nan anan enan ennan", 5: "num enum anum ennum",
  6: "nsia asia esia", 7: "nson ason eson", 8: "nwotwe awotwe nwotwie", 9: "nkron akron ekron",
};
const TENS: Record<number, string> = {
  10: "du edu", 20: "aduonu eduonu aduono", 30: "aduasa eduasa", 40: "aduanan eduanan", 50: "aduonum eduonum", 60: "aduosia eduosia", 70: "aduoson eduoson", 80: "aduowotwe eduowotwe", 90: "aduokron eduokron",
};
const EN: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const ONE = new Map<string, number>(), TEN = new Map<string, number>(), WHOLE = new Map<string, number>();
for (const [n, ws] of Object.entries(ONES)) for (const w of ws.split(" ")) ONE.set(sound(w), +n);
for (const [n, ws] of Object.entries(TENS)) for (const w of ws.split(" ")) TEN.set(sound(w), +n);
for (const [w, n] of Object.entries(EN)) (n >= 20 ? TEN : n === 10 || n > 10 ? WHOLE : ONE).set(sound(w), n);
// Said and written as one word: "dubaako" 11, "aduonummiɛnsa" 23.
for (const [t, tn] of [...TEN]) for (const [o, on] of [...ONE]) WHOLE.set(sound(t + o), tn + on);
const HUNDRED = new Set(["oha", "ha", "hundred"].map(sound));

/** Nearest word of a list: exact, else one letter different for longer words (only when nothing else is as near). */
function pick(map: Map<string, number>, w: string): number | null {
  const exact = map.get(w);
  if (exact !== undefined) return exact;
  if (w.length < 5) return null;
  const hits = new Set<number>();
  for (const [k, n] of map) if (k.length >= 5 && apart(w, k, 1) <= 1) hits.add(n);
  return hits.size === 1 ? [...hits][0] : null;
}

function number(t: string[], i: number): { n: number; next: number } | null {
  if (/^\d{1,3}$/.test(t[i] ?? "")) return { n: +t[i], next: i + 1 };
  if (!t[i]) return null;
  if (HUNDRED.has(t[i]) || (pick(ONE, t[i]) === 1 && HUNDRED.has(t[i + 1] ?? ""))) {
    let j = HUNDRED.has(t[i]) ? i + 1 : i + 2;
    if (["ne", "na", "and"].includes(t[j])) j++;
    const rest = number(t, j);
    return rest && rest.n < 100 ? { n: 100 + rest.n, next: rest.next } : { n: 100, next: HUNDRED.has(t[i]) ? i + 1 : i + 2 };
  }
  // Exact spellings of any kind first, then near ones.
  const exact = WHOLE.has(t[i]) || TEN.has(t[i]) || ONE.has(t[i]);
  const read = (m: Map<string, number>, w: string) => (exact ? m.get(w) ?? null : pick(m, w));
  const whole = TEN.has(t[i]) ? null : read(WHOLE, t[i]);
  const near10 = exact ? null : pick(TEN, t[i]);
  if (near10 === null && whole !== null) return { n: whole, next: i + 1 };
  const ten = read(TEN, t[i]);
  if (ten !== null) {
    const one = t[i + 1] ? pick(ONE, t[i + 1]) : null;
    return one !== null ? { n: ten + one, next: i + 2 } : { n: ten, next: i + 1 };
  }
  const one = read(ONE, t[i]);
  return one !== null ? { n: one, next: i + 1 } : null;
}

/* ───────────── Books ───────────── */

/** Book → names, with the number before numbered books ("1 korintofo"). Both spellings, and the English ones. */
const NAMES: [number, string][] = [
  [0, "genesis"], [1, "eksodos exodus"], [2, "lewitiko leviticus"], [3, "numeri numbers"], [4, "deuteronomium deuteronomy"], [5, "yosua joshua"], [6, "atemmufo atemmufoo atemmufuo judges"], [7, "rut ruth"],
  [8, "1samuel"], [9, "2samuel"], [10, "1ahemfo 1ahenfo 1kings"], [11, "2ahemfo 2ahenfo 2kings"], [12, "1beresosem 1chronicles"], [13, "2beresosem 2chronicles"],
  [14, "esra ezra"], [15, "nehemia nehemiah"], [16, "ester esther"], [17, "hiob yob job"], [18, "nnwom ndwom dwom nwom psalm psalms"], [19, "mmebusem mmebusem mebusem proverbs"],
  [20, "osenkafo osenkafoo ecclesiastes"], [22, "yesaia yesaya isaiah"], [23, "yeremia yeremaya jeremiah"], [24, "kwadwom lamentations"], [25, "hesekiel ezekiel"], [26, "daniel"], [27, "hosea"], [28, "yoel joel"], [29, "amos"],
  [30, "obadia obadiah"], [31, "yona jonah"], [32, "mika micah"], [33, "nahum"], [34, "habakuk habakkuk"], [35, "sefania zephaniah"], [36, "hagai haggai"], [37, "sakaria zechariah"], [38, "malaki malachi"],
  [39, "mateo mateu matthew"], [40, "marko mark"], [41, "luka luke"], [42, "yohane yoane yohanes yohani john"], [43, "asomafo asomafoo acts"], [44, "romafo romafoo romanfo romans roman"],
  [45, "1korintofo 1korintofoo 1corinthians"], [46, "2korintofo 2korintofoo 2corinthians"], [47, "galatifo galatifoo galatians"], [48, "efesofo efesofoo ephesians"], [49, "filipifo filipifoo philippians"], [50, "kolosefo kolosefoo colossians"],
  [51, "1tesalonikafo 1tesalonikafoo 1thessalonians"], [52, "2tesalonikafo 2tesalonikafoo 2thessalonians"], [53, "1timoteo 1timothy"], [54, "2timoteo 2timothy"], [55, "tito titus"], [56, "filemon philemon"],
  [57, "hebrifo hebrifoo hebrewfo hebrews hebrew"], [58, "yakobo james"], [59, "1petro 1peter"], [60, "2petro 2peter"], [61, "1yohane 1john"], [62, "2yohane 2john"], [63, "3yohane 3john"], [64, "yuda jude"], [65, "adiyisem adiyesem revelation revelations"],
];
const MOSE = [0, 1, 2, 3, 4];
const PLAIN = new Map<string, number>(), NUMBERED = new Map<string, number[]>();
for (const [b, ws] of NAMES) for (const w of ws.split(" ")) {
  const m = w.match(/^([123])(.+)$/);
  if (!m) { PLAIN.set(sound(w), b); continue; }
  const k = sound(m[2]);
  const list = NUMBERED.get(k) ?? [];
  list[+m[1]] = b;
  NUMBERED.set(k, list);
}
NUMBERED.set(sound("mose"), [NaN, ...MOSE]);
// John is a gospel and three letters.
const find = <T,>(map: Map<string, T>, w: string): T | null => {
  const e = map.get(w);
  if (e !== undefined) return e;
  if (w.length < 5) return null;
  for (const [k, v] of map) if (k.length >= 5 && k[0] === w[0] && near(w, k)) return v;
  return null;
};

/* ───────────── The phrase ───────────── */

const CHAPTER = new Set(["ti", "tiri", "tire", "etire", "eti", "etiri", "tiremu", "chapter", "kapter", "kyapta"].map(sound));
const FILL = new Set(["a", "eto", "to", "so", "no", "mu", "ne", "na", "wo", "eye", "ye", "edi", "di", "nwoma", "krataa", "nhoma", "eho", "the", "and", "from", "firi", "fi", "fri"].map(sound));
const TO = new Set(["kosi", "kopem", "kodu", "besi", "to", "through", "kosii", "akosi"].map(sound));
const isVerse = (w: string) => w === "verse" || w === "verses" || w === sound("verse") || w === sound("verses") || (w.length >= 5 && /^[aenm]{0,2}k/.test(w) && apart(w, sound("nkyekyemu"), 2) <= 2);
const isChapter = (w: string) => CHAPTER.has(w);

export interface TwiRef { ref: ScriptureRef; after: string; wordsAfter: number }

/** The last reference said in Twi (or Twi and English), and what was said after it. */
export function twiReferenceAt(text: string): TwiRef | null {
  // "n kyekyemu" and "nkye kyemu" are one word.
  const words = text.replace(/\bn[- ]?ky[eɛ][- ]?ky[eɛ]m(?:u)?\b/gi, "nkyekyemu").split(/[^\p{L}\p{N}̀-ͯ]+/u).filter(Boolean);
  const t = words.map(sound);
  let found: TwiRef | null = null;

  for (let i = 0; i < t.length; i++) {
    const numbered = find(NUMBERED, t[i]), plain = find(PLAIN, t[i]);
    if (numbered === null && plain === null) continue;
    const exact = PLAIN.has(t[i]) || NUMBERED.has(t[i]);
    let j = i + 1;
    // Which one: said before ("1 Korintofo", "baako Petro") or after ("Korintofo a edi kan", "a ɛtɔ so mmienu").
    let which: number | null = null;
    if (numbered !== null) {
      const before = i > 0 ? number(t, i - 1) : null;
      if (before && before.next === i && before.n >= 1 && before.n <= 5) which = before.n;
      else if (i > 0 && /^(first|second|third)$/.test(words[i - 1].toLowerCase())) which = { first: 1, second: 2, third: 3 }[words[i - 1].toLowerCase() as "first"]!;
      let k = j;
      if (t[k] === "a") k++;
      if ((t[k] === "edi" || t[k] === "di" || t[k] === "odi") && t[k + 1] === "kan") { which = 1; j = k + 2; }
      else if ((t[k] === "eto" || t[k] === "oto" || t[k] === "to") && t[k + 1] === "so") {
        const n = number(t, k + 2);
        if (n && n.n <= 5) { which = n.n; j = n.next; }
      }
    }
    const book = which !== null && numbered ? numbered[which] ?? null : plain;
    if (book === null || Number.isNaN(book)) continue;
    if (t[j] === sound("nnwuma") || (book === 43 && near(t[j] ?? "", sound("nnwuma")))) j++; // Asomafo Nnwuma

    // Chapter: "ti baako", "ti a ɛtɔ so mmiɛnsa", "chapter three", or just the number.
    const skip = (k: number, most: number) => { let n = 0; while (n < most && k < t.length && FILL.has(t[k]) && !number(t, k)) { k++; n++; } return k; };
    let k = skip(j, 2);
    const saidTi = isChapter(t[k] ?? "");
    if (saidTi) k = skip(k + 1, 4);
    const ch = number(t, k);
    if (!ch || (!saidTi && k - j > 1)) continue;

    // Verse: "nkyekyɛmu du", up to a few words later.
    let v = ch.next, verse: { n: number; next: number } | null = null, saidVerse = false;
    for (let look = 0; look < 7 && v + look < t.length; look++) {
      if (isVerse(t[v + look])) { const at = skip(v + look + 1, 4); verse = number(t, at); saidVerse = !!verse; break; }
      if (look > 0 && (find(PLAIN, t[v + look]) !== null || find(NUMBERED, t[v + look]) !== null)) break;
    }
    // "Yohane 3 16"
    if (!verse && exact) { const n = number(t, ch.next); if (n && (saidTi || /^\d+$/.test(t[ch.next]))) verse = n; }
    // Clear enough? Either the word for chapter or verse, or an exact name with two numbers.
    if (!saidTi && !saidVerse && !(exact && verse)) continue;

    let chapter = ch.n, start = verse?.n, end: number | undefined, last = verse?.next ?? ch.next;
    if (CHAPTER_COUNTS[book] === 1 && start === undefined) { start = chapter; chapter = 1; }
    if (chapter < 1 || chapter > CHAPTER_COUNTS[book] || (start !== undefined && (start < 1 || start > 176))) continue;
    if (verse) {
      const to = skip(verse.next, 1);
      if (TO.has(t[verse.next] ?? "") || TO.has(t[to] ?? "")) {
        let x = (TO.has(t[verse.next] ?? "") ? verse.next : to) + 1;
        if (isVerse(t[x] ?? "")) x++;
        const e = number(t, skip(x, 2));
        if (e && e.n > verse.n) { end = e.n; last = e.next; }
      }
    }
    const after = words.slice(last).join(" ");
    found = { ref: { book, chapter, verseStart: start, verseEnd: end }, after, wordsAfter: words.length - last };
    i = last - 1;
  }
  return found;
}
