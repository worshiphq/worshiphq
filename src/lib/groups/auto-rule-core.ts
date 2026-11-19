/**
 * Groups that fill themselves from a form answer (pure helpers, safe on client and server).
 *
 * A rule is { question, answer }: the question is the form question's label (answers are saved
 * on Person.customFields under that label) and the answer is what a member must have picked.
 *
 * Day questions ("Day Born", "Day of birth"...) are matched smartly: Akan day names
 * (Kwabena, Abena, Kobina, Araba...), Twi weekday names (Benada), short forms (Tue, Tues)
 * and small typos ("Sarurday") all count as the right weekday.
 */

export type AutoRule = { question: string; answer: string };

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** Akan day names (Twi and Fante spellings) for each weekday, males and females. */
export const AKAN_NAMES: Record<(typeof WEEKDAYS)[number], { male: string; female: string; words: string[] }> = {
  Sunday: { male: "Kwasi", female: "Akosua", words: ["kwasi", "akwasi", "kwesi", "kwasie", "akosua", "esi", "kosua", "kwasiada", "kwasida"] },
  Monday: { male: "Kwadwo", female: "Adwoa", words: ["kwadwo", "kwadjo", "kodwo", "kojo", "jojo", "adwoa", "adjoa", "adjua", "adwoba", "dwoada", "edwoada"] },
  Tuesday: { male: "Kwabena", female: "Abena", words: ["kwabena", "kobina", "kabina", "ebo", "kobby", "abena", "abenaa", "araba", "benada", "abenada"] },
  Wednesday: { male: "Kwaku", female: "Akua", words: ["kwaku", "kweku", "kuuku", "akua", "ekua", "kukua", "wukuada", "wukuda"] },
  Thursday: { male: "Yaw", female: "Yaa", words: ["yaw", "yao", "ekow", "yaa", "aba", "yaaba", "yawoada", "yawda"] },
  Friday: { male: "Kofi", female: "Afua", words: ["kofi", "fiifi", "afua", "efua", "afia", "efia", "fiada", "efiada"] },
  Saturday: { male: "Kwame", female: "Ama", words: ["kwame", "kwamena", "ato", "ama", "ame", "memeneda", "memenda"] },
};

const SHORT: Record<string, (typeof WEEKDAYS)[number]> = {
  sun: "Sunday", mon: "Monday", tue: "Tuesday", tues: "Tuesday", wed: "Wednesday", weds: "Wednesday",
  thu: "Thursday", thur: "Thursday", thurs: "Thursday", fri: "Friday", sat: "Saturday",
};

/** Is this question about the day of the week someone was born? */
export function isDayQuestion(question: string): boolean {
  const q = question.toLowerCase();
  return /\bday\b|dayborn|day-born/.test(q) && /born|birth/.test(q) || /^\s*day\s*born\s*$/.test(q) || /akan name|kra din/.test(q);
}

function distance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

/** Read a weekday out of whatever someone typed: "Tuesday", "tue", "Kwabena", "Saturday born", "Sarurday". */
export function weekdayFrom(raw: string | null | undefined): (typeof WEEKDAYS)[number] | null {
  if (!raw) return null;
  const tokens = raw.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  // 1. English day names and short forms.
  for (const t of tokens) {
    const full = WEEKDAYS.find((d) => d.toLowerCase() === t);
    if (full) return full;
    if (SHORT[t]) return SHORT[t];
  }
  // 2. Akan names and Twi weekday names.
  for (const t of tokens) {
    for (const d of WEEKDAYS) if (AKAN_NAMES[d].words.includes(t)) return d;
  }
  // 3. Small typos of English day names ("Sarurday", "Wensday", "Thusday").
  let best: (typeof WEEKDAYS)[number] | null = null;
  let bestD = 99;
  for (const t of tokens) {
    if (t.length < 5) continue;
    for (const d of WEEKDAYS) {
      const dist = distance(t, d.toLowerCase());
      if (dist < bestD) { bestD = dist; best = d; }
    }
  }
  return bestD <= 2 ? best : null;
}

const clean = (v: string) => v.trim().replace(/\s+/g, " ").toLowerCase();

/** The comparable form of an answer to a question. */
export function normalAnswer(question: string, raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw);
  if (!s.trim()) return null;
  if (isDayQuestion(question)) return (weekdayFrom(s) ?? clean(s)).toLowerCase();
  return clean(s);
}

/** Read the rule saved on a group (null when the group is filled by hand). */
export function parseAutoRule(raw: unknown): AutoRule | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const question = typeof r.question === "string" ? r.question.trim() : "";
  const answer = typeof r.answer === "string" ? r.answer.trim() : "";
  return question && answer ? { question: question.slice(0, 120), answer: answer.slice(0, 120) } : null;
}

/** A person's answer to the rule's question, falling back to their date of birth for day questions. */
export function personAnswer(question: string, customFields: unknown, dateOfBirth?: Date | null): string | null {
  const cf = customFields && typeof customFields === "object" ? (customFields as Record<string, unknown>) : {};
  const key = Object.keys(cf).find((k) => clean(k) === clean(question));
  const v = key != null ? cf[key] : null;
  const n = normalAnswer(question, typeof v === "string" || typeof v === "number" ? String(v) : null);
  if (n) return n;
  // Day questions: a full date of birth tells us the weekday (ignore placeholder years).
  if (isDayQuestion(question) && dateOfBirth && dateOfBirth.getUTCFullYear() >= 1910) {
    return WEEKDAYS[dateOfBirth.getUTCDay()].toLowerCase();
  }
  return null;
}

export function matchesRule(rule: AutoRule, customFields: unknown, dateOfBirth?: Date | null): boolean {
  const mine = personAnswer(rule.question, customFields, dateOfBirth);
  return !!mine && mine === normalAnswer(rule.question, rule.answer);
}

export const describeRule = (r: AutoRule) => `${r.question}: ${r.answer}`;

/** How a day answer is shown in pickers: "Tuesday (Kwabena / Abena)". */
export const dayLabel = (d: (typeof WEEKDAYS)[number]) => `${d} (${AKAN_NAMES[d].male} / ${AKAN_NAMES[d].female})`;
