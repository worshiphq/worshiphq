import Link from "next/link";
import { Logo, LogoMark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

/**
 * Shows the church's own logo + name top-left when a logo is set; otherwise
 * falls back to the WorshipHQ wordmark. `collapsed` shows just the mark.
 */
export function ChurchLogo({
  logo,
  name,
  href = "/app",
  collapsed = false,
}: {
  logo?: string | null;
  name: string;
  href?: string;
  collapsed?: boolean;
}) {
  if (!logo) {
    return collapsed ? <LogoMark className="size-8" /> : <Logo href={href} />;
  }

  return (
    <Link href={href} className="inline-flex items-center gap-2.5 transition-opacity hover:opacity-90">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logo} alt={name} className="size-8 shrink-0 rounded-lg object-cover ring-1 ring-line" />
      {!collapsed && (
        <span className={cn("max-w-[10rem] truncate font-display text-base font-semibold tracking-tight text-ink")}>
          {name}
        </span>
      )}
    </Link>
  );
}
