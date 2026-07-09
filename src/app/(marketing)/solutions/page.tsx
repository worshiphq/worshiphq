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

export const metadata: Metadata = {
  title: "Solutions",
  description: "WorshipHQ for small fellowships, growing churches and large ministries.",
};

const audiences = [
  { icon: Sprout, n: "i", title: "Small fellowships", body: "Just getting started? Manage your first members, take offerings and check people in — free, forever, up to 50 members." },
  { icon: Building2, n: "ii", title: "Growing churches", body: "Scale your operations with SMS broadcasts, automations, recurring giving and reports as your congregation grows." },
  { icon: Network, n: "iii", title: "Large ministries", body: "Unlimited members, advanced analytics, API access and a dedicated success manager for your leadership team." },
];

const roles = [
  { icon: UserCog, n: "i", title: "For Pastors", body: "See the health of your church at a glance — attendance, giving and the people who need a shepherd's care this week." },
  { icon: Wallet, n: "ii", title: "For Finance Officers", body: "Fund accounting, automated receipts and an audit trail you can trust. Reports in minutes, not days." },
  { icon: HeartHandshake, n: "iii", title: "For Ministry Leaders", body: "Schedule volunteers, message your team and track engagement — without waiting on the church office." },
];

function PressCardRow({ heading, items }: { heading: string; items: typeof audiences }) {
  return (
    <div>
      <Reveal>
        <div className="flex items-baseline gap-4 border-t-2 border-evergreen pt-7">
          <p className="rubric">{heading}</p>
        </div>
      </Reveal>
      <StaggerGroup className="mt-10 grid gap-10 md:grid-cols-3 md:gap-8">
        {items.map((a) => (
          <StaggerItem key={a.title}>
            <article className="group h-full border-t border-ink/10 pt-5 transition-colors">
              <div className="flex items-baseline justify-between">
                <span className="font-serif text-sm italic text-brass">{a.n}.</span>
                <div className="grid size-10 place-items-center border border-evergreen/20 bg-evergreen/5 text-evergreen transition-colors group-hover:bg-evergreen group-hover:text-parchment">
                  <a.icon className="size-4.5" strokeWidth={1.75} />
                </div>
              </div>
              <h3 className="mt-4 font-serif text-2xl font-semibold text-evergreen-deep">{a.title}</h3>
              <p className="mt-3 text-[15px] leading-[1.8] text-ink-muted">{a.body}</p>
            </article>
          </StaggerItem>
        ))}
      </StaggerGroup>
    </div>
  );
}

export default function SolutionsPage() {
  return (
    <>
      <PageHero
        eyebrow="Solutions"
        title={
          <>
            Every church,
            <br />
            <em className="font-light italic text-primary">every calling.</em>
          </>
        }
        subtitle="Whether you're a 30-member fellowship or a thousand-member ministry, WorshipHQ adapts to how you serve."
      />

      <section className="space-y-24 py-16 pb-24">
        <div className="mx-auto max-w-5xl px-5">
          <PressCardRow heading="By church size" items={audiences} />
        </div>
        <div className="mx-auto max-w-5xl px-5">
          <PressCardRow heading="By role" items={roles} />
        </div>
      </section>

      <FinalCTA />
    </>
  );
}
