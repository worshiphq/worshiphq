import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Fingerprint, Hand, ScanFace, ShieldCheck, Usb, Webhook, Cpu } from "lucide-react";
import { PageHero } from "@/components/marketing/page-hero";
import { FinalCTA } from "@/components/marketing/final-cta";
import { Reveal } from "@/components/ui/reveal";
import { getPlatformConfig } from "@/lib/data/platform-config";
import { lowerFirst } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Check-in devices",
  description: "Check people in with a face, palm or fingerprint device. See which devices work with WorshipHQ and how to connect them.",
};

const WAYS = [
  { icon: ScanFace, title: "Face", text: "A member looks at the device at the door and is checked in. No sign-in table, no queue at a laptop." },
  { icon: Hand, title: "Palm", text: "Hold a hand up to the device. Nothing to touch, which is kinder to a busy door." },
  { icon: Fingerprint, title: "Fingerprint", text: "A touch on a reader at the door, or on a check-in computer, and attendance records itself." },
];

const WORKS = [
  { icon: Cpu, title: "Face, palm and fingerprint terminals", text: "ZKTeco and compatible terminals, including the SpeedFace, ProFace, MB and iClock families and many rebranded ones. Anything with a cloud server, ADMS or push setting connects to WorshipHQ." },
  { icon: Usb, title: "USB fingerprint readers", text: "A ZKTeco SLK20R plugged into the computer you check people in with. Set up once from the Attendance page." },
  { icon: Webhook, title: "Any other device or software", text: "If it can send a web request, such as a gate controller or another brand's software, it can check someone in using a private link." },
];

const STEPS = [
  ["Buy a device", "Hardware is bought separately. Choose face, palm, fingerprint, or a mix. Not sure which? Ask us first."],
  ["Add it in WorshipHQ", "Enter its serial number. WorshipHQ shows you exactly what to type into the device."],
  ["Put your members on it", "WorshipHQ sends every member's name to the device. Then each person enrols their face, palm or finger on the device itself."],
  ["People scan, attendance records itself", "Each scan checks that member in to the service that is on, and shows up live in WorshipHQ."],
];

const FAQ = [
  ["Which plan do I need?", "Check-in devices are part of the Max plan. The devices themselves are bought separately."],
  ["Do I need a computer at the door?", "Not for most terminals, which connect to WorshipHQ over the internet by themselves. A terminal that can only send to an IP address uses a small bridge program on any computer in your building. A USB fingerprint reader needs the computer it is plugged into."],
  ["What if someone scans twice?", "Their first scan at a service checks them in. Scanning again at the same service changes nothing."],
  ["Will a cleaner or a visitor passing in the week be counted?", "No. You choose when scans count: during your service times, or only on the days and hours you set. Scans outside are ignored."],
  ["How well does recognition work?", "It works best when the person faces the camera, within about a metre, in good light. Distances and speeds in a brochure are best case, so try one device at your entrance before you buy more."],
  ["Where is the face or palm data kept?", "On the device at your church. WorshipHQ only receives the member's ID, the time and which device it was. Get each member's consent before enrolling them, and a parent's or guardian's consent for children."],
];

export default async function DevicesPage() {
  const platformConfig = await getPlatformConfig();
  return (
    <>
      <PageHero
        eyebrow="Devices"
        title={
          <>
            Check in with a face,
            <br />
            <span className="text-primary">a palm or a fingerprint.</span>
          </>
        }
        subtitle="Put a device at your door and attendance records itself. WorshipHQ works with the face, palm and fingerprint devices churches already buy."
      />

      <section className="relative py-12 sm:py-16">
        <div className="mx-auto max-w-5xl px-5">
          <Reveal>
            <div className="grid gap-5 sm:grid-cols-3">
              {WAYS.map((w) => (
                <div key={w.title} className="border border-ink/10 bg-white/50 p-6">
                  <w.icon className="size-6 text-primary" aria-hidden />
                  <h2 className="mt-4 font-display text-xl font-bold">{w.title}</h2>
                  <p className="mt-2 text-[15px] leading-[1.7] text-ink-muted">{w.text}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="relative py-12 sm:py-16">
        <div className="mx-auto max-w-5xl px-5">
          <Reveal>
            <p className="rubric mb-4">What works</p>
            <h2 className="press-display text-3xl sm:text-4xl">Devices that work with WorshipHQ</h2>
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {WORKS.map((w) => (
                <div key={w.title} className="border border-ink/10 bg-white/50 p-6">
                  <w.icon className="size-5 text-primary" aria-hidden />
                  <h3 className="mt-3 font-semibold">{w.title}</h3>
                  <p className="mt-2 text-sm leading-[1.7] text-ink-muted">{w.text}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 border-l-2 border-brass/60 bg-paper-2/60 p-5 text-sm leading-[1.7] text-ink-muted">
              <strong className="text-ink">Before you buy a terminal, ask the seller:</strong> does it have a cloud server, ADMS or push setting, and can it send to a web address over HTTPS? If it can, it connects straight to WorshipHQ. If it can only send to an IP address, it still works through a small program on a computer in your building.
            </div>
          </Reveal>
        </div>
      </section>

      <section className="relative py-12 sm:py-16">
        <div className="mx-auto max-w-5xl px-5">
          <Reveal>
            <p className="rubric mb-4">How it works</p>
            <h2 className="press-display text-3xl sm:text-4xl">From the box to your first scan</h2>
            <ol className="mt-8 grid gap-5 sm:grid-cols-2">
              {STEPS.map(([t, d], i) => (
                <li key={t} className="flex gap-4 border border-ink/10 bg-white/50 p-6">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 font-display font-bold text-primary">{i + 1}</span>
                  <div>
                    <h3 className="font-semibold">{t}</h3>
                    <p className="mt-1 text-sm leading-[1.7] text-ink-muted">{d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </section>

      <section className="relative py-12 sm:py-16">
        <div className="mx-auto max-w-3xl px-5">
          <Reveal>
            <p className="rubric mb-4">Good to know</p>
            <h2 className="press-display text-3xl sm:text-4xl">Questions churches ask</h2>
            <div className="mt-8 space-y-3">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group border border-ink/10 bg-white/50 open:bg-white/80">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                    {q}
                    <span className="text-ink-faint transition-transform group-open:rotate-45" aria-hidden>+</span>
                  </summary>
                  <p className="px-5 pb-5 text-[15px] leading-[1.7] text-ink-muted">{a}</p>
                </details>
              ))}
            </div>
            <p className="mt-6 flex items-start gap-2 text-sm text-ink-muted">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span>Read how we handle biometric information in our <Link href="/privacy" className="font-medium text-primary underline">Privacy Policy</Link>. Questions about a device? <Link href="/contact" className="font-medium text-primary underline">Contact us</Link>.</span>
            </p>
            <div className="mt-8">
              <Link href="/pricing" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
                See the plans <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <FinalCTA freeMembers={lowerFirst(platformConfig.planDefs.free.membersLabel)} />
    </>
  );
}
