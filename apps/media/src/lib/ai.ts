import { apiBase } from "../components/StockLibrary";
import { serverHeaders } from "./account";

/**
 * WorshipHQ AI (Claude, through the WorshipHQ server): understands what was said in the service and what someone
 * is looking for in the Bible. Needs internet and a licence; without them the app keeps working on its own.
 */

export type AiAction =
  | { type: "verse"; reference: string; how?: "named" | "quoted" | "paraphrased"; words?: string; confidence?: number }
  | { type: "version"; id: string }
  | { type: "second_version"; id: string | null }
  | { type: "next_verse" } | { type: "previous_verse" }
  | { type: "go_verse"; verse: number; to?: number }
  | { type: "go_chapter"; chapter: number; verse?: number }
  | { type: "clear" } | { type: "black" } | { type: "show_again" };

/** "ok", or why the AI isn't answering (shown in Settings and on the Voice page). */
export let aiStatus: "unknown" | "ok" | "offline" | "unlicensed" | "not-set-up" = "unknown";

async function post<T>(body: unknown, timeoutMs: number): Promise<T | null> {
  const lic = await serverHeaders();
  if (!lic) { aiStatus = "unlicensed"; return null; }
  const ctl = new AbortController();
  const timer = window.setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiBase()}/api/media/ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...lic },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    if (res.status === 401) { aiStatus = "unlicensed"; return null; }
    if (res.status === 503) { aiStatus = "not-set-up"; return null; }
    if (!res.ok) { aiStatus = "offline"; return null; }
    aiStatus = "ok";
    return (await res.json()) as T;
  } catch {
    aiStatus = "offline";
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

export interface AiContext {
  before: string[];
  screen: { passage?: string; showing?: string; secondVersion?: string };
  versions: { id: string; abbreviation: string; name: string; language: string }[];
}

/** What should happen after this sentence (often nothing). null when the AI could not be reached. */
export async function understand(said: string, ctx: AiContext): Promise<AiAction[] | null> {
  // Versions as "id · abbreviation · language" only, to keep each request small (and cheap).
  const versions = ctx.versions.map((v) => ({ id: v.id, abbreviation: v.abbreviation, name: v.abbreviation, language: v.language.split(" ")[0] }));
  const out = await post<{ actions?: AiAction[] }>({ task: "understand", said, ...ctx, versions }, 6000);
  if (!out) return null;
  return Array.isArray(out.actions) ? out.actions : [];
}

/** The verses a phrase, paraphrase or idea most likely means. */
export async function aiFindVerses(query: string): Promise<{ reference: string; why?: string }[]> {
  const out = await post<{ verses?: { reference: string; why?: string }[] }>({ task: "search", query }, 8000);
  return Array.isArray(out?.verses) ? out!.verses : [];
}

/** Twi speech → text through Khaya on the WorshipHQ server. */
export async function transcribeTwi(wav: Uint8Array): Promise<string> {
  const lic = await serverHeaders();
  if (!lic) throw new Error("Twi listening needs you signed in to WorshipHQ (Help › WorshipHQ account).");
  const res = await fetch(`${apiBase()}/api/media/twi`, {
    method: "POST",
    headers: { "Content-Type": "audio/wav", ...lic },
    body: wav as unknown as BodyInit,
  });
  const body = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!res.ok) throw new Error(body.error ?? `Twi listening failed (${res.status})`);
  return body.text ?? "";
}

export type NoteChange =
  | { do: "add"; kind: "point" | "sub" | "line"; text: string; under?: string }
  | { do: "fix"; was: string; text: string }
  | { do: "drop"; was: string };

/** What the words just preached change on the notes page. null = AI not reached. */
export async function aiNotes(said: string, before: string, page: { text: string; yours: boolean }[], heading: string): Promise<{ heading: string | null; changes: NoteChange[] } | null> {
  const out = await post<{ heading?: string | null; changes?: NoteChange[] }>({ task: "page", said, before: [before], page, heading }, 26000);
  if (!out) return null;
  return { heading: out.heading ?? null, changes: Array.isArray(out.changes) ? out.changes : [] };
}

/** The page put in order. null = AI not reached. */
export async function aiTidy(heading: string, page: string): Promise<{ heading: string; page: string } | null> {
  const out = await post<{ heading?: string; page?: string }>({ task: "tidy", heading, page }, 27000);
  return out?.page ? { heading: out.heading ?? heading, page: out.page } : null;
}

/** Online listening: the last seconds of sound, read by a big speech model through the WorshipHQ server. */
export async function listenOnline(wav: Uint8Array, lang?: "en"): Promise<{ start: number; end: number; text: string }[]> {
  const lic = await serverHeaders();
  if (!lic) throw new Error("Online listening needs you signed in to WorshipHQ (Help › WorshipHQ account).");
  const res = await fetch(`${apiBase()}/api/media/listen${lang ? `?lang=${lang}` : ""}`, {
    method: "POST",
    headers: { "Content-Type": "audio/wav", ...lic },
    body: wav as unknown as BodyInit,
    signal: AbortSignal.timeout(8000),
  });
  const body = (await res.json().catch(() => ({}))) as { segments?: { start: number; end: number; text: string }[]; error?: string };
  if (!res.ok || !Array.isArray(body.segments)) throw new Error(body.error ?? `Online listening failed (${res.status})`);
  return body.segments;
}

/** Settings › test: asks the AI one real question and says what came back. */
export async function testAi(): Promise<{ ok: boolean; text: string }> {
  const t = performance.now();
  const actions = await understand("Give me the King James version of Mark chapter 2 verse 10", { before: [], screen: {}, versions: [{ id: "kjv", abbreviation: "KJV", name: "King James Version", language: "English" }] });
  const s = ((performance.now() - t) / 1000).toFixed(1);
  if (actions === null) {
    return { ok: false, text: aiStatus === "unlicensed" ? "Sign in first (Help › WorshipHQ account)." : aiStatus === "not-set-up" ? "The AI isn't set up on the WorshipHQ server yet." : "The AI couldn't be reached. Check the internet; if that is fine, the server had a problem." };
  }
  const got = actions.map((a) => (a.type === "verse" ? a.reference : a.type === "version" ? a.id.toUpperCase() : a.type)).join(" + ");
  return { ok: true, text: `Working. Asked for “the King James version of Mark 2:10”, it understood: ${got || "nothing"} (${s} s).` };
}

/** Voice › test: sends three seconds of quiet, to see whether the online speech model answers. */
export async function testOnline(): Promise<{ ok: boolean; text: string }> {
  const RATE = 16000, n = RATE * 3, b = new Uint8Array(44 + n * 2), d = new DataView(b.buffer);
  const word = (at: number, s: string) => [...s].forEach((c, i) => d.setUint8(at + i, c.charCodeAt(0)));
  word(0, "RIFF"); d.setUint32(4, 36 + n * 2, true); word(8, "WAVEfmt "); d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true);
  d.setUint32(24, RATE, true); d.setUint32(28, RATE * 2, true); d.setUint16(32, 2, true); d.setUint16(34, 16, true); word(36, "data"); d.setUint32(40, n * 2, true);
  const t = performance.now();
  try {
    await listenOnline(b, "en");
    return { ok: true, text: `Working. Groq answered in ${((performance.now() - t) / 1000).toFixed(1)} s.` };
  } catch (e) {
    return { ok: false, text: e instanceof Error ? e.message : String(e) };
  }
}
