import type { Metadata } from "next";
import { DemoForm } from "@/components/marketing/demo-form";
import { PageHero } from "@/components/marketing/page-hero";
import { Mail, MapPin, MessageCircle } from "lucide-react";
import { getMarketingContent } from "@/lib/data/site-content";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: "Request a demo",
  description: "See WorshipHQ in action. Book a personalised demo for your church.",
};

export default async function ContactPage() {
  const { contactPhone } = await getMarketingContent();
  // wa.me needs the number in international form without the plus: 055 239 9981 -> 233552399981.
  const digits = contactPhone.replace(/\D/g, "");
  const intl = digits.startsWith("0") ? `233${digits.slice(1)}` : digits;
  return (
    <>
      <PageHero
        eyebrow="Get in touch"
        title={
          <>
            See it with your
            <br />
            <span className="text-primary">own eyes.</span>
          </>
        }
        subtitle="Tell us about your church and we'll set up a personalised walkthrough - usually within one working day."
      />

      <section className="pb-24 pt-16">
        <div className="mx-auto grid max-w-5xl gap-12 px-5 lg:grid-cols-[1fr_1.3fr]">
          {/* ── Correspondence details ── */}
          <div>
            <p className="rubric border-t-2 border-evergreen pt-6">Correspondence</p>
            <div className="mt-8 space-y-0 divide-y divide-ink/10 border-b border-ink/10">
              {[
                { icon: Mail, label: "Email us", value: brand.email.sales },
                ...(contactPhone ? [{ icon: MessageCircle, label: "Call or WhatsApp", value: contactPhone, href: `https://wa.me/${intl}` }] : []),
                { icon: MapPin, label: "Headquarters", value: "Ghana · Serving churches across Africa" },
              ].map((c) => (
                <div key={c.label} className="flex items-center gap-5 py-5">
                  <div className="grid size-11 shrink-0 place-items-center border border-evergreen/20 bg-evergreen/5 text-evergreen">
                    <c.icon className="size-4.5" strokeWidth={1.75} />
                  </div>
                  <div>
                    <div className="rubric !text-[9px]">{c.label}</div>
                    {"href" in c && c.href
                      ? <a href={c.href} target="_blank" rel="noopener noreferrer" className="mt-1 block font-display text-lg font-semibold text-evergreen-deep hover:underline">{c.value}</a>
                      : <div className="mt-1 font-display text-lg font-semibold text-evergreen-deep">{c.value}</div>}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-8 text-sm leading-relaxed text-ink-faint">
              We usually reply the same day - and always within one working day.
            </p>
          </div>

          <DemoForm />
        </div>
      </section>
    </>
  );
}
