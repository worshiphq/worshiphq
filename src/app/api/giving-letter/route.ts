import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getActiveSession, getSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { r2Ready, putObject, getObject, deleteObject } from "@/lib/storage";
import { currentGivingRequest, LETTER_TYPES, LETTER_MAX_BYTES } from "@/lib/giving/auth-letter";

export const dynamic = "force-dynamic";

/**
 * The church's signed authorisation letter for online giving.
 *   POST  (Main Admin or Admin)  upload the signed and stamped letter: a photo (JPG, PNG, WebP) or a PDF
 *   GET   (Main Admin or Admin)  see their own church's letter
 *   GET ?id=<requestId> (SuperAdmin)  see any church's letter, from the payment requests page
 * The file is kept privately in R2 and only ever streamed through here.
 */
export async function POST(req: NextRequest) {
  const session = await getActiveSession();
  if (!session || session.isDemo) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (session.role !== "Owner" && session.role !== "Admin") return NextResponse.json({ error: "Only the Main Admin or an Admin can upload the letter." }, { status: 403 });
  if (!r2Ready) return NextResponse.json({ error: "File storage is not set up here." }, { status: 503 });

  const request = await currentGivingRequest(session.churchId);
  if (!request) return NextResponse.json({ error: "Request online giving first, then upload the letter." }, { status: 400 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choose the photo or PDF of the signed letter." }, { status: 400 });
  const ext = LETTER_TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Upload a photo (JPG, PNG) or a PDF." }, { status: 400 });
  if (file.size > LETTER_MAX_BYTES) return NextResponse.json({ error: "That file is too big. Please keep it under 4 MB." }, { status: 400 });

  const body = Buffer.from(await file.arrayBuffer());
  // Check the file really is what it says (a renamed file of another kind is refused).
  const magic = body.subarray(0, 4).toString("hex");
  const looksRight = ext === "pdf" ? body.subarray(0, 4).toString() === "%PDF"
    : ext === "png" ? magic === "89504e47"
    : ext === "jpg" ? magic.startsWith("ffd8ff")
    : body.subarray(8, 12).toString() === "WEBP";
  if (!looksRight) return NextResponse.json({ error: "That file could not be read. Please take the photo again or export a new PDF." }, { status: 400 });

  const key = `private/giving-letters/${session.churchId}/${request.id}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
  await putObject(key, body, file.type);
  await db.paymentRequest.update({ where: { id: request.id }, data: { authLetterKey: key, authLetterType: file.type, authLetterAt: new Date() } });
  // The older copy is replaced, not kept.
  if (request.authLetterKey && request.authLetterKey !== key) await deleteObject(request.authLetterKey).catch(() => {});
  await audit(session, "update", "givingLetter", "Uploaded the online giving authorisation letter", request.id);
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  let row: { authLetterKey: string | null; authLetterType: string | null; churchId: string } | null = null;

  if (id) {
    // SuperAdmin, from the payment requests page.
    if (!(await getSuperAdmin())) return new NextResponse("Not allowed", { status: 403 });
    row = await db.paymentRequest.findUnique({ where: { id }, select: { authLetterKey: true, authLetterType: true, churchId: true } });
  } else {
    const session = await getActiveSession();
    if (!session || (session.role !== "Owner" && session.role !== "Admin")) return new NextResponse("Not allowed", { status: 403 });
    const r = await currentGivingRequest(session.churchId);
    row = r ? { authLetterKey: r.authLetterKey, authLetterType: r.authLetterType, churchId: session.churchId } : null;
  }

  if (!row?.authLetterKey) return new NextResponse("No letter uploaded yet.", { status: 404 });
  const file = await getObject(row.authLetterKey).catch(() => null);
  if (!file) return new NextResponse("The file could not be found.", { status: 404 });
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": row.authLetterType ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="authorisation-letter.${LETTER_TYPES[row.authLetterType ?? ""] ?? "bin"}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
