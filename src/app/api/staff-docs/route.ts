import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getActiveSession, planLockFor } from "@/lib/auth";
import { db } from "@/lib/db";
import { r2Ready, putObject, getObject } from "@/lib/storage";
import { hasSection, canManage } from "@/lib/permissions";
import { writeEvent } from "@/lib/payroll/engine";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const MAX = 4 * 1024 * 1024;

/**
 * Staff documents (contracts, ID copies, certificates), kept privately in R2 and only streamed through here.
 *   POST  form: staffId, kind, name, payrollOnly, file   (Staff manage; a payroll-only document also needs payroll manage)
 *   GET   ?id=<documentId>                              (payroll-only documents need payroll access, others Staff)
 */
export async function POST(req: NextRequest) {
  const session = await getActiveSession();
  if (!session || session.isDemo || session.impersonating) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (planLockFor(session, "staff")) return NextResponse.json({ error: "Staff records are part of the Max plan." }, { status: 403 });
  if (!canManage(session, "staff")) return NextResponse.json({ error: "Your role cannot change staff records." }, { status: 403 });
  if (!r2Ready) return NextResponse.json({ error: "File storage is not set up here." }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const staffId = String(form?.get("staffId") ?? "");
  const payrollOnly = String(form?.get("payrollOnly") ?? "") === "on" || String(form?.get("payrollOnly") ?? "") === "true";
  if (payrollOnly && session.payroll !== "manage") return NextResponse.json({ error: "Only payroll managers can add payroll-only documents." }, { status: 403 });
  const staff = await db.staffMember.findFirst({ where: { id: staffId, churchId: session.churchId }, select: { id: true } });
  if (!staff) return NextResponse.json({ error: "Staff record not found." }, { status: 404 });
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choose a PDF or a photo." }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Upload a PDF or a photo (JPG, PNG, WebP)." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "That file is too big. Please keep it under 4 MB." }, { status: 400 });
  const body = Buffer.from(await file.arrayBuffer());
  const magic = body.subarray(0, 4).toString("hex");
  const ok = ext === "pdf" ? body.subarray(0, 4).toString() === "%PDF" : ext === "png" ? magic === "89504e47" : ext === "jpg" ? magic.startsWith("ffd8ff") : body.subarray(8, 12).toString() === "WEBP";
  if (!ok) return NextResponse.json({ error: "That file could not be read. Please export or photograph it again." }, { status: 400 });

  const kind = ["contract", "id", "certificate", "other"].includes(String(form?.get("kind"))) ? String(form?.get("kind")) : "other";
  const name = String(form?.get("name") ?? "").trim().slice(0, 80) || file.name.slice(0, 80) || "Document";
  const key = `private/staff-docs/${session.churchId}/${staff.id}/${crypto.randomBytes(9).toString("hex")}.${ext}`;
  await putObject(key, body, file.type);
  const doc = await db.staffDocument.create({
    data: { churchId: session.churchId, staffId: staff.id, kind, name, objectKey: key, contentType: file.type, sizeBytes: body.length, payrollOnly, uploadedById: session.userId, uploadedByName: session.name },
  });
  await writeEvent(db, { churchId: session.churchId, staffId: staff.id, action: "doc.uploaded", actorId: session.userId, actorName: session.name, detail: `Uploaded "${name}"${payrollOnly ? " (payroll only)" : ""}` });
  return NextResponse.json({ ok: true, id: doc.id });
}

export async function GET(req: NextRequest) {
  const session = await getActiveSession();
  if (!session || session.isDemo || session.impersonating) return new NextResponse("Not allowed", { status: 403 });
  if (planLockFor(session, "staff")) return new NextResponse("Not allowed", { status: 403 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const doc = await db.staffDocument.findFirst({ where: { id, churchId: session.churchId } });
  if (!doc) return new NextResponse("Not found", { status: 404 });
  const allowed = doc.payrollOnly ? !!session.payroll : hasSection(session, "staff");
  if (!allowed) return new NextResponse("Not allowed", { status: 403 });
  const file = await getObject(doc.objectKey).catch(() => null);
  if (!file) return new NextResponse("The file could not be found.", { status: 404 });
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": doc.contentType,
      "Content-Disposition": `inline; filename="${doc.name.replace(/[^A-Za-z0-9 ._-]+/g, "")}.${TYPES[doc.contentType] ?? "bin"}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
