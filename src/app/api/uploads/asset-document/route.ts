import { getActiveSession, planLockFor } from "@/lib/auth";
import { canManage, hasSection } from "@/lib/permissions";
import { db } from "@/lib/db";
import { storeDocument } from "@/lib/storage";
import { logAudit } from "@/lib/audit";
import { DOCUMENT_KIND_KEYS } from "@/lib/assets/categories";

export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024; // under Vercel's 4.5 MB request limit
const ALLOWED = new Set(["application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp"]);

const json = (body: unknown, status = 200) => Response.json(body, { status });

/**
 * Upload a document (PDF or photo) for an asset or a vehicle: insurance certificate, roadworthy sticker, receipt...
 * Server actions are capped at 1 MB, so files come here as multipart. Needs R2; without it PDFs are refused
 * rather than stored in the database.
 */
export async function POST(req: Request) {
  const session = await getActiveSession();
  if (!session) return json({ ok: false, error: "Please sign in again." }, 401);
  if (session.isDemo) return json({ ok: false, error: "This is the read-only demo." }, 403);

  const section = ["assets", "vehicles"].find((s) => hasSection(session, s) && canManage(session, s) && !planLockFor(session, s));
  if (!section) return json({ ok: false, error: "Your role cannot add documents here." }, 403);

  let form: FormData;
  try { form = await req.formData(); } catch { return json({ ok: false, error: "That upload did not arrive. Try again." }, 400); }
  const file = form.get("file");
  const assetIdRaw = String(form.get("assetId") ?? "");
  if (!(file instanceof File)) return json({ ok: false, error: "Choose a file." }, 400);
  if (file.size > MAX_BYTES) return json({ ok: false, error: "That file is over 4 MB. Try a smaller scan or a photo." }, 413);
  const type = (file.type || "").toLowerCase();
  if (!ALLOWED.has(type)) return json({ ok: false, error: "Only PDF, JPG, PNG or WEBP files." }, 415);

  const asset = await db.asset.findFirst({ where: { id: assetIdRaw, churchId: session.churchId }, select: { id: true, name: true, vehicle: { select: { id: true } } } });
  if (!asset) return json({ ok: false, error: "That item was not found." }, 404);
  // Vehicle managers may add papers to vehicles only; asset managers to anything.
  if (section === "vehicles" && !asset.vehicle && !(canManage(session, "assets") && !planLockFor(session, "assets"))) return json({ ok: false, error: "Your role cannot add documents here." }, 403);

  const url = await storeDocument(Buffer.from(await file.arrayBuffer()), type, `asset-docs/${session.churchId}`);
  if (!url) return json({ ok: false, error: "File storage is not set up yet, so documents cannot be uploaded. Please contact support." }, 503);

  const kindRaw = String(form.get("kind") ?? "other");
  const expiresRaw = String(form.get("expiresAt") ?? "");
  const expiresAt = /^\d{4}-\d{2}-\d{2}$/.test(expiresRaw) ? new Date(`${expiresRaw}T00:00:00Z`) : null;
  const name = (String(form.get("name") ?? "").trim() || file.name || "Document").slice(0, 120);
  const doc = await db.assetDocument.create({
    data: {
      churchId: session.churchId, assetId: asset.id, kind: DOCUMENT_KIND_KEYS.includes(kindRaw) ? kindRaw : "other", name, url,
      contentType: type, sizeBytes: file.size, expiresAt, uploadedById: session.userId,
    },
    select: { id: true },
  });
  // A dated insurance, roadworthy or DVLA paper also updates the vehicle's expiry.
  if (asset.vehicle && expiresAt && ["insurance", "roadworthy", "registration"].includes(kindRaw)) {
    const field = kindRaw === "insurance" ? "insuranceExpires" : kindRaw === "roadworthy" ? "roadworthyExpires" : "registrationExpires";
    await db.vehicle.updateMany({ where: { id: asset.vehicle.id, churchId: session.churchId }, data: { [field]: expiresAt } });
  }
  await logAudit({ churchId: session.churchId, userId: session.userId, action: "create", entity: "assetDocument", entityId: doc.id, detail: `Added document "${name}" to ${asset.name}` });
  return json({ ok: true, id: doc.id, url });
}
