import type { Metadata } from "next";
import {
  Sprout,
  Building2,
  Network,
  UserCog,
  HeartHandshake,
  Wallet,
} from "lucide-react";
import { PageHero } from "@/components/marketing/page-hero";
import { FinalCTA } from "@/components/marketing/final-cta";
import { Reveal, StaggerGroup, StaggerItem } from "@/components/ui/reveal";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Solutions",
  description: "WorshipHQ for small fellowships, growing churches and large ministries.",
};

const audiences = [
  { icon: Sprout, title: "Small fellowships", body: "Just getting started? Manage your first members, take offerings and check people in — free, forever, up to 50 members." },
  { icon: Building2, title: "Growing churches", body: "Scale your operations with SMS broadcasts, automations, recurring giving and reports as your congregation grows." },
  { icon: Network, title: "Large ministries", body: "Unlimited members, advanced analytics, API access and a dedicated success manager for your leadership team." },
];

const roles = [
  { icon: UserCog, title: "For Pastors", body: "See the health of your church at a glance — attendance, giving and the people who need a shepherd's care this week." },
  { icon: Wallet, title: "For Finance Officers", body: "Fund accounting, automated receipts and an audit trail you can trust. Reports in minutes, not days." },
  { icon: HeartHandshake, title: "For Ministry Leaders", body: "Schedule volunteers, message your team and track engagement — without waiting on the church office." },
];

export default function SolutionsPage() {
  return (
    <>
      <PageHero
        eyebrow="Solutions"
        title={
          <>
            Built for <span className="text-gradient">every church</span>, every role
          </>
        }
        subtitle="Whether you're a 30-member fellowship or a thousand-member ministry, WorshipHQ adapts to how you serve."
      />

      <section className="py-16">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal className="mb-8 font-display text-2xl font-semibold">By church size</Reveal>
          <StaggerGroup className="grid gap-4 md:grid-cols-3">
            {audiences.map((a) => (
              <StaggerItem key={a.title}>
                <Card hover className="h-full p-7">
                  <div className="mb-4 grid size-12 place-items-center rounded-2xl border border-primary/30 bg-primary/10 text-primary-bright">
                    <a.icon className="size-6" />
                  </div>
                  <h3 className="font-display text-xl font-semibold">{a.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">{a.body}</p>
                </Card>
              </StaggerItem>
            ))}
          </StaggerGroup>

          <Reveal className="mb-8 mt-20 font-display text-2xl font-semibold">By role</Reveal>
          <StaggerGroup className="grid gap-4 md:grid-cols-3">
            {roles.map((a) => (
              <StaggerItem key={a.title}>
                <Card hover className="h-full p-7">
                  <div className="mb-4 grid size-12 place-items-center rounded-2xl border border-gold/30 bg-gold/10 text-gold">
                    <a.icon className="size-6" />
                  </div>
                  <h3 className="font-display text-xl font-semibold">{a.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">{a.body}</p>
                </Card>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </section>

      <FinalCTA />
    </>
  );
}
