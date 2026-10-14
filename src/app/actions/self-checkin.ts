"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { requireSession, assertCanWrite } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { sendChurchSms } from "@/lib/sms/credits";
import { routeAutoSession } from "@/lib/attendance/service-times";
import { categoryForPerson, type AttendanceCategory } from "@/lib/data/attendance";
import { phoneKey } from "@/lib/search";
import { DEFAULT_TEMPLATES } from "@/lib/automations/run";

const CATEGORY_FIELD: Record<AttendanceCategory, "adults" | "teens" | "children" | "visitors"> = {
  adult: "adults", teen: "teens", child: "children", visitor: "visitors",
};

/* ───────────────────────── Staff: the rules ───────────────────────── */

export type SelfCheckInRules = {
  verify: "none" | "digits" | "sms";
  geoOn: boolean;
  geoLat: number | null;
  geoLng: number | null;
  geoRadius: number;
  deviceLimit: number;
};

export async function getSelfCheckInRules(): Promise<SelfCheckInRules> {
  const session = await requireSession();
  const c = await db.church.findUnique({ where: { id: session.churchId }, select: { qrVerify: true, qrGeoOn: true, qrGeoLat: true, qrGeoLng: true, qrGeoRadius: true, qrDeviceLimit: true } });
  return {
    verify: c?.qrVerify === "digits" || c?.qrVerify === "sms" ? c.qrVerify : "none",
    geoOn: c?.qrGeoOn ?? false, geoLat: c?.qrGeoLat ?? null, geoLng: c?.qrGeoLng ?? null,
    geoRadius: c?.qrGeoRadius ?? 250, deviceLimit: c?.qrDeviceLimit ?? 0,
  };
}

export async function saveSelfCheckInRules(input: SelfCheckInRules) {
  const session = await requireSession();
  assertCanWrite(session, "attendance");
  if (session.isDemo) return { ok: false as const, error: "Read-only demo." };
  if (input.geoOn && (input.geoLat == null || input.geoLng == null)) {
    return { ok: false as const, error: "Set the church location first, then switch the location check on." };
  }
  const verify = input.verify === "digits" || input.verify === "sms" ? input.verify : "none";
  await db.church.update({
    where: { id: session.churchId },
    data: {
      qrVerify: verify,
      qrGeoOn: !!input.geoOn,
      qrGeoLat: input.geoLat, qrGeoLng: input.geoLng,
      qrGeoRadius: Math.min(5000, Math.max(50, Math.round(input.geoRadius) || 250)),
      qrDeviceLimit: Math.min(50, Math.max(0, Math.round(input.deviceLimit) || 0)),
    },
  });
  await audit(session, "update", "settings", `Changed QR check-in rules (verify: ${verify}, location ${input.geoOn ? "on" : "off"}, per phone: ${input.deviceLimit || "no limit"})`);
  revalidatePath("/app/attendance");
  revalidatePath("/app/settings");
  return { ok: true as const };
}

/* ───────────────────────── Public: the check-in itself ───────────────────────── */

type Ctx = {
  sess: { id: string; serviceName: string; branchId: string | null };
  church: { id: string; name: string; qrVerify: string; qrGeoOn: boolean; qrGeoLat: number | null; qrGeoLng: number | null; qrGeoRadius: number; qrDeviceLimit: number };
};
type Where = { deviceId?: string; lat?: number; lng?: number };

async function load(sessionId: string): Promise<Ctx | null> {
  const linked = await db.attendanceSession.findUnique({
    where: { id: String(sessionId || "") },
    include: { church: { select: { id: true, name: true, isDemo: true, qrVerify: true, qrGeoOn: true, qrGeoLat: true, qrGeoLng: true, qrGeoRadius: true, qrDeviceLimit: true } } },
  });
  if (!linked || linked.church.isDemo) return null;
  // A QR printed for a scheduled service keeps working: the check-in goes to whichever service is on now.
  const sess = await routeAutoSession(linked);
  return { sess: { id: sess.id, serviceName: sess.serviceName, branchId: sess.branchId }, church: linked.church };
}

const metres = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad, dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/** The rules that apply to every self check-in: be at the church, and do not check in more people than one phone is allowed. */
async function guard(ctx: Ctx, where: Where, adding = true): Promise<string | null> {
  const c = ctx.church;
  if (c.qrGeoOn && c.qrGeoLat != null && c.qrGeoLng != null) {
    if (where.lat == null || where.lng == null) return "Please allow location access so we can see you are at church, then try again.";
    if (metres(c.qrGeoLat, c.qrGeoLng, where.lat, where.lng) > c.qrGeoRadius) return `You need to be at ${c.name} to check in. If you are here, ask an usher to check you in.`;
  }
  if (adding && c.qrDeviceLimit > 0 && where.deviceId) {
    const used = await db.attendanceRecord.count({ where: { sessionId: ctx.sess.id, method: "self", deviceId: where.deviceId } });
    if (used >= c.qrDeviceLimit) return `This phone has already checked in ${used} ${used === 1 ? "person" : "people"}, which is the most allowed. Please ask an usher to help.`;
  }
  return null;
}

const clean = (v: unknown, max = 80) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);
const shortName = (first: string, last: string) => `${first}${last ? ` ${last.charAt(0).toUpperCase()}.` : ""}`;
const hashCode = (personId: string, code: string) => crypto.createHmac("sha256", env.NEXTAUTH_SECRET ?? "dev").update(`${personId}:${code}`).digest("hex");

export type Candidate = { id: string; name: string; hint: string | null; visitor: boolean };

/** Find yourself by name or phone. Only a short name and the end of the phone number are shown, never the whole roster. */
export async function findForCheckIn(input: { sessionId: string; query: string } & Where): Promise<{ ok: true; people: Candidate[] } | { ok: false; error: string }> {
  const ctx = await load(input.sessionId);
  if (!ctx) return { ok: false, error: "This check-in link is not available." };
  const bad = await guard(ctx, input, false);
  if (bad) return { ok: false, error: bad };
  const q = clean(input.query, 60);
  if (q.length < 3) return { ok: true, people: [] };

  const tokens = /^[+\d][\d\s\-()]*$/.test(q) ? [q.replace(/[\s\-()]/g, "")] : q.split(/\s+/).filter(Boolean).slice(0, 4);
  const rows = await db.person.findMany({
    where: {
      churchId: ctx.church.id,
      status: { in: ["active", "visitor"] },
      OR: [{ ageGroup: null }, { ageGroup: { not: "child" } }],
      AND: tokens.map((t) => ({
        OR: [
          { firstName: { contains: t, mode: "insensitive" as const } },
          { lastName: { contains: t, mode: "insensitive" as const } },
          ...(phoneKey(t).length >= 4 && /^[+\d][\d\-()]*$/.test(t) ? [{ phone: { contains: phoneKey(t) } }] : []),
        ],
      })),
    },
    select: { id: true, firstName: true, lastName: true, phone: true, status: true },
    orderBy: { firstName: "asc" },
    take: 6,
  });
  return {
    ok: true,
    people: rows.map((p) => ({ id: p.id, name: shortName(p.firstName, p.lastName), hint: p.phone ? `phone ends ${phoneKey(p.phone).slice(-3)}` : null, visitor: p.status === "visitor" })),
  };
}

/** Text a one-time code to the phone we have on file (when the church asks for that). */
export async function sendCheckInCode(input: { sessionId: string; personId: string } & Where): Promise<{ ok: true; sentTo: string } | { ok: false; error: string }> {
  const ctx = await load(input.sessionId);
  if (!ctx) return { ok: false, error: "This check-in link is not available." };
  const bad = await guard(ctx, input);
  if (bad) return { ok: false, error: bad };
  const person = await db.person.findFirst({ where: { id: input.personId, churchId: ctx.church.id, status: { in: ["active", "visitor"] } }, select: { id: true, phone: true } });
  if (!person?.phone) return { ok: false, error: "We do not have a phone number for you. Please ask an usher to check you in." };

  const recent = await db.selfCheckInCode.count({ where: { churchId: ctx.church.id, personId: person.id, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
  if (recent >= 3) return { ok: false, error: "A code was already sent. Please wait a few minutes, or ask an usher." };

  const code = String(crypto.randomInt(100000, 1000000));
  await db.selfCheckInCode.create({ data: { churchId: ctx.church.id, personId: person.id, sessionId: ctx.sess.id, codeHash: hashCode(person.id, code), expiresAt: new Date(Date.now() + 10 * 60_000) } });
  const res = await sendChurchSms(ctx.church.id, person.phone, `${code} is your check-in code for ${ctx.church.name}. It works for 10 minutes. Do not share it.`, { note: "Check-in code" });
  if (!res.ok) return { ok: false, error: res.insufficient ? "Check-in by code is not available right now. Please ask an usher." : "We could not send the code. Please ask an usher." };
  return { ok: true, sentTo: `phone ending ${phoneKey(person.phone).slice(-3)}` };
}

/** Check yourself in, after the church's rules have been satisfied. */
export async function completeCheckIn(input: { sessionId: string; personId: string; digits?: string; code?: string } & Where): Promise<{ ok: true; sessionId: string; already?: boolean } | { ok: false; error: string }> {
  const ctx = await load(input.sessionId);
  if (!ctx) return { ok: false, error: "This check-in link is not available." };
  const person = await db.person.findFirst({
    where: { id: input.personId, churchId: ctx.church.id, status: { in: ["active", "visitor"] } },
    select: { id: true, status: true, dateOfBirth: true, birthday: true, phone: true },
  });
  if (!person) return { ok: false, error: "We could not find you. Please try again or ask an usher." };

  const dup = await db.attendanceRecord.findFirst({ where: { sessionId: ctx.sess.id, personId: person.id }, select: { id: true } });
  if (dup) return { ok: true, sessionId: ctx.sess.id, already: true };

  const bad = await guard(ctx, input);
  if (bad) return { ok: false, error: bad };

  let verifiedBy: string | null = null;
  if (ctx.church.qrVerify === "digits") {
    if (!person.phone) return { ok: false, error: "We do not have a phone number for you. Please ask an usher to check you in." };
    const want = phoneKey(person.phone).slice(-3);
    if (clean(input.digits, 8).replace(/\D/g, "").slice(-3) !== want) return { ok: false, error: "Those digits do not match. Please try again." };
    verifiedBy = "digits";
  } else if (ctx.church.qrVerify === "sms") {
    const row = await db.selfCheckInCode.findFirst({ where: { churchId: ctx.church.id, personId: person.id, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
    if (!row || row.attempts >= 5) return { ok: false, error: "Please ask for a new code." };
    await db.selfCheckInCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    const given = clean(input.code, 8).replace(/\D/g, "");
    if (!given || !crypto.timingSafeEqual(Buffer.from(row.codeHash), Buffer.from(hashCode(person.id, given)))) return { ok: false, error: "That code is not right. Please try again." };
    await db.selfCheckInCode.deleteMany({ where: { churchId: ctx.church.id, personId: person.id } });
    verifiedBy = "sms";
  }

  const category = categoryForPerson(person);
  await db.attendanceRecord.create({
    data: {
      churchId: ctx.church.id, branchId: ctx.sess.branchId ?? undefined, personId: person.id, sessionId: ctx.sess.id,
      category, serviceName: ctx.sess.serviceName, date: new Date(), method: "self",
      deviceId: clean(input.deviceId, 64) || null, verifiedBy,
    },
  });
  await db.attendanceSession.update({ where: { id: ctx.sess.id }, data: { [CATEGORY_FIELD[category]]: { increment: 1 } } });
  // Coming back counts as another visit for a visitor, so they can be welcomed back after the service.
  if (person.status === "visitor") {
    await db.visitor.updateMany({ where: { personId: person.id }, data: { visitCount: { increment: 1 }, lastVisit: new Date() } });
  }
  return { ok: true, sessionId: ctx.sess.id };
}

/** First time here: a short form, then straight into the register. If the phone number is already known, they are welcomed back instead. */
export async function checkInNewVisitor(input: { sessionId: string; firstName: string; lastName: string; phone: string; purpose?: string } & Where): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> {
  const ctx = await load(input.sessionId);
  if (!ctx) return { ok: false, error: "This check-in link is not available." };
  const bad = await guard(ctx, input);
  if (bad) return { ok: false, error: bad };
  const firstName = clean(input.firstName, 50), lastName = clean(input.lastName, 50), phone = clean(input.phone, 25);
  if (!firstName || !lastName) return { ok: false, error: "Please enter your first and last name." };
  if (phoneKey(phone).length < 9) return { ok: false, error: "Please enter your phone number so we can welcome you." };

  // Already known by this number? Then they are not new.
  const known = await db.person.findFirst({ where: { churchId: ctx.church.id, phone: { contains: phoneKey(phone) }, status: { in: ["active", "visitor"] } }, select: { id: true } });
  if (known) {
    // The church asks people to confirm who they are, so a typed number is not enough to check in as someone we already know.
    if (ctx.church.qrVerify !== "none") return { ok: false, error: "We already know this number. Please go back and search for your name, so we can confirm it is you." };
    return { ...(await completeCheckInForNew(ctx, known.id, input)) };
  }

  const purpose = clean(input.purpose, 120) || null;
  const person = await db.person.create({ data: { churchId: ctx.church.id, firstName, lastName, phone, status: "visitor" } });
  const visitor = await db.visitor.create({ data: { churchId: ctx.church.id, personId: person.id, firstName, lastName, phone, purpose } });
  const { createAutoFollowUp } = await import("@/lib/follow-ups/auto");
  await createAutoFollowUp({ churchId: ctx.church.id, type: "new_visitor", visitorId: visitor.id, title: `Follow up with visitor ${firstName} ${lastName}`.trim(), note: purpose ? `Purpose: ${purpose}` : null, dueInDays: 2 });

  await db.attendanceRecord.create({
    data: { churchId: ctx.church.id, branchId: ctx.sess.branchId ?? undefined, personId: person.id, sessionId: ctx.sess.id, category: "visitor", serviceName: ctx.sess.serviceName, date: new Date(), method: "self", deviceId: clean(input.deviceId, 64) || null },
  });
  await db.attendanceSession.update({ where: { id: ctx.sess.id }, data: { visitors: { increment: 1 } } });

  // First-visit welcome text, exactly as the visitor form does it.
  const settings = await db.church.findUnique({ where: { id: ctx.church.id }, select: { smsWelcomeVisitor: true } });
  if (settings?.smsWelcomeVisitor) {
    const a = await db.automation.findFirst({ where: { churchId: ctx.church.id, trigger: "visitor_followup" }, select: { messageTemplate: true } });
    const msg = (a?.messageTemplate || DEFAULT_TEMPLATES.visitor_followup).replace(/\{name\}/g, firstName).replace(/\{church\}/g, ctx.church.name);
    const r = await sendChurchSms(ctx.church.id, phone, msg, { note: "First visit welcome" });
    if (r.ok) await db.visitor.update({ where: { id: visitor.id }, data: { welcomeSmsSentAt: new Date() } });
  }
  return { ok: true, sessionId: ctx.sess.id };
}

/** A person who typed a number we already know: check them in as themselves (a returning visitor or member) without creating a duplicate. */
async function completeCheckInForNew(ctx: Ctx, personId: string, where: Where): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> {
  const dup = await db.attendanceRecord.findFirst({ where: { sessionId: ctx.sess.id, personId }, select: { id: true } });
  if (dup) return { ok: true, sessionId: ctx.sess.id };
  const person = await db.person.findUnique({ where: { id: personId }, select: { id: true, status: true, dateOfBirth: true, birthday: true } });
  if (!person) return { ok: false, error: "Please try again." };
  const category = categoryForPerson(person);
  await db.attendanceRecord.create({
    data: { churchId: ctx.church.id, branchId: ctx.sess.branchId ?? undefined, personId, sessionId: ctx.sess.id, category, serviceName: ctx.sess.serviceName, date: new Date(), method: "self", deviceId: clean(where.deviceId, 64) || null },
  });
  await db.attendanceSession.update({ where: { id: ctx.sess.id }, data: { [CATEGORY_FIELD[category]]: { increment: 1 } } });
  if (person.status === "visitor") await db.visitor.updateMany({ where: { personId }, data: { visitCount: { increment: 1 }, lastVisit: new Date() } });
  return { ok: true, sessionId: ctx.sess.id };
}
