import type { Metadata } from "next";
import { DemoForm } from "@/components/marketing/demo-form";
import { PageHero } from "@/components/marketing/page-hero";
import { Mail, MessageCircle, MapPin } from "lucide-react";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: "Request a demo",
  description: "See WorshipHQ in action. Book a personalised demo for your church.",
};

export default function ContactPage() {
  return (
    <>
      <PageHero
        eyebrow="Get in touch"
        title={
          <>
            See it with your
            <br />
            <em className="font-light italic text-primary">own eyes.</em>
          </>
        }
        subtitle="Tell us about your church and we'll set up a personalised walkthrough — usually within one working day."
      />

      <section className="pb-24 pt-8">
        <div className="mx-auto grid max-w-5xl gap-12 px-5 lg:grid-cols-[1fr_1.3fr]">
          {/* ── Correspondence details ── */}
          <div>
            <p className="rubric border-t-2 border-evergreen pt-6">Correspondence</p>
            <div className="mt-8 space-y-0 divide-y divide-ink/10 border-b border-ink/10">
              {[
                { icon: Mail, label: "Email us", value: brand.email.sales },
                { icon: MessageCircle, label: "WhatsApp", value: "+233 20 000 0000" },
                { icon: MapPin, label: "Based in", value: "Accra, Ghana 🇬🇭" },
              ].map((c) => (
                <div key={c.label} className="flex items-center gap-5 py-5">
                  <div className="grid size-11 shrink-0 place-items-center border border-evergreen/20 bg-evergreen/5 text-evergreen">
                    <c.icon className="size-4.5" strokeWidth={1.75} />
                  </div>
                  <div>
                    <div className="rubric !text-[9px]">{c.label}</div>
                    <div className="mt-1 font-serif text-lg text-evergreen-deep">{c.value}</div>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-8 font-serif text-sm italic leading-relaxed text-ink-faint">
              &ldquo;We usually reply the same day — and always within one working day.&rdquo;
            </p>
          </div>

          <DemoForm />
        </div>
      </section>
    </>
  );
}
