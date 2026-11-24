import { NextResponse } from "next/server";
import { recordNaloReport, validNaloCallback } from "@/lib/sms/nalo-reports";

export const dynamic = "force-dynamic";

/** Nalo's delivery reports. Only addresses we signed ourselves are accepted; everything else is ignored. */
async function handle(req: Request) {
  const params = new URL(req.url).searchParams;
  const ref = params.get("r") ?? "";
  if (!validNaloCallback(ref, params.get("s") ?? "")) return NextResponse.json({ ok: false }, { status: 403 });

  const query = Object.fromEntries([...params].filter(([k]) => k !== "r" && k !== "s").slice(0, 30));
  let body: unknown = null;
  if (req.method === "POST") {
    const text = (await req.text().catch(() => "")).slice(0, 5000);
    if (text) {
      try { body = JSON.parse(text); }
      catch { body = text.includes("=") ? Object.fromEntries([...new URLSearchParams(text)].slice(0, 30)) : { text }; }
    }
  }
  const payload = body && Object.keys(query).length ? { body, query } : body ?? query;
  // Someone (or a link checker) opening the bare address is not a report.
  if (!payload || typeof payload !== "object" || Object.keys(payload).length === 0) return NextResponse.json({ ok: true });
  try {
    await recordNaloReport(ref, payload);
  } catch (e) {
    console.error("[nalo report]", (e as Error).message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export const GET = handle;
export const POST = handle;
