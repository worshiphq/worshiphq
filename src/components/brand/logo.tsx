import Link from "next/link";
import { cn } from "@/lib/utils";

const NAVY = "#16345C";
const GOLD = "#C8941F";

/** WorshipHQ wordmark + mark. "HQ" is gold per the brand. */
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
  const text = { sm: "text-base", md: "text-lg", lg: "text-2xl" }[size];

  const inner = (
    <span className={cn("inline-flex items-center gap-2.5 font-display font-bold tracking-tight", text)}>
      {showMark && <LogoMark className={cn(size === "lg" ? "size-10" : "size-8")} />}
      <span>
        <span style={{ color: NAVY }} className="dark:text-white">Worship</span>
        <span style={{ color: GOLD }}>HQ</span>
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

/** The WorshipHQ icon: hexagon shield, gold cross, people cupped in hands, circuit traces. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={cn("shrink-0", className)} fill="none" aria-hidden>
      {/* Hexagon shield */}
      <path d="M256 104 L396 186 L396 326 L256 408 L116 326 L116 186 Z" fill="none" stroke={NAVY} strokeWidth="20" strokeLinejoin="round" />
      {/* Cross */}
      <rect x="240" y="150" width="32" height="122" rx="4" fill={GOLD} />
      <rect x="210" y="182" width="92" height="30" rx="4" fill={GOLD} />
      {/* Cupping hands / leaves */}
      <path d="M256 432 C 198 422 150 386 150 316 C 202 342 242 388 256 432 Z" fill={NAVY} />
      <path d="M256 432 C 314 422 362 386 362 316 C 310 342 270 388 256 432 Z" fill={NAVY} />
      {/* People */}
      <circle cx="256" cy="300" r="27" fill={NAVY} />
      <path d="M212 364 C 212 326 300 326 300 364 Z" fill={NAVY} />
      <circle cx="204" cy="318" r="19" fill={NAVY} />
      <path d="M175 362 C 175 334 233 334 233 362 Z" fill={NAVY} />
      <circle cx="308" cy="318" r="19" fill={NAVY} />
      <path d="M279 362 C 279 334 337 334 337 362 Z" fill={NAVY} />
      {/* Circuit traces */}
      <g stroke={GOLD} strokeWidth="6" fill="none" strokeLinecap="round">
        <path d="M150 364 H112 M112 364 V392" />
        <path d="M138 388 H120 M120 388 V404" />
        <path d="M362 364 H400 M400 364 V392" />
        <path d="M374 388 H392 M392 388 V404" />
      </g>
      <g fill={GOLD}>
        <circle cx="112" cy="398" r="7" />
        <circle cx="120" cy="410" r="6" />
        <circle cx="400" cy="398" r="7" />
        <circle cx="392" cy="410" r="6" />
      </g>
    </svg>
  );
}
