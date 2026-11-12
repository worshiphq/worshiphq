"use client";

import Link from "next/link";
import { Reveal } from "@/components/ui/reveal";
import { cn } from "@/lib/utils";

type Tier = "free" | "starter" | "pro" | "max";
const TIERS: Tier[] = ["free", "starter", "pro", "max"];
const NAME: Record<Tier, string> = { free: "Free", starter: "Starter", pro: "Pro", max: "Max" };
const LINE: Record<Tier, string> = {
  free: "Get organised",
  starter: "Reach every member",
  pro: "Run the money side right",
  max: "Run the whole church",
};

/** What churches get, by the plan feature it belongs to. The plan each one lands on is read live from SuperAdmin. */
const FEATURES: [string, string][] = [
  ["people", "Members, households & departments"],
  ["attendance", "Attendance by name"],
  ["visitors", "Visitor & prayer request forms"],
  ["giving", "Tithes, offerings & Day Born"],
  ["events", "Events & calendar"],
  ["reports", "Reports"],
  ["sms", "Bulk SMS to your church"],
  ["auto-receipts", "Giving receipts by text"],
  ["follow-ups", "Absentee follow-up"],
  ["birthday-automations", "Birthday texts & alerts"],
  ["qr-codes", "QR check-in"],
  ["member-ids", "Member ID cards"],
  ["import-export", "Import from Excel"],
  ["custom-messages", "Your own message wording"],
  ["online-payments", "Online giving by Mobile Money & card"],
  ["accounting", "Church accounts & expenses"],
  ["harvest", "Harvest & pledges"],
  ["rosters", "Rosters & volunteers"],
  ["welfare", "Welfare"],
  ["member-categories", "Zones, fellowships & service times"],
  ["custom-roles", "Your own team roles"],
  ["fingerprint", "USB fingerprint scanner"],
  ["biometric-devices", "Face, palm & fingerprint door devices"],
  ["weekly-briefing", "Monday briefing for the pastor"],
  ["linked-churches", "Branches & linked churches"],
  ["sermons", "Sermons, devotionals & testimonies"],
  ["counseling", "Private counselling records"],
  ["budgets", "Budgets & assets"],
];

export function FeatureGrid({ tiers, members }: { tiers: Record<string, Tier>; members: Record<Tier, string> }) {
  const byTier = (t: Tier) => FEATURES.filter(([k]) => (tiers[k] ?? "max") === t);
  return (
    <section id="features" className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal>
          <p className="rubric mb-4">What you get</p>
          <div className="grid gap-8 border-t-2 border-evergreen pt-8 lg:grid-cols-[1.2fr_1fr]">
            <h2 className="press-display text-4xl sm:text-5xl">
              Start free.
              <br />
              <span className="text-primary">Grow one step at a time.</span>
            </h2>
            <p className="self-end text-[15px] leading-[1.8] text-ink-muted">
              Each plan adds to the one before it. Begin with your members and Sunday attendance, then add texting, the church&rsquo;s money,
              and the devices at the door when you are ready. Moving up only charges the difference.
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="mt-12 grid gap-px overflow-hidden border border-ink/12 bg-ink/10 sm:grid-cols-2 lg:grid-cols-4">
            {TIERS.map((t, i) => (
              <div key={t} className={cn("flex flex-col bg-parchment p-6", t === "max" && "bg-evergreen-deep text-parchment")}>
                <div className="flex items-baseline justify-between">
                  <h3 className="font-display text-2xl font-bold">{NAME[t]}</h3>
                  <span className={cn("text-[11px] uppercase tracking-[0.14em]", t === "max" ? "text-brass" : "text-ink-faint")}>{i === 0 ? "Base" : `+ ${NAME[TIERS[i - 1]!]}`}</span>
                </div>
                <p className={cn("mt-1 text-sm", t === "max" ? "text-parchment/70" : "text-ink-muted")}>{LINE[t]} · {members[t]}</p>
                <ul className="mt-5 space-y-2.5">
                  {byTier(t).map(([k, label]) => (
                    <li key={k} className="flex items-baseline gap-2.5 text-sm">
                      <span className={t === "max" ? "text-brass" : "text-brass"}>✦</span>
                      <span>{label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-5 text-center text-sm text-ink-muted">
            Door devices and scanners are a one-off purchase. We supply and install them for a fee. <Link href="#pricing" className="font-medium text-evergreen underline underline-offset-4">See prices</Link>
          </p>
        </Reveal>
      </div>
    </section>
  );
}
