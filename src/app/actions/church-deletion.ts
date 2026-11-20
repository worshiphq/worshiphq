"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { sendOtp, verifyOtp } from "@/lib/auth/otp";
import { rateLimit, HOUR } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/integrations/email";
import { escapeHtml } from "@/lib/html";
import { brand } from "@/config/brand";
import { DELETE_PHRASE, deletionDate } from "@/lib/church-deletion";

type Fail = { ok: false; error: string };

/** Only the Main Admin of a real church, signed in as themselves (not support, not the demo). */
async function ownerOnly() {
  const session = await requireSession();
  if (session.isDemo) return { error: "The demo church can't be deleted." } as const;
  if (session.impersonating) return { error: "Support can't delete a church. The Main Admin has to do it." } as const;
  if (session.role !== "Owner") return { error: "Only the Main Admin can delete the church." } as const;
  return { session } as const;
}

const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Accra" });

/**
 * Step 1 and 2: the typed phrase and the password (a Google-only account has no password and skips it).
 * Both right: a code goes to the Main Admin's email. Nothing is deleted yet.
 */
export async function startChurchDeletion(input: { phrase: string; password?: string }): Promise<{ ok: true; verificationId: string; sentTo: string; devCode?: string } | Fail> {
  const who = await ownerOnly();
  if ("error" in who) return { ok: false, error: who.error! };
  const { session } = who;

  if (String(input.phrase ?? "").trim().toLowerCase() !== DELETE_PHRASE) return { ok: false, error: `Type "${DELETE_PHRASE}" exactly to continue.` };
  if (!(await rateLimit(`del-church:${session.userId}`, 6, HOUR))) return { ok: false, error: "Too many tries. Please wait an hour and try again." };

  const user = await db.user.findUnique({ where: { id: session.userId }, select: { email: true, passwordHash: true } });
  if (!user) return { ok: false, error: "Account not found." };
  if (user.passwordHash) {
    const good = input.password ? await bcrypt.compare(input.password, user.passwordHash) : false;
    if (!good) return { ok: false, error: "That password is not right." };
  }

  const sent = await sendOtp({ purpose: "delete-church", channel: "email", email: user.email, userId: session.userId });
  if (!sent.ok || !sent.verificationId) return { ok: false, error: sent.error ?? "We couldn't send the code. Please try again." };
  return { ok: true, verificationId: sent.verificationId, sentTo: sent.sentToMasked ?? user.email, ...(sent.devCode ? { devCode: sent.devCode } : {}) };
}

/** Step 3: the emailed code. The church closes now and is permanently deleted after the recovery window. */
export async function confirmChurchDeletion(input: { verificationId: string; code: string }): Promise<{ ok: true; deleteAfter: string } | Fail> {
  const who = await ownerOnly();
  if ("error" in who) return { ok: false, error: who.error! };
  const { session } = who;

  const v = await verifyOtp(input.verificationId, String(input.code ?? ""), { purpose: "delete-church", userId: session.userId });
  if (!v.ok) return { ok: false, error: v.error ?? "That code is not right." };

  const now = new Date();
  const after = deletionDate(now);
  await db.church.update({ where: { id: session.churchId }, data: { suspended: true, deletionRequestedAt: now, deleteAfter: after } });
  // Nothing renews while the church is closed.
  await db.subscription.updateMany({ where: { churchId: session.churchId }, data: { autoRenew: false } });
  await audit(session, "delete", "church", `Main Admin asked to delete the church. Permanent deletion on ${fmt(after)}.`, session.churchId);

  const owner = await db.user.findUnique({ where: { id: session.userId }, select: { email: true, name: true } });
  if (owner?.email) {
    await sendEmail({
      to: owner.email,
      subject: `Your ${brand.name} church account is scheduled for deletion`,
      private: true,
      html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#222">
        <p>Hello ${escapeHtml(owner.name || "there")},</p>
        <p>As you asked, <b>${escapeHtml(session.churchName)}</b> has been closed on ${brand.name}. It will be <b>permanently deleted on ${fmt(after)}</b>.</p>
        <p>Changed your mind? Sign in at ${escapeHtml(brand.url)} before then and choose <b>Restore my church</b>. Everything will be just as you left it.</p>
        <p>If you did not ask for this, sign in and restore it straight away, then change your password.</p>
        <p>God Bless You!<br>The ${brand.name} team</p></div>`,
    }).catch(() => {});
  }

  revalidatePath("/app", "layout");
  return { ok: true, deleteAfter: after.toISOString() };
}

/** Within the recovery window the Main Admin can bring the church back. */
export async function restoreChurch(): Promise<{ ok: true } | Fail> {
  const who = await ownerOnly();
  if ("error" in who) return { ok: false, error: who.error! };
  const { session } = who;

  const church = await db.church.findUnique({ where: { id: session.churchId }, select: { deletionRequestedAt: true, deleteAfter: true } });
  if (!church?.deletionRequestedAt) return { ok: false, error: "This church is not scheduled for deletion." };
  if (church.deleteAfter && church.deleteAfter < new Date()) return { ok: false, error: "The recovery window has ended." };

  await db.church.update({ where: { id: session.churchId }, data: { suspended: false, deletionRequestedAt: null, deleteAfter: null } });
  await audit(session, "update", "church", "Main Admin restored the church before deletion.", session.churchId);
  revalidatePath("/app", "layout");
  return { ok: true };
}
