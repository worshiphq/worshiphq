import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/marketing/legal-page";
import { getRefundPolicy } from "@/lib/billing/refunds";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: "Refund Policy",
  description: "When and how you can request a refund on your WorshipHQ subscription.",
};

export default async function RefundPolicyPage() {
  const policy = await getRefundPolicy();
  const support = brand.email.support;

  return (
    <LegalPage eyebrow="Legal" title="Refund Policy" updated="November 2026">
      <LegalSection heading="The short version">
        <p>
          We want you to feel confident subscribing to {brand.name}. If something goes wrong with a charge,
          you can ask us for a refund within the windows below. To simply move to a cheaper plan, you don&rsquo;t need a
          refund at all - you <strong>downgrade</strong>, and it takes effect at the end of the period you&rsquo;ve already paid for.
        </p>
      </LegalSection>

      <LegalSection heading="When you can request a refund">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Your first paid subscription:</strong> within <strong>{policy.firstDays} days</strong> of the charge.
          </li>
          <li>
            <strong>A renewal or later charge:</strong> within <strong>{policy.renewalDays} days</strong> - this exists to
            reverse accidental or duplicate charges, not as a way to leave a plan mid-period.
          </li>
        </ul>
        <p>
          Approval is not automatic: a request that meets these windows is reviewed, and we may decline it where there is evidence
          of misuse. SMS credits you buy are used up as messages are sent and are not refundable once sent. After these windows a payment is no longer refundable. Discounted-to-zero charges (100% coupons) and payments that
          have already been refunded do not qualify.
        </p>
      </LegalSection>

      <LegalSection heading="How to request one">
        <p>
          Refund requests are made <strong>by email only</strong>, to{" "}
          <a href={`mailto:${support}`} className="font-medium text-primary hover:underline">{support}</a>, so that there is
          always a written record of what was asked and when. Please include:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>your church name and the email address or phone number of your Main Admin account;</li>
          <li>the payment reference and date (both are in <strong>Settings → Billing</strong>, under your payment history);</li>
          <li>a short explanation of what went wrong.</li>
        </ul>
        <p>
          Only the Main Admin can request a refund, and we may ask you to confirm that you are the Main Admin before we act.
          A request made any other way (a phone call, a chat or social media message, or from inside the app) is not
          accepted, and sending one does not start the review period below.
        </p>
      </LegalSection>

      <LegalSection heading="How long it takes">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>We review every request within <strong>{policy.slaHours} hours</strong> (small amounts may be faster).</li>
          <li>
            If approved, we issue the refund through our payment processor (Paystack) right away. Your bank or mobile-money
            provider then settles it - typically <strong>5-10 working days</strong>. That last step is outside our control.
          </li>
          <li>We will email you when your request is approved or declined.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Downgrades &amp; upgrades (no refund needed)">
        <p>
          <strong>Upgrading</strong>{" "}mid-period only charges the difference for the days remaining, and your renewal date
          doesn&rsquo;t change. <strong>Downgrading</strong> costs nothing and refunds nothing - you keep your current plan
          until the end of the period you paid for, then move to the lower plan automatically.
        </p>
      </LegalSection>

      <LegalSection heading="Questions">
        <p>
          Email <a href={`mailto:${support}`} className="font-medium text-primary hover:underline">{support}</a>{" "}and we&rsquo;ll help.
          This policy may change; the version shown here always reflects our current terms.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
