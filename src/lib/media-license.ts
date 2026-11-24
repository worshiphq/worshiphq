import "server-only";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { signToken, readToken } from "@/lib/auth/tokens";
import { media } from "@/config/pricing";

/**
 * WorshipHQ Live licences. A church can use the Media app while Subscription.mediaUntil is in the future,
 * on at most Subscription.mediaSeats computers at once. The app signs in with a WorshipHQ account and keeps
 * working offline until the date in its last check (capped at 30 days after that check).
 */

const MEDIA_TOKEN_MS = 90 * 24 * 60 * 60 * 1000;
/** A computer not seen for this long no longer takes up a seat. */
const STALE_DEVICE_MS = 60 * 24 * 60 * 60 * 1000;

export type MediaAuth = { uid: string; cid: string; did: string };

export function signMediaToken(userId: string, churchId: string, deviceId: string, sessionVersion: number): string {
  return signToken("media", { uid: userId, cid: churchId, did: deviceId, sv: sessionVersion }, MEDIA_TOKEN_MS);
}

export async function verifyMediaToken(authHeader: string | null): Promise<MediaAuth | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const data = readToken<{ uid?: unknown; cid?: unknown; did?: unknown; sv?: unknown }>("media", authHeader.slice(7).trim());
  if (!data || typeof data.uid !== "string" || typeof data.cid !== "string" || typeof data.did !== "string") return null;
  const user = await db.user.findFirst({
    where: { id: data.uid, churchId: data.cid },
    select: { sessionVersion: true, church: { select: { suspended: true } } },
  });
  if (!user || user.church.suspended) return null;
  if (user.sessionVersion !== (typeof data.sv === "number" ? data.sv : -1)) return null;
  return { uid: data.uid, cid: data.cid, did: data.did };
}

/** We never store the raw hardware id. */
export function hashDeviceId(raw: string): string {
  return createHash("sha256").update(`whq-media:${raw}`).digest("hex").slice(0, 40);
}

export interface MediaEntitlement {
  active: boolean;
  until: string | null;
  isTrial: boolean;
  plan: string;
  seats: number;
}

export async function getMediaEntitlement(churchId: string): Promise<MediaEntitlement> {
  const sub = await db.subscription.findUnique({
    where: { churchId },
    select: { plan: true, status: true, renewsAt: true, mediaUntil: true, mediaIsTrial: true, mediaSeats: true },
  });
  let until = sub?.mediaUntil ?? null;
  // Promotion: churches paying for a plan use Media free (as a trial) until the promotion ends.
  const { getPlatformConfig } = await import("@/lib/data/platform-config");
  const { paidPlan } = await import("@/lib/plan-gate");
  const { windowLive, windowEnd } = await import("@/lib/promotions");
  const promo = (await getPlatformConfig()).promotions.mediaFree;
  const promoEnd = windowEnd(promo);
  if (sub && windowLive(promo) && paidPlan(sub) !== "free" && promoEnd && (!until || until < promoEnd)) {
    return { active: true, until: promoEnd.toISOString(), isTrial: true, plan: sub.plan, seats: sub.mediaSeats ?? media.computers };
  }
  return {
    active: !!until && until.getTime() > Date.now(),
    until: until?.toISOString() ?? null,
    isTrial: !!sub?.mediaIsTrial,
    plan: sub?.plan ?? "free",
    seats: sub?.mediaSeats ?? media.computers,
  };
}

/**
 * First sign-in of a church that never had Media: a free trial, once per church AND once per computer.
 * A computer that already gave some church a trial (even under another email, or after Windows was reinstalled)
 * gives no second one; the church can still buy Media. SuperAdmin › Media trials can let a computer try again.
 */
export async function startMediaTrialIfNew(churchId: string, machineId: string): Promise<"started" | "had" | "computer_used"> {
  const sub = await db.subscription.findUnique({ where: { churchId }, select: { mediaUntil: true, mediaTrialUsed: true } });
  if (sub?.mediaUntil || sub?.mediaTrialUsed) return "had";
  // Claiming the computer first (its id is the key) means two sign-ups at the same moment can't both get a trial.
  try {
    await db.mediaTrialMachine.create({ data: { machineId, churchId } });
  } catch {
    return "computer_used";
  }
  const until = new Date(Date.now() + media.trialDays * 24 * 60 * 60 * 1000);
  await db.subscription.upsert({
    where: { churchId },
    create: { churchId, mediaUntil: until, mediaIsTrial: true, mediaTrialUsed: true, mediaInterval: "trial" },
    update: { mediaUntil: until, mediaIsTrial: true, mediaTrialUsed: true, mediaInterval: "trial" },
  });
  return "started";
}

export type SeatResult =
  | { ok: true }
  | { ok: false; devices: { id: string; name: string; lastSeenAt: string }[]; seats: number };

/** Registers this computer, or explains which computers are using the church's seats. */
export async function claimSeat(opts: {
  churchId: string; deviceId: string; name: string; userId: string; seats: number; replaceId?: string;
}): Promise<SeatResult> {
  const { churchId, deviceId, name, userId, seats, replaceId } = opts;
  const existing = await db.mediaDevice.findUnique({ where: { churchId_deviceId: { churchId, deviceId } } });
  if (existing) {
    await db.mediaDevice.update({ where: { id: existing.id }, data: { lastSeenAt: new Date(), name, userId } });
    return { ok: true };
  }
  if (replaceId) await db.mediaDevice.deleteMany({ where: { id: replaceId, churchId } });

  const since = new Date(Date.now() - STALE_DEVICE_MS);
  const inUse = await db.mediaDevice.findMany({
    where: { churchId, lastSeenAt: { gt: since } },
    orderBy: { lastSeenAt: "desc" },
  });
  if (inUse.length >= seats) {
    return {
      ok: false,
      seats,
      devices: inUse.map((d) => ({ id: d.id, name: d.name, lastSeenAt: d.lastSeenAt.toISOString() })),
    };
  }
  // Old computers that haven't been used in 60 days give their seat back.
  await db.mediaDevice.deleteMany({ where: { churchId, lastSeenAt: { lte: since } } });
  await db.mediaDevice.create({ data: { churchId, deviceId, name, userId } });
  return { ok: true };
}

/** The Media app is called from its own window (another origin), and uses tokens, not cookies. */
export const MEDIA_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

/**
 * After a password or a new account checks out: start the trial if the church never had Media, take a seat for this
 * computer and hand the app its token. Shared by sign-in and in-app sign-up.
 */
export async function finishMediaSignIn(opts: {
  user: { id: string; churchId: string; name: string | null; email: string | null; sessionVersion: number; church: { name: string } };
  rawDevice: string; deviceName: string; replaceId?: string;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const { user, rawDevice, deviceName, replaceId } = opts;
  const deviceId = hashDeviceId(rawDevice);
  const trial = await startMediaTrialIfNew(user.churchId, deviceId);
  const ent = await getMediaEntitlement(user.churchId);
  if (ent.active) {
    const seat = await claimSeat({ churchId: user.churchId, deviceId, name: deviceName, userId: user.id, seats: ent.seats, replaceId });
    if (!seat.ok) {
      return {
        status: 409,
        body: { error: `${user.church.name} is already using WorshipHQ Live on ${seat.seats} computers.`, code: "seats_full", devices: seat.devices },
      };
    }
  }
  return {
    status: 200,
    body: {
      token: signMediaToken(user.id, user.churchId, deviceId, user.sessionVersion),
      church: { id: user.churchId, name: user.church.name },
      user: { name: user.name, email: user.email },
      media: { ...ent, trialBlocked: trial === "computer_used" && !ent.active },
      licence: await signMediaLicence({ churchId: user.churchId, churchName: user.church.name, deviceId, ent }),
      checkedAt: new Date().toISOString(),
    },
  };
}

/* ───────────── The licence stamp ───────────── */

const LICENCE_DAYS = 30;

/**
 * A licence for one computer, signed with WorshipHQ's private key (Ed25519). The app checks it with the public key
 * built into it, so nobody can make a licence without our server. It lasts until the subscription ends, but never
 * more than 30 days ahead: the app renews it by itself whenever it is online.
 * Format: base64url(JSON) + "." + base64url(signature).
 */
export async function signMediaLicence(opts: { churchId: string; churchName: string; deviceId: string; ent: MediaEntitlement }): Promise<string | null> {
  const { env } = await import("@/lib/env");
  if (!env.MEDIA_LICENCE_PRIVATE_KEY || !opts.ent.active || !opts.ent.until) return null;
  const { createPrivateKey, sign } = await import("crypto");
  const key = createPrivateKey({ key: Buffer.from(env.MEDIA_LICENCE_PRIVATE_KEY, "base64"), format: "der", type: "pkcs8" });
  const now = Math.floor(Date.now() / 1000);
  const exp = Math.min(Math.floor(new Date(opts.ent.until).getTime() / 1000), now + LICENCE_DAYS * 86400);
  const payload = Buffer.from(JSON.stringify({
    v: 1, cid: opts.churchId, church: opts.churchName, did: opts.deviceId,
    iat: now, exp, until: opts.ent.until, trial: opts.ent.isTrial, seats: opts.ent.seats,
  }));
  return `${payload.toString("base64url")}.${sign(null, payload, key).toString("base64url")}`;
}
