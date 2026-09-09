import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/marketing/legal-page";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How WorshipHQ collects, uses and protects your church's data.",
};

export default function PrivacyPage() {
  const support = brand.email.support;
  return (
    <LegalPage eyebrow="Legal" title="Privacy Policy" updated="September 2026">
      <p className="mb-8 text-[15px] leading-[1.8] text-ink-muted">
        Your church trusts you with sensitive information about its members — and you trust us with that same information
        when you use {brand.name}. This policy explains, in plain language, what we collect, why, how it&rsquo;s protected,
        and the choices you and your church have.
      </p>

      <LegalSection heading="1. Who this covers &amp; who controls what">
        <p>
          Your church is the <strong>data controller</strong>{" "}for the information it enters about its members, visitors, and
          donors — it decides what to collect and why. {brand.name}{" "}is the <strong>data processor</strong>: we hold and process
          that information only to provide the Service to your church, following your church&rsquo;s instructions (given
          through how you use the app).
        </p>
      </LegalSection>

      <LegalSection heading="2. Information we collect">
        <ul className="list-disc space-y-1.5 pl-5">
          <li><strong>Account details:</strong>{" "}your church&rsquo;s name and address, and the names, emails, and phone numbers of the admins and team members you register.</li>
          <li><strong>Church data you enter:</strong>{" "}member and visitor records, attendance, groups, giving and pledges, welfare and accounting entries, events, and similar ministry information.</li>
          <li><strong>Communications content:</strong>{" "}the SMS and email messages your church sends through the platform, and delivery status (sent, delivered, failed) so you can see whether they went through.</li>
          <li><strong>Payment information:</strong>{" "}handled entirely by Paystack — we never see or store full card or mobile-money numbers, only the outcome of a transaction.</li>
          <li><strong>Biometric information (only if you enable it):</strong>{" "}see the dedicated section below.</li>
          <li><strong>Usage &amp; device data:</strong>{" "}basic technical logs (IP address, browser type, pages visited, timestamps) needed to keep the Service secure, diagnose problems, and improve performance.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="3. Biometric information">
        <p>
          Fingerprint check-in is optional and off by default — a church administrator must explicitly turn it on and enrol
          each member. If your church uses it:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>We store an <strong>encrypted mathematical template</strong>{" "}derived from a fingerprint scan — not a photograph or image of the fingerprint.</li>
          <li>The template is used <strong>only</strong>{" "}to recognise that person at check-in. It is never used for any other purpose, never sold, and never shared with advertisers or any third party outside the providers strictly needed to run the feature.</li>
          <li>It is your church&rsquo;s responsibility to obtain each person&rsquo;s informed consent (or a parent/guardian&rsquo;s consent for a minor) before enrolment, in line with any biometric-privacy law that applies to you.</li>
          <li>An administrator can delete a member&rsquo;s biometric data at any time from their profile, and it is deleted automatically when the member record itself is deleted.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="4. Children&rsquo;s &amp; minors&rsquo; information">
        <p>
          {brand.name}{" "}is a tool <em>for churches</em>, not a service offered directly to children. Where a church keeps
          records for its children&rsquo;s or teen ministry — including a parent or guardian&rsquo;s name and phone number —
          that information is entered and managed by the church, which is responsible for having the appropriate parental
          consent. We do not knowingly collect information directly from a child, and our public sign-up flow is intended only
          for an adult acting on behalf of a church.
        </p>
      </LegalSection>

      <LegalSection heading="5. How we use information">
        <p>
          To provide and maintain the Service, process payments, deliver the messages your church asks us to send (including
          receipts, reminders, and sign-in verification codes), provide customer support, keep the platform secure, and
          improve reliability and features. We do <strong>not</strong>{" "}sell your data, and we do not use your church&rsquo;s
          member data for advertising — ours or anyone else&rsquo;s.
        </p>
      </LegalSection>

      <LegalSection heading="6. How we share information">
        <p>We share information only with the providers that make the Service work, and only as much as each needs to do its job:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><strong>Paystack</strong>{" "}— to process subscription payments.</li>
          <li><strong>Our SMS &amp; email providers</strong>{" "}— to deliver the messages your church sends and our own security notices.</li>
          <li><strong>Cloud hosting &amp; database providers</strong>{" "}— reputable infrastructure providers that store and run the Service; your church&rsquo;s data is logically isolated from every other church&rsquo;s.</li>
        </ul>
        <p>
          We may also disclose information if required by law, to protect the rights or safety of {brand.name}{" "}or others, or
          in connection with a merger, acquisition, or sale of assets — in which case the new owner would remain bound by this
          policy for data already collected.
        </p>
      </LegalSection>

      <LegalSection heading="7. Data retention">
        <p>
          We keep your church&rsquo;s data for as long as your account is active. If you cancel, we retain it for a reasonable
          period in case you resubscribe, after which it is permanently deleted from our production systems. You can delete
          individual records (a member, a message, a biometric enrolment) within the app at any time, and export a full copy of
          your church&rsquo;s data whenever you like.
        </p>
      </LegalSection>

      <LegalSection heading="8. Security">
        <p>
          Data is encrypted in transit, and each church&rsquo;s data is isolated from every other church&rsquo;s at the
          database level. We apply access controls and audit trails to guard against unauthorised access, and a small number of
          authorised support staff may access account information only when necessary to provide support, troubleshoot an
          issue, or as required by law. No system is perfectly secure, but we take safeguarding your data seriously and
          continually invest in improving it.
        </p>
      </LegalSection>

      <LegalSection heading="9. International data storage">
        <p>
          Your data may be stored and processed on servers located outside your church&rsquo;s country, operated by our
          hosting and database providers. Wherever it&rsquo;s stored, we require the same standards of protection described in
          this policy.
        </p>
      </LegalSection>

      <LegalSection heading="10. Your rights &amp; choices">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Export your church&rsquo;s data at any time from <strong>Settings → Download data</strong>.</li>
          <li>Correct or delete member records directly within the app.</li>
          <li>Delete a member&rsquo;s biometric enrolment at any time, without deleting the rest of their record.</li>
          <li>Ask us to close your account; we&rsquo;ll retain data only for a reasonable period before deleting it.</li>
          <li>Depending on where your church is based, you or the individuals in your records may also have rights to access, correct, or object to processing under local data-protection law — including the right to lodge a complaint with your national data-protection authority (for example, Ghana&rsquo;s Data Protection Commission under the Data Protection Act, 2012, Act 843).</li>
        </ul>
      </LegalSection>

      <LegalSection heading="11. Cookies">
        <p>
          We use only the essential cookies needed to keep you signed in and to remember basic preferences. We don&rsquo;t use
          third-party advertising or tracking cookies on the {brand.name}{" "}app.
        </p>
      </LegalSection>

      <LegalSection heading="12. Messaging consent">
        <p>
          Churches are responsible for having permission to contact the people they message through the Service. SMS and email
          features should only be used to reach people who expect to hear from the church.
        </p>
      </LegalSection>

      <LegalSection heading="13. Changes to this policy">
        <p>
          We may update this policy from time to time, most often to reflect new features or legal requirements. If we make a
          material change, we&rsquo;ll notify account owners by email or in-app notice before it takes effect. The version shown
          here always reflects our current policy.
        </p>
      </LegalSection>

      <LegalSection heading="14. Contact">
        <p>
          Privacy questions or requests — including data access, correction, or deletion requests? Email{" "}
          <a href={`mailto:${support}`} className="font-medium text-primary hover:underline">{support}</a>{" "}and we&rsquo;ll help.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
