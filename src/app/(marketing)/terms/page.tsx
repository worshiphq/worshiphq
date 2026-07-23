import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/marketing/legal-page";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of WorshipHQ.",
};

export default function TermsPage() {
  const support = brand.email.support;
  return (
    <LegalPage eyebrow="Legal" title="Terms of Service" updated="July 2026">
      <LegalSection heading="1. Agreement">
        <p>
          These Terms govern your church&rsquo;s use of {brand.name} (&ldquo;the Service&rdquo;). By creating an account or
          subscribing, the person doing so confirms they&rsquo;re authorised to act for the church and accepts these Terms.
        </p>
      </LegalSection>

      <LegalSection heading="2. Your account">
        <p>
          You&rsquo;re responsible for your account, the team members you invite, and keeping login details secure. You must
          give accurate information and use the Service lawfully and only for your church&rsquo;s legitimate ministry purposes.
        </p>
      </LegalSection>

      <LegalSection heading="3. Plans, billing &amp; payment">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Paid plans are billed in advance for the period you choose (monthly or yearly), in the currency shown at checkout.</li>
          <li>Payments are processed by Paystack. Prices may be displayed in USD and charged in your local currency at the rate shown.</li>
          <li><strong>Upgrades</strong> take effect immediately and are prorated — you pay only the difference for the days left in your current period.</li>
          <li><strong>Downgrades</strong> take effect at the end of your current paid period. No money is refunded for a downgrade.</li>
          <li>We do not auto-charge your card on renewal; we remind you and you renew to keep your features.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="4. Refunds">
        <p>
          Refunds are governed by our{" "}
          <a href="/refund-policy" className="font-medium text-primary hover:underline">Refund Policy</a>, which forms part of
          these Terms. In short: refunds are available within a limited window after a charge; outside it, use a downgrade.
        </p>
      </LegalSection>

      <LegalSection heading="5. Your data">
        <p>
          Your church&rsquo;s data belongs to you. We process it to provide the Service as described in our{" "}
          <a href="/privacy" className="font-medium text-primary hover:underline">Privacy Policy</a>. You can export your
          data at any time from <strong>Download data</strong>. If you cancel, we retain your data for a reasonable period so
          you can resubscribe, after which it may be deleted.
        </p>
      </LegalSection>

      <LegalSection heading="6. Acceptable use">
        <p>
          Don&rsquo;t use the Service to break the law, send spam or unlawful messages, upload harmful content, infringe
          others&rsquo; rights, or attempt to disrupt or gain unauthorised access to the platform. SMS features must be used
          only to message people who expect to hear from your church.
        </p>
      </LegalSection>

      <LegalSection heading="7. Availability &amp; changes">
        <p>
          We work hard to keep the Service running but don&rsquo;t guarantee uninterrupted availability. We may add, change or
          remove features, and may update these Terms; if we make material changes we&rsquo;ll let you know.
        </p>
      </LegalSection>

      <LegalSection heading="8. Liability">
        <p>
          The Service is provided &ldquo;as is.&rdquo; To the extent permitted by law, {brand.name} is not liable for indirect
          or consequential losses, and our total liability for any claim is limited to the amount you paid us in the previous
          twelve months.
        </p>
      </LegalSection>

      <LegalSection heading="9. Suspension &amp; termination">
        <p>
          You may stop using the Service at any time. We may suspend or terminate an account that breaches these Terms or the
          law. On termination your access ends, but our Refund Policy still applies to eligible payments.
        </p>
      </LegalSection>

      <LegalSection heading="10. Contact">
        <p>
          Questions about these Terms? Email{" "}
          <a href={`mailto:${support}`} className="font-medium text-primary hover:underline">{support}</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
