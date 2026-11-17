import "server-only";
import { after } from "next/server";
import { db } from "@/lib/db";
import { INTERNAL_SLUG_PREFIX } from "@/lib/live-church";

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "church"
  );
}

async function uniqueSlug(base: string) {
  // The zz-qa- prefix is reserved for the hidden internal QA church.
  if (base.startsWith(INTERNAL_SLUG_PREFIX)) base = base.replace(/^zz-qa-/, "zz-qa");
  let slug = base;
  let n = 1;
  while (await db.church.findUnique({ where: { slug } })) slug = `${base}-${++n}`;
  return slug;
}

export type NewChurch = {
  churchName: string;
  city?: string;
  country?: string;
  name: string;
  email: string;
  /** null for an account made with Google: it has no password until the person adds one. */
  passwordHash: string | null;
  phone: string;
  phoneVerified: boolean;
  emailVerified: boolean;
  heardFrom?: string;
  heardDetail?: string;
};

/**
 * Creates a church, its Main Branch, its Free subscription (with the SMS trial) and its Main Admin, then sends the
 * welcome email. Shared by the code sign-up and the Google sign-up so the two can never drift apart.
 */
export async function createChurchWithOwner(p: NewChurch): Promise<{ churchId: string; userId: string }> {
  const slug = await uniqueSlug(slugify(p.churchName));
  const church = await db.church.create({
    data: {
      slug,
      name: p.churchName,
      city: p.city || null,
      country: p.country || "Ghana",
      // Outside Ghana the free credits are international ones, worth the same as Ghana's 30.
      smsCredits: await (await import("@/lib/sms/intl")).signupCreditsFor(p.country || "Ghana"),
      termsAcceptedAt: new Date(),
      heardFrom: p.heardFrom || null,
      heardFromDetail: p.heardDetail || null,
      branches: { create: { name: "Main Branch", isHQ: true } },
    },
    select: { id: true },
  });

  // Every new church gets the free Communications (SMS) trial straight away, with the 30 credits it starts with.
  // Its length comes from SuperAdmin (Free trials), never more than 14 days. Switched off there = no trial.
  const { getPlatformConfig } = await import("@/lib/data/platform-config");
  const { COMMS_TRIAL_MAX_DAYS } = await import("@/lib/trial-settings");
  const comms = (await getPlatformConfig()).trials.comms;
  const commsStart = new Date();
  const commsEnd = comms.enabled ? new Date(commsStart.getTime() + Math.min(COMMS_TRIAL_MAX_DAYS, comms.days) * 86_400_000) : null;
  await db.subscription.create({
    data: {
      churchId: church.id, plan: "free", interval: "monthly", status: "active",
      ...(commsEnd ? { commsTrialStartedAt: commsStart, commsTrialEndsAt: commsEnd } : {}),
    },
  });

  const user = await db.user.create({
    data: {
      churchId: church.id,
      email: p.email,
      name: p.name,
      passwordHash: p.passwordHash,
      phone: p.phone || null,
      phoneVerified: p.phoneVerified,
      emailVerified: p.emailVerified,
      role: "Owner",
    },
    select: { id: true },
  });

  // Welcome email to the new owner. Runs after the response is sent, and can never break or slow signup.
  after(async () => {
    try {
      const { alertOwnerOfSignup } = await import("@/lib/outreach/owner-alert");
      await alertOwnerOfSignup(church.id);
    } catch (e) {
      console.error("[signup alert]", (e as Error).message);
    }
    try {
      const { sendWelcome } = await import("@/lib/outreach/send");
      await sendWelcome(church.id, true);
    } catch (e) {
      console.error("[welcome email]", (e as Error).message);
    }
  });

  return { churchId: church.id, userId: user.id };
}
