import { Aurora, GridBackdrop } from "./aurora";
import { Badge } from "@/components/ui/badge";

export function PageHero({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: React.ReactNode;
  subtitle: string;
}) {
  return (
    <section className="relative overflow-hidden pt-36 pb-12 text-center sm:pt-44">
      <Aurora intensity="soft" />
      <GridBackdrop />
      <div className="relative mx-auto max-w-3xl px-5">
        <Badge variant="primary" className="mb-5">
          {eyebrow}
        </Badge>
        <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
          {title}
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-ink-muted">{subtitle}</p>
      </div>
    </section>
  );
}
