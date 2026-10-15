"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { moveToBin } from "@/lib/recycle-bin";
import { matchesPerson } from "@/lib/search";
import { DEFAULT_CERT_SETTINGS } from "@/lib/baptism-defaults";
import { FORM_KINDS } from "@/lib/forms/kinds";
import { questionFields, type FormField } from "@/lib/forms/registration";

export type BaptismRow = {
  id: string; personId: string | null; name: string; status: "candidate" | "baptised";
  date: string | null; place: string | null; officiant: string | null; certificateNo: string | null; notes: string | null;
  /** Answers to the church's own extra questions. */
  extra: { id: string; label: string; value: string }[];
};
export type CertField = { key: string; x: number; y: number; w: number; size: number; font: string; color: string; align: "left" | "center" | "right"; bold?: boolean };
export type TemplateRow = { id: string; name: string; imageUrl: string; paper: string; fields: CertField[] };
export type CertSettings = { template: string; signer1: string; signer2: string; signer1Name: string; signer2Name: string; heading: string; statement: string; scripture: string };

export type BaptismData = {
  rows: BaptismRow[];
  templates: TemplateRow[];
  settings: CertSettings;
  /** The questions the church asks for each baptism (it can change these in the form builder). */
  formFields: FormField[];
  church: { name: string; logoUrl: string | null };
  stats: { thisYear: number; candidates: number; total: number; membersBaptisedPct: number };
  canWrite: boolean;
  isAdmin: boolean;
};

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const parseDay = (v: string | null | undefined): Date | null => {
  if (!v) return null;
  const d = new Date(`${v}T12:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
};
const clean = (v: unknown, max = 120) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);

const readExtra = (v: unknown): { id: string; label: string; value: string }[] =>
  Array.isArray(v) ? v.filter((x) => x && typeof x.id === "string" && typeof x.label === "string").map((x) => ({ id: x.id, label: x.label, value: String(x.value ?? "") })) : [];

/** Keep only answers to the church's own questions that are still on the form, cleaned and capped. */
async function extraAnswers(churchId: string, answers: Record<string, string> | undefined) {
  if (!answers) return undefined;
  const c = await db.church.findUnique({ where: { id: churchId }, select: { baptismFormFields: true } });
  const out: { id: string; label: string; value: string }[] = [];
  for (const q of questionFields(FORM_KINDS.baptism.resolve(c?.baptismFormFields)).filter((x) => !x.system)) {
    const value = clean(answers[q.id], 2000);
    if (value) out.push({ id: q.id, label: q.label, value });
  }
  return out.slice(0, 40);
}

function guardWrite(session: Awaited<ReturnType<typeof requireSession>>) {
  assertCanWrite(session, "people");
  if (session.isDemo) throw new Error("Read-only demo.");
}

export async function getBaptisms(): Promise<BaptismData> {
  const session = await requireSession();
  const churchId = session.churchId;
  const year = new Date().getFullYear();
  const [rows, templates, church, thisYear, candidates, total, people, baptisedMembers] = await Promise.all([
    db.baptism.findMany({ where: { churchId }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 1500 }),
    db.certificateTemplate.findMany({ where: { churchId, kind: "baptism" }, orderBy: { createdAt: "desc" } }),
    db.church.findUnique({ where: { id: churchId }, select: { name: true, logoUrl: true, certSettings: true, baptismFormFields: true } }),
    db.baptism.count({ where: { churchId, status: "baptised", date: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } } }),
    db.baptism.count({ where: { churchId, status: "candidate" } }),
    db.baptism.count({ where: { churchId, status: "baptised" } }),
    db.person.count({ where: { churchId, status: "active" } }),
    db.person.count({ where: { churchId, status: "active", baptized: true } }),
  ]);
  const saved = (church?.certSettings as Partial<CertSettings> | null) ?? {};
  return {
    rows: rows.map((r) => ({ id: r.id, personId: r.personId, name: r.name, status: r.status === "candidate" ? "candidate" : "baptised", date: iso(r.date), place: r.place, officiant: r.officiant, certificateNo: r.certificateNo, notes: r.notes, extra: readExtra(r.extra) })),
    templates: templates.map((t) => ({ id: t.id, name: t.name, imageUrl: t.imageUrl, paper: t.paper, fields: (t.fields as unknown as CertField[]) ?? [] })),
    settings: { ...DEFAULT_CERT_SETTINGS, ...saved },
    formFields: FORM_KINDS.baptism.resolve(church?.baptismFormFields),
    church: { name: church?.name ?? "", logoUrl: church?.logoUrl ?? null },
    stats: { thisYear, candidates, total, membersBaptisedPct: people ? Math.round((baptisedMembers / people) * 100) : 0 },
    canWrite: !session.isDemo,
    isAdmin: session.role === "Owner" || session.role === "Admin",
  };
}

/** Find members to add (by name, phone or member ID). */
export async function searchBaptismPeople(query: string): Promise<{ id: string; name: string; phone: string | null; baptized: boolean | null }[]> {
  const session = await requireSession();
  const q = clean(query, 60);
  if (q.length < 2) return [];
  const rows = await db.person.findMany({
    where: { churchId: session.churchId, status: { in: ["active", "visitor"] } },
    select: { id: true, firstName: true, lastName: true, phone: true, memberId: true, baptized: true },
    orderBy: { firstName: "asc" },
    take: 600,
  });
  return rows
    .filter((r) => matchesPerson(q, { name: `${r.firstName} ${r.lastName}`, phone: r.phone, memberId: r.memberId }))
    .slice(0, 8)
    .map((r) => ({ id: r.id, name: `${r.firstName} ${r.lastName}`.trim(), phone: r.phone, baptized: r.baptized }));
}

/** The next certificate number for a year, like BC-2026-014. */
async function nextCertificateNo(churchId: string, year: number): Promise<string> {
  const prefix = `BC-${year}-`;
  const last = await db.baptism.findMany({ where: { churchId, certificateNo: { startsWith: prefix } }, select: { certificateNo: true } });
  const max = last.reduce((m, r) => Math.max(m, parseInt((r.certificateNo ?? "").slice(prefix.length), 10) || 0), 0);
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

/** Add people who are preparing for baptism. */
export async function addCandidates(input: { personIds?: string[]; names?: string[] }) {
  const session = await requireSession();
  guardWrite(session);
  let added = 0;
  const have = new Set((await db.baptism.findMany({ where: { churchId: session.churchId, status: "candidate" }, select: { personId: true, name: true } })).flatMap((b) => [b.personId ?? "", b.name.toLowerCase()]));
  for (const id of [...new Set(input.personIds ?? [])].slice(0, 200)) {
    if (have.has(id)) continue;
    const p = await db.person.findFirst({ where: { id, churchId: session.churchId }, select: { id: true, firstName: true, lastName: true } });
    if (!p) continue;
    await db.baptism.create({ data: { churchId: session.churchId, personId: p.id, name: `${p.firstName} ${p.lastName}`.trim(), status: "candidate" } });
    added++;
  }
  for (const n of (input.names ?? []).map((x) => clean(x, 80)).filter(Boolean).slice(0, 50)) {
    if (have.has(n.toLowerCase())) continue;
    await db.baptism.create({ data: { churchId: session.churchId, name: n, status: "candidate" } });
    added++;
  }
  revalidatePath("/app/baptisms");
  return { ok: true as const, added };
}

type Details = { date?: string | null; place?: string | null; officiant?: string | null; extra?: Record<string, string> };

/** Put a date, place and officiant on candidates (the baptism service is planned). */
export async function scheduleCandidates(ids: string[], d: Details) {
  const session = await requireSession();
  guardWrite(session);
  await db.baptism.updateMany({
    where: { churchId: session.churchId, id: { in: ids }, status: "candidate" },
    data: { date: parseDay(d.date), place: clean(d.place) || null, officiant: clean(d.officiant) || null },
  });
  revalidatePath("/app/baptisms");
  return { ok: true as const };
}

/** They have been baptised: record it, give each a certificate number, and mark the member as baptised. */
export async function markBaptised(ids: string[], d: Details) {
  const session = await requireSession();
  guardWrite(session);
  const date = parseDay(d.date) ?? new Date();
  const rows = await db.baptism.findMany({ where: { churchId: session.churchId, id: { in: ids }, status: "candidate" }, orderBy: { createdAt: "asc" } });
  let done = 0;
  for (const r of rows) {
    const no = await nextCertificateNo(session.churchId, date.getUTCFullYear());
    await db.baptism.update({ where: { id: r.id }, data: { status: "baptised", date, place: clean(d.place) || r.place, officiant: clean(d.officiant) || r.officiant, certificateNo: no } });
    if (r.personId) await db.person.updateMany({ where: { id: r.personId, churchId: session.churchId }, data: { baptized: true } });
    done++;
  }
  await audit(session, "update", "baptism", `Recorded ${done} baptism${done === 1 ? "" : "s"}`);
  revalidatePath("/app/baptisms");
  revalidatePath("/app/people");
  return { ok: true as const, done };
}

/** A baptism that already happened (an older record, or someone baptised elsewhere). */
export async function addBaptismRecord(input: { personId?: string; name?: string } & Details & { notes?: string }) {
  const session = await requireSession();
  guardWrite(session);
  let name = clean(input.name, 80);
  let personId: string | null = null;
  if (input.personId) {
    const p = await db.person.findFirst({ where: { id: input.personId, churchId: session.churchId }, select: { id: true, firstName: true, lastName: true } });
    if (p) { personId = p.id; name = `${p.firstName} ${p.lastName}`.trim(); }
  }
  if (!name) return { ok: false as const, error: "Choose a member or type a name." };
  const date = parseDay(input.date);
  if (!date) return { ok: false as const, error: "Enter the date of the baptism." };
  const no = await nextCertificateNo(session.churchId, date.getUTCFullYear());
  await db.baptism.create({ data: { churchId: session.churchId, personId, name, status: "baptised", date, place: clean(input.place) || null, officiant: clean(input.officiant) || null, certificateNo: no, notes: clean(input.notes, 300) || null, extra: (await extraAnswers(session.churchId, input.extra)) ?? Prisma.JsonNull } });
  if (personId) await db.person.updateMany({ where: { id: personId, churchId: session.churchId }, data: { baptized: true } });
  revalidatePath("/app/baptisms");
  return { ok: true as const };
}

export async function updateBaptism(id: string, d: Details & { name?: string; notes?: string }) {
  const session = await requireSession();
  guardWrite(session);
  const cur = await db.baptism.findFirst({ where: { id, churchId: session.churchId }, select: { id: true } });
  if (!cur) return { ok: false as const, error: "Not found." };
  const extra = await extraAnswers(session.churchId, d.extra);
  await db.baptism.update({
    where: { id },
    data: { ...(d.name ? { name: clean(d.name, 80) } : {}), ...(extra ? { extra } : {}), date: parseDay(d.date), place: clean(d.place) || null, officiant: clean(d.officiant) || null, notes: clean(d.notes, 300) || null },
  });
  revalidatePath("/app/baptisms");
  return { ok: true as const };
}

export async function deleteBaptism(id: string) {
  const session = await requireSession();
  guardWrite(session);
  await moveToBin(session, "baptism", "Baptism", id, { label: "Baptism record" });
  await db.baptism.deleteMany({ where: { id, churchId: session.churchId } });
  revalidatePath("/app/baptisms");
  return { ok: true as const };
}

/* ───────────── Certificates ───────────── */

export async function saveCertSettings(s: Partial<CertSettings>) {
  const session = await requireSession();
  guardWrite(session);
  const merged: CertSettings = {
    template: clean(s.template, 40) || "classic",
    signer1: clean(s.signer1, 40), signer2: clean(s.signer2, 40), signer1Name: clean(s.signer1Name, 60), signer2Name: clean(s.signer2Name, 60),
    heading: clean(s.heading, 60) || DEFAULT_CERT_SETTINGS.heading,
    statement: clean(s.statement, 200) || DEFAULT_CERT_SETTINGS.statement,
    scripture: clean(s.scripture, 300),
  };
  await db.church.update({ where: { id: session.churchId }, data: { certSettings: merged as unknown as Prisma.InputJsonValue } });
  revalidatePath("/app/baptisms");
  return { ok: true as const };
}

const FONTS = new Set(["Cormorant Garamond", "Cinzel", "Playfair Display", "Great Vibes", "Montserrat", "Libre Baskerville", "EB Garamond", "Inter"]);

function cleanFields(raw: unknown): CertField[] {
  if (!Array.isArray(raw)) return [];
  const keys = new Set(["name", "date", "place", "officiant", "certificateNo", "church"]);
  return raw
    .map((f): CertField | null => {
      const o = f as Record<string, unknown>;
      const key = String(o.key ?? "");
      if (!keys.has(key)) return null;
      const n = (v: unknown, lo: number, hi: number, d: number) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
      const font = FONTS.has(String(o.font)) ? String(o.font) : "Cormorant Garamond";
      const color = /^#[0-9a-fA-F]{6}$/.test(String(o.color)) ? String(o.color) : "#1c1a16";
      const align = o.align === "left" || o.align === "right" ? o.align : "center";
      return { key, x: n(o.x, 0, 100, 10), y: n(o.y, 0, 100, 50), w: n(o.w, 5, 100, 50), size: n(o.size, 8, 120, 28), font, color, align, bold: !!o.bold };
    })
    .filter((f): f is CertField => !!f);
}

/** Save a certificate design the church uploaded (a picture of their blank certificate) and where each detail goes on it. */
export async function saveCertificateTemplate(input: { id?: string; name: string; imageDataUrl?: string; paper: string; fields: CertField[] }) {
  const session = await requireSession();
  guardWrite(session);
  const name = clean(input.name, 60);
  if (!name) return { ok: false as const, error: "Give the design a name." };
  const paper = input.paper === "a4-portrait" ? "a4-portrait" : "a4-landscape";
  const fields = cleanFields(input.fields);
  let imageUrl: string | undefined;
  if (input.imageDataUrl) {
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(input.imageDataUrl)) return { ok: false as const, error: "Upload a PNG or JPG picture of the certificate." };
    if (input.imageDataUrl.length > 6_500_000) return { ok: false as const, error: "That picture is too large. Please use one under 4 MB." };
    const { storeImage } = await import("@/lib/storage");
    imageUrl = (await storeImage(input.imageDataUrl, "certificates")) ?? input.imageDataUrl;
  }
  if (input.id) {
    const cur = await db.certificateTemplate.findFirst({ where: { id: input.id, churchId: session.churchId }, select: { id: true } });
    if (!cur) return { ok: false as const, error: "Design not found." };
    await db.certificateTemplate.update({ where: { id: input.id }, data: { name, paper, fields: fields as unknown as Prisma.InputJsonValue, ...(imageUrl ? { imageUrl } : {}) } });
    revalidatePath("/app/baptisms");
    return { ok: true as const, id: input.id };
  }
  if (!imageUrl) return { ok: false as const, error: "Upload the picture of your certificate first." };
  const made = await db.certificateTemplate.create({ data: { churchId: session.churchId, kind: "baptism", name, imageUrl, paper, fields: fields as unknown as Prisma.InputJsonValue } });
  revalidatePath("/app/baptisms");
  return { ok: true as const, id: made.id };
}

export async function deleteCertificateTemplate(id: string) {
  const session = await requireSession();
  guardWrite(session);
  await db.certificateTemplate.deleteMany({ where: { id, churchId: session.churchId } });
  const church = await db.church.findUnique({ where: { id: session.churchId }, select: { certSettings: true } });
  const s = (church?.certSettings as Partial<CertSettings> | null) ?? {};
  if (s.template === id) await db.church.update({ where: { id: session.churchId }, data: { certSettings: { ...s, template: "classic" } as unknown as Prisma.InputJsonValue } });
  revalidatePath("/app/baptisms");
  return { ok: true as const };
}
