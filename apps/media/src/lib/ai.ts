import { apiBase } from "../components/StockLibrary";
import { isDesktopApp } from "./media-src";

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

let licence: Promise<string | null> | null = null;
function licenceHeader(): Promise<string | null> {
  if (!licence) {
    licence = (async () => {
      if (!isDesktopApp()) return null;
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<string | null>("stock_licence").catch(() => null);
    })();
  }
  return licence;
}

/** "ok", or why the AI isn't answering (shown in Settings and on the Voice page). */
export let aiStatus: "unknown" | "ok" | "offline" | "unlicensed" | "not-set-up" = "unknown";

async function post<T>(body: unknown, timeoutMs: number): Promise<T | null> {
  const lic = await licenceHeader();
  if (!lic) { aiStatus = "unlicensed"; return null; }
  const ctl = new AbortController();
  const timer = window.setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiBase()}/api/media/ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-WHQ-Licence": lic },
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
  const out = await post<{ actions?: AiAction[] }>({ task: "understand", said, ...ctx }, 6000);
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
  const lic = await licenceHeader();
  if (!lic) throw new Error("Twi listening needs a WorshipHQ Media licence.");
  const res = await fetch(`${apiBase()}/api/media/twi`, {
    method: "POST",
    headers: { "Content-Type": "audio/wav", "X-WHQ-Licence": lic },
    body: wav as unknown as BodyInit,
  });
  const body = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!res.ok) throw new Error(body.error ?? `Twi listening failed (${res.status})`);
  return body.text ?? "";
}
