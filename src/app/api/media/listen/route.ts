import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { STOCK_CORS, stockAccess } from "@/lib/media-stock";
import { verifyMediaToken } from "@/lib/media-license";

export const maxDuration = 30;

/**
 * Online listening for WorshipHQ Live: up to 35 seconds of sound (16 kHz WAV), read by Whisper large on Groq. The key
 * stays on this server, and the sound isn't kept here. Testing only: hours per month aren't counted yet, so a daily
 * limit per church (per server instance) stops a fault from running up the bill.
 */
const DAILY_SECONDS = 4 * 3600;
const used = new Map<string, { day: string; seconds: number }>();

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: STOCK_CORS });
}

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { ...STOCK_CORS, "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  if (!(await stockAccess(req))) return json({ error: "Online listening comes with WorshipHQ Live. Sign in first." }, 401);
  if (!env.GROQ_API_KEY) return json({ error: "Online listening isn't set up on the server yet." }, 503);
  const audio = await req.arrayBuffer();
  if (audio.byteLength < 1000 || audio.byteLength > 1_200_000) return json({ error: "Send up to 35 seconds of sound." }, 400);

  const church = (await verifyMediaToken(req.headers.get("authorization")))?.cid ?? "unknown";
  const day = new Date().toISOString().slice(0, 10);
  const u = used.get(church);
  // Groq bills every request as 10 seconds or more.
  const seconds = Math.max(10, (audio.byteLength - 44) / 32000) + (u?.day === day ? u.seconds : 0);
  if (seconds > DAILY_SECONDS) return json({ error: "Today's online listening is used up. Offline listening carries on." }, 429);
  used.set(church, { day, seconds });

  const form = new FormData();
  form.append("file", new Blob([audio], { type: "audio/wav" }), "speech.wav");
  form.append("model", "whisper-large-v3");
  form.append("response_format", "verbose_json");
  form.append("temperature", "0");
  if (new URL(req.url).searchParams.get("lang") === "en") form.append("language", "en");
  try {
    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: form,
      signal: AbortSignal.timeout(7000),
    });
    if (res.status === 429) return json({ error: "Online listening is busy (limit reached)." }, 429);
    if (!res.ok) {
      console.error("[media/listen]", res.status, (await res.text()).slice(0, 200));
      return json({ error: "Online listening had a problem." }, 502);
    }
    const data = (await res.json()) as { segments?: { start: number; end: number; text: string; no_speech_prob?: number; compression_ratio?: number }[] };
    // Silence read as words, or the same words over and over, is thrown away.
    const segments = (data.segments ?? []).filter((s) => (s.no_speech_prob ?? 0) < 0.8 && (s.compression_ratio ?? 1) < 2.4).map((s) => ({ start: s.start, end: s.end, text: s.text.trim() }));
    return json({ segments });
  } catch (e) {
    console.error("[media/listen]", (e as Error).message);
    return json({ error: "Online listening took too long." }, 504);
  }
}
