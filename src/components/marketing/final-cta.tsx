import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { Aurora } from "./aurora";
import { brand } from "@/config/brand";

export function FinalCTA() {
  return (
    <section className="relative px-5 py-20">
      <Reveal className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-b from-primary/15 to-surface px-6 py-16 text-center sm:py-20">
        <Aurora intensity="soft" />
        <div className="relative">
          <h2 className="mx-auto max-w-2xl font-display text-4xl font-bold tracking-tight sm:text-5xl">
            Give your ministry the headquarters it deserves
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-ink-muted">
            Join churches across {brand.region.country} running everything in one beautiful place.
            Free forever for up to 50 members.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/sign-up">
              <Button size="lg" className="group">
                Start free
                <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
              </Button>
            </Link>
            <Link href="/sign-in">
              <Button size="lg" variant="glass">
                View live demo
              </Button>
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
