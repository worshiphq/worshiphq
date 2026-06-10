import Link from "next/link";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

/** WorshipHQ wordmark + mark. "HQ" is visually emphasized per brand guidelines. */
export function Logo({
  className,
  href = "/",
  showMark = true,
  size = "md",
}: {
  className?: string;
  href?: string | null;
  showMark?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const text = {
    sm: "text-base",
    md: "text-lg",
    lg: "text-2xl",
  }[size];

  const inner = (
    <span className={cn("inline-flex items-center gap-2.5 font-display font-semibold tracking-tight", text)}>
      {showMark && <LogoMark className={cn(size === "lg" ? "size-9" : "size-7")} />}
      <span className="text-ink">
        {brand.nameParts.lead}
        <span className="text-gradient-primary font-bold">{brand.nameParts.accent}</span>
      </span>
    </span>
  );

  if (href === null) return <span className={cn("inline-flex", className)}>{inner}</span>;
  return (
    <Link href={href} className={cn("inline-flex transition-opacity hover:opacity-90", className)}>
      {inner}
    </Link>
  );
}

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-surface-2 to-base shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-line",
        className,
      )}
    >
      <svg viewBox="0 0 512 512" className="size-[62%]" fill="none" aria-hidden>
        <defs>
          <linearGradient id="lm" x1="120" y1="150" x2="400" y2="380" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0d7377" />
            <stop offset="1" stopColor="#0d9488" />
          </linearGradient>
        </defs>
        <path
          d="M256 96 L300 140 L300 170 L350 170 L350 416 L300 416 L300 280 L212 280 L212 416 L162 416 L162 170 L212 170 L212 140 Z"
          fill="url(#lm)"
        />
        <circle cx="256" cy="200" r="18" fill="#E5B567" />
      </svg>
    </span>
  );
}
