import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/marketing/legal-page";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your church's use of WorshipHQ.",
};

export default function TermsPage() {
  const support = brand.email.support;
  return (
    <LegalPage eyebrow="Legal" title="Terms of Service" updated="September 2026">
      <p className="mb-8 text-[15px] leading-[1.8] text-ink-muted">
        Welcome to {brand.name}. These Terms of Service (&ldquo;Terms&rdquo;) are a contract between your church
        (&ldquo;you,&rdquo; &ldquo;your church&rdquo;) and {brand.name}{" "}(&ldquo;we,&rdquo; &ldquo;us&rdquo;). They explain what you
        can expect from us, what we expect from you, and how we protect both sides. By creating an account, enrolling members,
        or subscribing to a paid plan, you confirm you&rsquo;re authorised to act on behalf of your church and you accept these
        Terms.
      </p>

      <LegalSection heading="1. Eligibility &amp; your account">
        <p>
          You must be an adult authorised by your church leadership to set up and manage the account. You&rsquo;re responsible
          for every action taken under your account, including by staff or volunteers you invite as team members. You agree to:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Give accurate, current information about your church and the people you add to it.</li>
          <li>Keep your login credentials confidential, and use the two-factor sign-in codes we send to verify it&rsquo;s really you.</li>
          <li>Promptly remove access for staff or volunteers who leave your church.</li>
          <li>Notify us immediately at {support}{" "}if you suspect unauthorised access to your account.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="2. The Service">
        <p>
          {brand.name}{" "}is a church management platform. Depending on your plan, it may include member and visitor records,
          attendance and check-in, giving and accounting, groups and rosters, welfare and pledges, communications (SMS and
          email), reporting, and optional fingerprint check-in. We may add, adjust, or retire individual features over time to
          improve the Service; we&rsquo;ll let you know before we remove anything you actively rely on.
        </p>
      </LegalSection>

      <LegalSection heading="3. Plans, billing &amp; payment">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Paid plans are billed in advance for the period you choose (monthly or yearly), in the currency shown at checkout.</li>
          <li>Payments are processed by Paystack, a licensed payment service provider. We never see or store your full card or mobile-money details.</li>
          <li>Prices may be displayed in USD and charged in your local currency at the exchange rate applied at checkout.</li>
          <li><strong>Upgrades</strong>{" "}take effect immediately and are prorated - you pay only the difference for the days left in your current period.</li>
          <li><strong>Downgrades</strong>{" "}take effect at the end of your current paid period, with nothing refunded for the change.</li>
          <li>We do not auto-charge your card on renewal. We remind you ahead of time, and you choose to renew to keep your features.</li>
          <li>You&rsquo;re responsible for any taxes, levies, or bank charges associated with your payments, other than taxes on our own income.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="4. Refunds">
        <p>
          Refunds are governed by our{" "}
          <a href="/refund-policy" className="font-medium text-primary hover:underline">Refund Policy</a>, which forms part of
          these Terms. In short: refunds are available within a limited window after a charge; outside it, you can still move to
          a cheaper plan with a downgrade at no cost.
        </p>
      </LegalSection>

      <LegalSection heading="5. Your data &amp; content">
        <p>
          Everything you enter about your church - member records, giving, attendance, messages, and anything else - belongs
          to <strong>you</strong>, not us. We only use it to provide the Service to you, as described in our{" "}
          <a href="/privacy" className="font-medium text-primary hover:underline">Privacy Policy</a>. You can export a full copy
          of your data at any time from <strong>Settings → Download data</strong>.
        </p>
        <p>
          You&rsquo;re responsible for the accuracy of what you enter, and for having the right - under applicable law and your
          church&rsquo;s own policies - to hold that information about the people in it. If you cancel your subscription, we
          keep your data for a reasonable period so you can pick up where you left off if you resubscribe, after which it may be
          permanently deleted.
        </p>
      </LegalSection>

      <LegalSection heading="6. Biometric (fingerprint) check-in">
        <p>
          Fingerprint check-in is an optional feature that a church administrator chooses to turn on and enrol members into -
          it is never enabled for the public and is never a requirement to use {brand.name}. When it&rsquo;s used:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>You are responsible for consent.</strong>{" "}Before enrolling anyone&rsquo;s fingerprint, your church must
            obtain that person&rsquo;s clear, informed consent (or, for a minor, their parent or guardian&rsquo;s consent), and
            must comply with any biometric or data-protection law that applies to you.
          </li>
          <li>We store an encrypted mathematical template generated by the scanner - not a picture of the fingerprint itself.</li>
          <li>The template is used solely to recognise that person at check-in and for no other purpose; it is never sold, shared with advertisers, or used to train any model.</li>
          <li>An administrator can delete a member&rsquo;s fingerprint data at any time, and it is deleted automatically if the member record is removed.</li>
        </ul>
        <p>
          Because biometric-privacy laws vary widely by country and can carry significant penalties, you agree to indemnify and
          hold {brand.name}{" "}harmless from any claim arising from your church&rsquo;s collection, use, or retention of biometric
          data without the consent required in your jurisdiction.
        </p>
      </LegalSection>

      <LegalSection heading="7. Children&rsquo;s &amp; minors&rsquo; information">
        <p>
          {brand.name}{" "}is built for use <em>by</em>{" "}churches and their authorised staff, not directly by children. Where your
          church keeps records for children&rsquo;s or youth ministry - including a parent or guardian&rsquo;s contact
          details - that information is entered and controlled by your church, and you confirm you have the parent or
          guardian&rsquo;s permission to hold it. We do not knowingly collect information directly from a child, and our public
          sign-up is intended only for adults acting on behalf of a church.
        </p>
      </LegalSection>

      <LegalSection heading="8. Communications &amp; messaging">
        <p>
          {brand.name}{" "}lets your church send SMS and email to your own members - for announcements, reminders, giving
          receipts, and similar ministry purposes. You are solely responsible for having the right to message the people you
          message, for the content of what you send, and for complying with any anti-spam, telecom, or consumer-protection law
          that applies to you. We may suspend messaging features if we reasonably believe they are being used to send unwanted,
          unlawful, or unsolicited messages. Security messages we send ourselves - such as sign-in verification codes - are sent
          only to confirm it&rsquo;s really you.
        </p>
      </LegalSection>

      <LegalSection heading="9. Acceptable use">
        <p>You agree not to:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Use the Service to break the law, defraud anyone, or facilitate unlawful fundraising.</li>
          <li>Send spam, harassment, or messages to people who haven&rsquo;t agreed to hear from your church.</li>
          <li>Upload malicious code, or content that infringes someone else&rsquo;s rights.</li>
          <li>Attempt to reverse-engineer, scrape, resell, or gain unauthorised access to the platform or another church&rsquo;s data.</li>
          <li>Interfere with the Service&rsquo;s security, availability, or normal operation.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="10. Third-party services">
        <p>
          The Service relies on trusted third parties to work - including Paystack for payments, an SMS provider for messaging,
          and reputable cloud hosting and database providers for storage. We choose these partners carefully, but we&rsquo;re
          not liable for outages or failures caused by a third-party service that are outside our reasonable control.
        </p>
      </LegalSection>

      <LegalSection heading="11. Intellectual property">
        <p>
          {brand.name}, our logo, and the software behind the Service are our property (or licensed to us), and these Terms
          don&rsquo;t transfer any of it to you. You keep all rights to the data and content you put into the Service. If you
          send us feedback or suggestions, you agree we can use them to improve the product without owing you anything for it.
        </p>
      </LegalSection>

      <LegalSection heading="12. Availability &amp; disclaimer of warranties">
        <p>
          We work hard to keep the Service reliable, but we don&rsquo;t guarantee it will be uninterrupted, error-free, or
          available every second. To the extent permitted by law, the Service is provided &ldquo;as is&rdquo; and &ldquo;as
          available,&rdquo; without warranties of any kind, express or implied, including fitness for a particular purpose.
        </p>
      </LegalSection>

      <LegalSection heading="13. Limitation of liability">
        <p>
          To the extent permitted by law, {brand.name}{" "}is not liable for any indirect, incidental, or consequential loss
          (including lost donations, lost data, or lost goodwill) arising from your use of the Service. Our total liability
          for any claim relating to the Service is limited to the amount your church paid us in the twelve months before the
          claim arose.
        </p>
      </LegalSection>

      <LegalSection heading="14. Indemnification">
        <p>
          You agree to indemnify and hold {brand.name}{" "}harmless from any claim, loss, or expense (including reasonable legal
          fees) arising from: your use of the Service, the data or content your church uploads, your compliance obligations
          regarding messaging or biometric or minors&rsquo; data as described above, or your breach of these Terms.
        </p>
      </LegalSection>

      <LegalSection heading="15. Suspension &amp; termination">
        <p>
          You may stop using the Service at any time. We may suspend or terminate an account that breaches these Terms, poses a
          security risk, or is required by law. On termination, your access ends, but our Refund Policy still applies to
          eligible payments already made, and you can request your data export before it is deleted.
        </p>
      </LegalSection>

      <LegalSection heading="16. Governing law &amp; disputes">
        <p>
          These Terms are governed by the laws of the Republic of Ghana, without regard to conflict-of-law rules. Before either
          side files a claim, we agree to try in good faith to resolve the dispute informally by contacting {support}. If that
          doesn&rsquo;t resolve it, the courts of Ghana have exclusive jurisdiction, without prejudice to any consumer-protection
          rights you may have under the law of your own country.
        </p>
      </LegalSection>

      <LegalSection heading="17. Changes to these Terms">
        <p>
          We may update these Terms from time to time - most often to reflect new features or legal requirements. If we make a
          material change, we&rsquo;ll notify account owners by email or in-app notice before it takes effect. Continuing to use
          the Service after a change takes effect means you accept the updated Terms.
        </p>
      </LegalSection>

      <LegalSection heading="18. General">
        <p>
          If any part of these Terms is found unenforceable, the rest remains in effect. These Terms, together with our Privacy
          Policy and Refund Policy, are the entire agreement between us regarding the Service. You may not assign your account
          or these Terms without our consent; we may assign ours in connection with a merger, acquisition, or sale of assets.
          Our failure to enforce a right isn&rsquo;t a waiver of it.
        </p>
      </LegalSection>

      <LegalSection heading="19. Contact">
        <p>
          Questions about these Terms? Email{" "}
          <a href={`mailto:${support}`} className="font-medium text-primary hover:underline">{support}</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
