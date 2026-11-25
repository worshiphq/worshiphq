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

export interface AiNote { kind: "title" | "point" | "sub" | "line"; text: string }

/** What in the words just preached should be noted: the title, points, sub-points, key lines. null = AI not reached. */
export async function aiNotes(said: string, have: string[], title?: string): Promise<AiNote[] | null> {
  const out = await post<{ notes?: AiNote[] }>({ task: "notes", said, have: have.slice(-30), title }, 15000);
  if (!out) return null;
  return Array.isArray(out.notes) ? out.notes : [];
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
