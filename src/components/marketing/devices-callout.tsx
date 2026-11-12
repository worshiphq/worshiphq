"use client";

import Link from "next/link";
import { ArrowRight, Fingerprint, Hand, ScanFace, Wrench } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";

/** The door devices: what they do, and that we can supply and set them up. */
export function DevicesCallout() {
  const ways = [
    { icon: ScanFace, label: "Face", text: "Look at the device. Checked in." },
    { icon: Hand, label: "Palm", text: "Hold up a hand. Nothing to touch." },
    { icon: Fingerprint, label: "Fingerprint", text: "One touch at the door." },
  ];
  return (
    <section className="relative py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal>
          <div className="relative overflow-hidden bg-evergreen-deep px-6 py-14 text-parchment sm:px-12 sm:py-16">
            <div className="absolute inset-x-6 top-4 h-px bg-brass/40 sm:inset-x-10" aria-hidden />
            <div className="absolute inset-x-6 bottom-4 h-px bg-brass/40 sm:inset-x-10" aria-hidden />
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <div>
                <p className="rubric !text-brass">At the door</p>
                <h2 className="mt-5 font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
                  No register.
                  <br />
                  <span className="text-brass">No queue.</span>
                </h2>
                <p className="mt-5 max-w-md text-[15px] leading-[1.8] text-parchment/75">
                  Members check in with a face, palm or fingerprint as they arrive, and attendance fills in by name before the first song.
                  We supply the devices, install them at your entrance and set everything up, for a one-off fee.
                </p>
                <div className="mt-8 flex flex-wrap gap-4">
                  <Link href="/devices" className="group inline-flex items-center gap-2 rounded-full bg-parchment px-6 py-3 text-sm font-semibold text-evergreen-deep hover:bg-white">
                    How the devices work <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                  <Link href="/contact" className="inline-flex items-center gap-2 rounded-full border border-parchment/30 px-6 py-3 text-sm font-semibold hover:border-parchment/60">
                    <Wrench className="size-4 text-brass" /> Get a price for your church
                  </Link>
                </div>
                <p className="mt-4 text-xs text-parchment/50">Part of the Max plan. We supply and install the device for a one-off fee.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                {ways.map((w) => (
                  <div key={w.label} className="border border-parchment/15 bg-parchment/5 p-5">
                    <w.icon className="size-7 text-brass" strokeWidth={1.4} />
                    <div className="mt-4 font-display text-xl font-bold">{w.label}</div>
                    <p className="mt-1 text-sm text-parchment/70">{w.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
