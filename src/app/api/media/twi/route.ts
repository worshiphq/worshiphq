import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { STOCK_CORS, stockAccess } from "@/lib/media-stock";

export const maxDuration = 30;

/**
 * Twi speech recognition for WorshipHQ Live, through Khaya (GhanaNLP). The app sends one spoken sentence as a
 * 16 kHz WAV; WorshipHQ's Khaya key stays on the server.
 */
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: STOCK_CORS });
}

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { ...STOCK_CORS, "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  if (!(await stockAccess(req))) return json({ error: "Twi listening comes with a WorshipHQ Live licence." }, 401);
  if (!env.KHAYA_API_KEY) return json({ error: "Twi listening is not set up on the server yet." }, 503);
  const audio = await req.arrayBuffer();
  if (!audio.byteLength || audio.byteLength > 4_000_000) return json({ error: "Send one sentence of audio (WAV, under 4 MB)." }, 400);
  const t = Date.now();
  const res = await fetch("https://api.khaya.ai/asr/v1/transcribe?language=twi", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.KHAYA_API_KEY}`, "Content-Type": "audio/wav", "Cache-Control": "no-cache" },
    body: audio,
  });
  if (!res.ok) return json({ error: `Khaya said ${res.status}` }, 502);
  const body = (await res.json().catch(() => "")) as string | { text?: string };
  const text = typeof body === "string" ? body : body.text ?? "";
  return json({ text, ms: Date.now() - t });
}
