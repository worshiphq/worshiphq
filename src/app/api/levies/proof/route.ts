import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getActiveSession } from "@/lib/auth";
import { r2Ready, putObject } from "@/lib/storage";
import { levyAccess } from "@/lib/levies/guards";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Upload the receipt for a levy payment (a photo or a PDF). It is kept privately and only ever streamed back through
 * /api/levies/proof/[id], to this church, or to its main church when it shares its levies.
 */
export async function POST(req: NextRequest) {
  const session = await getActiveSession();
  if (!session || session.isDemo) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const a = levyAccess(session);
  if (!a.manage) return NextResponse.json({ error: a.writeLocked ? "Levies are not part of your plan." : "Your role cannot record levy payments." }, { status: 403 });
  if (!r2Ready) return NextResponse.json({ error: "File storage is not set up here, so save the payment without the receipt." }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choose a photo or PDF of the receipt." }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Add a photo (JPG, PNG, WebP) or a PDF." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That file is too big. Please keep it under 4 MB." }, { status: 400 });

  const body = Buffer.from(await file.arrayBuffer());
  const magic = body.subarray(0, 4).toString("hex");
  const looksRight = ext === "pdf" ? body.subarray(0, 4).toString() === "%PDF"
    : ext === "png" ? magic === "89504e47"
    : ext === "jpg" ? magic.startsWith("ffd8ff")
    : body.subarray(8, 12).toString() === "WEBP";
  if (!looksRight) return NextResponse.json({ error: "That file could not be read. Please take the photo again or export a new PDF." }, { status: 400 });

  const key = `levy-proof/${session.churchId}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
  await putObject(key, body, file.type);
  const name = (file.name || `receipt.${ext}`).replace(/[^\w .()-]/g, "").slice(0, 120) || `receipt.${ext}`;
  return NextResponse.json({ key, name, type: file.type });
}
