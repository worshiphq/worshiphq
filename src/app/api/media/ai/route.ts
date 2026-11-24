import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { STOCK_CORS, stockAccess } from "@/lib/media-stock";

export const maxDuration = 30;

/**
 * WorshipHQ Live's AI helper: an open model on Groq when GROQ_API_KEY is set, otherwise Claude. Two jobs:
 *  - "understand": a sentence just heard in the service (with the sentences before it) → what the media team
 *    should do: suggest a verse that was quoted or paraphrased, switch Bible version, move verses, etc.
 *  - "search": words or an idea typed in the Bible search → the verses it most likely means.
 * The app always checks suggested verses against its own Bibles before showing them.
 */

const MODEL = "claude-haiku-5-5";
const GROQ_MODEL = "openai/gpt-oss-120b";

async function askGroq(system: string, user: string, maxTokens: number): Promise<unknown> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0,
      reasoning_effort: "low",
      // Room for a little thinking before the answer.
      max_completion_tokens: maxTokens + 400,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return JSON.parse(data.choices?.[0]?.message?.content || "{}");
}

/**
 * A daily limit per computer, so one church (or a fault) can't run up the AI bill. About 1,500 sentences is several
 * long services. Counted per server instance (a safety net; the Anthropic account's spend limit is the hard stop).
 */
const DAILY_LIMIT = 1500;
const used = new Map<string, { day: string; n: number }>();
function overLimit(who: string): boolean {
  const day = new Date().toISOString().slice(0, 10);
  const u = used.get(who);
  if (!u || u.day !== day) { used.set(who, { day, n: 1 }); return false; }
  u.n++;
  return u.n > DAILY_LIMIT;
}

const UNDERSTAND = `You help the media team at a church service. You get what the preacher (or the operator) just said, a few sentences before it, what is on the projector, and the Bible versions installed. Reply with ONLY a JSON object: {"actions":[...]}.

Actions (use as few as needed; [] when nothing is needed):
- {"type":"verse","reference":"John 3:16-17","how":"named"|"quoted"|"paraphrased","words":"<the words from the speech that match the verse>","confidence":0.0-1.0}
  When the speaker names a Bible passage, reads one aloud, or clearly quotes or paraphrases a specific verse (even without saying where it is). Use standard English book names. Give a verse range when several verses are being read. Do not suggest a verse for vague religious talk that matches many verses; only when one passage is clearly meant. Be honest with confidence (0.9+ only when you are sure).
- {"type":"version","id":"<installed version id>"} when someone asks to read or show it in another version ("can I have King James", "do you have NIV? give me NIV", "let's read it in the Amplified", "in Twi please"). Only ids from the installed list.
- {"type":"second_version","id":"<id or null>"} when they want another version shown underneath (or removed).
- {"type":"next_verse"} / {"type":"previous_verse"} / {"type":"go_verse","verse":5,"to":7} / {"type":"go_chapter","chapter":4,"verse":1}
  Only when "said" itself is a request to move the screen (never because of a number in the sentences before it) ("next verse please", "let's go to verse five", "move on"). NOT when the preacher is just talking about a verse ("in the next verse Paul says…").
- {"type":"clear"} (take the words off), {"type":"black"} (black screen), {"type":"show_again"} (bring words back) — only for clear requests to the media team.

One sentence can need several actions: "give me the King James version of Mark 2 verse 10" is a version action AND a verse action. A complaint or correction is a request too: use the sentences before it and what is on the screen to work out what was asked for and not done ("no, I said the King James" after "Mark 2:10 in King James" → version kjv, and verse Mark 2:10 if it is not on the screen).

Requests may be casual, mis-transcribed by speech recognition, or in Ghanaian English / Twi mixed with English; work out what is meant. A reference can be given in pieces, as questions to the congregation, with Twi in between ("Hebrew chapter what? 11. Verse what? 6" is the verse Hebrews 11:6, never go_verse). Spelled-wrong book names ("Roman's", "Hebrew", "Sam 23") are still books.`;

const SEARCH = `You find Bible verses. You get words, a phrase, a paraphrase or an idea someone typed or said. Reply with ONLY a JSON object: {"verses":[{"reference":"Philippians 4:13","why":"<few words>"}]} — the most likely verses, best first, at most 6. Use standard English book names. Include the well-known verse that is meant even if the wording is different (e.g. "I lack nothing" → Psalm 23:1). Return {"verses":[]} if nothing fits.`;

async function ask(system: string, user: string, maxTokens: number): Promise<unknown> {
  if (env.GROQ_API_KEY) {
    try { return await askGroq(system, user, maxTokens); } catch (e) {
      if (!env.ANTHROPIC_API_KEY) throw e;
      console.warn("[media/ai] Groq failed, using Claude:", (e as Error).message);
    }
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      temperature: 0,
      // The instructions never change: cached, so each sentence costs and waits less.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = data.content?.find((c) => c.type === "text")?.text ?? "";
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(json || "{}");
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: STOCK_CORS });
}

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { ...STOCK_CORS, "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  if (!(await stockAccess(req))) return json({ error: "The AI helper comes with a WorshipHQ Live licence." }, 401);
  if (!env.ANTHROPIC_API_KEY && !env.GROQ_API_KEY) return json({ error: "AI is not set up on the server." }, 503);
  const who = (req.headers.get("authorization") ?? "anon").slice(0, 120);
  if (overLimit(who)) return json({ error: "Today's AI limit for this computer has been reached. It resets tomorrow." }, 429);
  let body: {
    task?: string;
    said?: string;
    before?: string[];
    screen?: Record<string, unknown>;
    versions?: { id: string; abbreviation: string; name: string; language: string }[];
    query?: string;
  };
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const t = Date.now();
  try {
    if (body.task === "search") {
      const q = String(body.query ?? "").slice(0, 300).trim();
      if (!q) return json({ verses: [] });
      const out = (await ask(SEARCH, q, 300)) as { verses?: unknown[] };
      return json({ verses: Array.isArray(out.verses) ? out.verses.slice(0, 6) : [], ms: Date.now() - t });
    }
    const said = String(body.said ?? "").slice(0, 600).trim();
    if (!said) return json({ actions: [] });
    const user = JSON.stringify({
      said,
      before: (body.before ?? []).slice(-6).map((x) => String(x).slice(0, 400)),
      screen: body.screen ?? {},
      versions: (body.versions ?? []).slice(0, 60).map((v) => ({ id: v.id, abbr: v.abbreviation, name: v.name, language: v.language })),
    });
    const out = (await ask(UNDERSTAND, user, 350)) as { actions?: unknown[] };
    return json({ actions: Array.isArray(out.actions) ? out.actions.slice(0, 4) : [], ms: Date.now() - t });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "AI failed" }, 502);
  }
}
