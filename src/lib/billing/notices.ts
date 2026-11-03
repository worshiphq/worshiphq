import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/integrations/email";
import { sendSms } from "@/lib/integrations/sms";
import { escapeHtml } from "@/lib/html";
import { logBillingEvent, type BillingEventKind } from "@/lib/billing/events";

/**
 * Messages from the billing system to a church: "your plan renews soon", "it expired", "we could not
 * charge your card".
 *
 * These used to be sent through the church's OWN SMS credits. That failed in three quiet ways: a church
 * with no credits (the usual case on a paid plan that has just lapsed) got nothing; the failure was
 * swallowed; and the reminder was still marked as sent, so it never tried again. Now:
 *   - they come from the platform, like a sign-in code, so the church's wallet is never involved;
 *   - they go by email AND text, so a dead phone or a missed inbox is not the end of it;
 *   - the caller learns whether anything was actually delivered and only marks a reminder as sent if so;
 *   - every one is written to the billing log, which the SuperAdmin renewals page shows.
 */

export type ChurchNotice = {
  kind: BillingEventKind;
  /** Short line for the billing log and the email subject. */
  title: string;
  /** The text message. Keep it to one segment where possible: the platform pays for each. */
  sms: string;
  /** Plain paragraphs for the email body. */
  paragraphs: string[];
  /** Also text the Main Admin. Default true; set false for things that need no phone nudge. */
  textToo?: boolean;
};

export const billingUrl = () => `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/app/settings?tab=billing`;

/** A real address, not the placeholder made for a team member who was invited by phone only. */
const realEmail = (e: string | null | undefined) => !!e && !e.endsWith("@invite.worshiphq.app");

export async function noticeChurch(churchId: string, n: ChurchNotice): Promise<{ delivered: boolean; channels: string[] }> {
  const church = await db.church.findUnique({ where: { id: churchId }, select: { name: true } });
  const owners = await db.user.findMany({ where: { churchId, role: "Owner" }, select: { email: true, phone: true, name: true } });

  const channels: string[] = [];
  const url = billingUrl();

  const emails = [...new Set(owners.map((o) => o.email).filter(realEmail))] as string[];
  if (emails.length) {
    try {
      const res = await sendEmail({
        to: emails,
        subject: n.title,
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#1c1a16">
            <h2 style="margin:0 0 12px;color:#0d7377">${escapeHtml(n.title)}</h2>
            ${n.paragraphs.map((p) => `<p style="line-height:1.55">${escapeHtml(p)}</p>`).join("")}
            <p style="margin:22px 0"><a href="${url}" style="background:#0d7377;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">Open billing</a></p>
            <p style="color:#999;font-size:12px">${escapeHtml(church?.name ?? "Your church")} on WorshipHQ. You receive this because you are the Main Admin.</p>
          </div>`,
      });
      if (res.ok) channels.push("email");
    } catch (e) {
      console.error("[billing notice email]", (e as Error).message);
    }
  }

  if (n.textToo !== false) {
    const phones = [...new Set(owners.map((o) => o.phone).filter((p): p is string => !!p))];
    for (const phone of phones.slice(0, 2)) {
      try {
        const res = await sendSms(phone, n.sms, { heading: null });
        if (res.ok && !channels.includes("sms")) channels.push("sms");
      } catch (e) {
        console.error("[billing notice sms]", (e as Error).message);
      }
    }
  }

  const delivered = channels.length > 0;
  await logBillingEvent(churchId, { kind: n.kind, title: n.title, detail: n.sms, channels, delivered });
  return { delivered, channels };
}

const dateText = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export const notices = {
  /** A manual renewal is coming up: the church must act. */
  renewSoon(plan: string, daysLeft: number, endsOn: Date): ChurchNotice {
    const when = daysLeft <= 1 ? "tomorrow" : `in ${daysLeft} days`;
    return {
      kind: "reminder",
      title: `Your WorshipHQ ${plan} plan ends ${when}`,
      sms: `WorshipHQ: your ${plan} plan ends ${dateText(endsOn)}. Renew before then so nothing stops: ${billingUrl()}`,
      paragraphs: [
        `Your ${plan} plan ends on ${dateText(endsOn)}.`,
        "You can renew now, and the new period carries on from your end date, so you lose no days by renewing early.",
        "If it is not renewed, you get a short grace period, then your church moves to the Free plan. Nothing you have entered is deleted.",
      ],
    };
  },
  /** An automatic renewal is coming up: a heads-up, nothing to do. */
  willAutoRenew(plan: string, endsOn: Date, last4: string, amountText: string): ChurchNotice {
    return {
      kind: "reminder",
      title: `Your WorshipHQ ${plan} plan renews automatically on ${dateText(endsOn)}`,
      sms: `WorshipHQ: your ${plan} plan renews on ${dateText(endsOn)}. We will charge your card ending ${last4} (${amountText}). Manage: ${billingUrl()}`,
      paragraphs: [
        `Your ${plan} plan renews automatically on ${dateText(endsOn)}.`,
        `We will charge ${amountText} to your card ending ${last4}. You do not need to do anything.`,
        "To change the card or turn automatic renewal off, open Billing before then.",
      ],
    };
  },
  autoRenewed(plan: string, amountText: string, nextEnd: Date): ChurchNotice {
    return {
      kind: "auto_renewed",
      title: `Your WorshipHQ ${plan} plan was renewed`,
      sms: `WorshipHQ: your ${plan} plan was renewed automatically (${amountText}). It now runs to ${dateText(nextEnd)}. Thank you!`,
      paragraphs: [`Your ${plan} plan was renewed automatically for ${amountText}. It now runs until ${dateText(nextEnd)}.`, "A receipt has been sent to you separately."],
    };
  },
  autoRenewFailed(plan: string, last4: string, tryAgain: boolean): ChurchNotice {
    return {
      kind: "auto_renew_failed",
      title: `We could not renew your WorshipHQ ${plan} plan`,
      sms: `WorshipHQ: we could not charge your card ending ${last4} to renew your ${plan} plan. ${tryAgain ? "We will try again. " : ""}Please renew or update your card: ${billingUrl()}`,
      paragraphs: [
        `We tried to renew your ${plan} plan automatically, but the payment on the card ending ${last4} did not go through.`,
        tryAgain ? "We will try again over the next few days. You can also renew now, or choose another card, in Billing." : "Please renew in Billing, or save a different card, so your features are not interrupted.",
      ],
    };
  },
  expired(plan: string, graceDays: number): ChurchNotice {
    return {
      kind: "expired",
      title: `Your WorshipHQ ${plan} plan has expired`,
      sms: `WorshipHQ: your ${plan} plan has expired. Renew within ${graceDays} days to keep your features: ${billingUrl()}`,
      paragraphs: [
        `Your ${plan} plan has expired. You have ${graceDays} days to renew before your church moves to the Free plan.`,
        "Everything you have entered is kept. If you renew, you pick up exactly where you left off.",
      ],
    };
  },
  lapsed(): ChurchNotice {
    return {
      kind: "lapsed",
      title: "Your WorshipHQ church is now on the Free plan",
      sms: `WorshipHQ: your subscription has ended and your church is now on the Free plan. Nothing was deleted. Resubscribe any time: ${billingUrl()}`,
      paragraphs: [
        "Your subscription has ended and your church is now on the Free plan.",
        "Nothing you entered was deleted. Your records are kept and you can download them at any time. Resubscribe whenever you are ready and your features come back.",
      ],
    };
  },
  downgraded(plan: string, graceDays: number): ChurchNotice {
    const toFree = plan === "Free";
    return {
      kind: "downgraded",
      title: toFree ? "Your WorshipHQ plan has moved to Free" : `Your WorshipHQ plan has moved to ${plan}`,
      sms: toFree
        ? `WorshipHQ: your plan has moved to Free as scheduled. Nothing was deleted.`
        : `WorshipHQ: your plan has moved to ${plan} as scheduled. Renew within ${graceDays} days to keep it: ${billingUrl()}`,
      paragraphs: toFree
        ? ["Your plan has moved to Free, as you scheduled. Nothing you entered was deleted."]
        : [`Your plan has moved to ${plan}, as you scheduled.`, `Renew within ${graceDays} days to keep it.`],
    };
  },
};
