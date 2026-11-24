import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { putObject, r2Ready } from "@/lib/storage";
import { looksLikeEwb, looksLikeGzip } from "@/lib/media-bibles";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024;

/**
 * SuperAdmin › Bibles: upload a Bible for churches to download in WorshipHQ Live.
 * Multipart form: file (.ewb, or a gzipped WorshipHQ .db), name, abbreviation, language, licence, audience, churchIds (comma list).
 */
export async function POST(req: Request) {
  const sa = await getSuperAdmin();
  if (!sa) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!r2Ready) return NextResponse.json({ error: "File storage (R2) isn't set up on this server." }, { status: 500 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "The upload didn't arrive. Try again." }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a Bible file." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That file is over 4 MB. EasyWorship .ewb Bibles are about 1.5 MB." }, { status: 413 });

  const buf = Buffer.from(await file.arrayBuffer());
  const format = looksLikeEwb(buf) ? "ewb" : looksLikeGzip(buf) ? "db-gz" : null;
  if (!format) return NextResponse.json({ error: "That isn't an EasyWorship Bible (.ewb) or a WorshipHQ Bible file." }, { status: 400 });

  const text = (k: string, max = 200) => String(form.get(k) ?? "").trim().slice(0, max);
  const abbreviation = text("abbreviation", 20).toUpperCase() || file.name.replace(/\.[^.]+$/, "").toUpperCase();
  const name = text("name") || abbreviation;
  const audience = text("audience") === "churches" ? "churches" : "all";
  const churchIds = text("churchIds", 5000).split(",").map((s) => s.trim()).filter(Boolean);

  // A random, unguessable key; the file is only ever handed out through /api/media/bibles/[id].
  const key = `bibles/${crypto.randomBytes(16).toString("hex")}.${format === "ewb" ? "ewb" : "db.gz"}`;
  await putObject(key, buf, "application/octet-stream");
  const row = await db.mediaBible.create({
    data: {
      abbreviation,
      name,
      language: text("language", 60) || "English",
      format,
      objectKey: key,
      sizeBytes: buf.length,
      sha256: crypto.createHash("sha256").update(buf).digest("hex"),
      licence: text("licence", 2000),
      audience,
      churchIds: audience === "churches" ? churchIds : [],
    },
  });
  return NextResponse.json({ ok: true, id: row.id });
}
