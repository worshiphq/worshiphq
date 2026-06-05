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
            See <span className="text-gradient">WorshipHQ</span> in action
          </>
        }
        subtitle="Tell us about your church and we'll set up a personalised walkthrough — usually within one working day."
      />

      <section className="pb-24 pt-4">
        <div className="mx-auto grid max-w-5xl gap-8 px-5 lg:grid-cols-[1fr_1.3fr]">
          <div className="space-y-5">
            {[
              { icon: Mail, label: "Email us", value: brand.email.sales },
              { icon: MessageCircle, label: "WhatsApp", value: "+233 20 000 0000" },
              { icon: MapPin, label: "Based in", value: "Accra, Ghana 🇬🇭" },
            ].map((c) => (
              <div key={c.label} className="flex items-center gap-4 rounded-2xl border border-line bg-surface/40 p-4">
                <div className="grid size-11 place-items-center rounded-xl border border-line bg-surface-2 text-primary-bright">
                  <c.icon className="size-5" />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-ink-faint">{c.label}</div>
                  <div className="text-sm font-medium">{c.value}</div>
                </div>
              </div>
            ))}
          </div>

          <DemoForm />
        </div>
      </section>
    </>
  );
}
