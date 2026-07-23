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
    <LegalPage eyebrow="Legal" title="Privacy Policy" updated="July 2026">
      <LegalSection heading="Who this covers">
        <p>
          This explains how {brand.name} handles information for the churches that use our Service and the people whose
          records they keep in it. Your church is the owner of its members&rsquo; data; we process that data on the
          church&rsquo;s behalf to run the Service.
        </p>
      </LegalSection>

      <LegalSection heading="What we collect">
        <ul className="list-disc space-y-1.5 pl-5">
          <li><strong>Account details:</strong> church name, admin names, emails and phone numbers.</li>
          <li><strong>Church data you enter:</strong> member records, attendance, giving, events, pledges and similar ministry information.</li>
          <li><strong>Payment information:</strong> handled by Paystack — we never see or store full card or mobile-money details.</li>
          <li><strong>Usage &amp; device data:</strong> basic logs needed to keep the Service secure and reliable.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="How we use it">
        <p>
          To provide and improve the Service, process payments, send transactional messages (receipts, reminders, OTP codes),
          provide support, and keep the platform safe. We do not sell your data, and we don&rsquo;t use your church&rsquo;s
          member data for advertising.
        </p>
      </LegalSection>

      <LegalSection heading="Sharing">
        <p>
          We share data only with the providers that make the Service work — for example Paystack (payments), our SMS provider
          (messaging), and our hosting and database providers — and only as needed. We may disclose information if required by
          law.
        </p>
      </LegalSection>

      <LegalSection heading="Storage &amp; security">
        <p>
          Data is stored with reputable cloud providers and protected with encryption in transit, access controls, strict
          per-church isolation and audit trails. No system is perfectly secure, but we take safeguarding your data seriously.
        </p>
      </LegalSection>

      <LegalSection heading="Your choices">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Export your church&rsquo;s data any time from <strong>Download data</strong>.</li>
          <li>Correct or delete member records within the app.</li>
          <li>Contact us to close your account; we retain data for a reasonable period, then delete it.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Messaging consent">
        <p>
          Churches are responsible for having permission to contact the people they message. SMS and email features should
          only be used to reach people who expect to hear from the church.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Privacy questions or requests? Email{" "}
          <a href={`mailto:${support}`} className="font-medium text-primary hover:underline">{support}</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
