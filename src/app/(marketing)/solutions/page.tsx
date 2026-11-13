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
import { getPlatformConfig } from "@/lib/data/platform-config";
import { lowerFirst } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Solutions",
  description: "WorshipHQ for small fellowships, growing churches and large ministries.",
};

function audiencesFor(freeMembers: string) {
  return [
    { icon: Sprout, title: "Small fellowships", body: `Just getting started? Manage your first members, take offerings and check people in - free, forever, ${freeMembers}.` },
    { icon: Building2, title: "Growing churches", body: "Text the whole church in one tap, follow up everyone who misses Sunday, and keep the church's accounts, harvest and pledges in order as you grow." },
    { icon: Network, title: "Large churches and branches", body: "Unlimited members, face, palm and fingerprint check-in at the door, every branch on one screen, and Sunday's numbers on the pastor's phone by Monday morning." },
  ];
}

const roles = [
  { icon: UserCog, title: "For Pastors", body: "See the health of your church at a glance - attendance, giving and the people who need a shepherd's care this week." },
  { icon: Wallet, title: "For Treasurers", body: "Every tithe, offering and expense recorded once, a receipt texted to each giver, and accounts your board can read in minutes." },
  { icon: HeartHandshake, title: "For Ministry Leaders", body: "See your own department, text your team, build the roster and follow up your people, without waiting on the church office." },
];

function PressCardRow({ heading, items }: { heading: string; items: ReturnType<typeof audiencesFor> | typeof roles }) {
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
              <div className="grid size-10 place-items-center border border-evergreen/20 bg-evergreen/5 text-evergreen transition-colors group-hover:bg-evergreen group-hover:text-parchment">
                <a.icon className="size-4.5" strokeWidth={1.75} />
              </div>
              <h3 className="mt-4 font-display text-2xl font-bold text-evergreen-deep">{a.title}</h3>
              <p className="mt-3 text-[15px] leading-[1.8] text-ink-muted">{a.body}</p>
            </article>
          </StaggerItem>
        ))}
      </StaggerGroup>
    </div>
  );
}

export default async function SolutionsPage() {
  const platformConfig = await getPlatformConfig();
  const freeMembers = lowerFirst(platformConfig.planDefs.free.membersLabel);
  const audiences = audiencesFor(freeMembers);

  return (
    <>
      <PageHero
        eyebrow="Solutions"
        title={
          <>
            Every church,
            <br />
            <span className="text-primary">every calling.</span>
          </>
        }
        subtitle="A fellowship of thirty or a church with branches: start with what you need today and add the rest when you are ready."
      />

      <section className="space-y-24 py-16 pb-24">
        <div className="mx-auto max-w-5xl px-5">
          <PressCardRow heading="By church size" items={audiences} />
        </div>
        <div className="mx-auto max-w-5xl px-5">
          <PressCardRow heading="By role" items={roles} />
        </div>
      </section>

      <FinalCTA freeMembers={freeMembers} />
    </>
  );
}
