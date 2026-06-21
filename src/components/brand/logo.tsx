import Link from "next/link";
import { cn } from "@/lib/utils";

/** WorshipHQ horizontal wordmark (logo2.png) — ideal for navbars and headers. */
export function Logo({
  className,
  href = "/",
  size = "md",
  variant = "horizontal",
}: {
  className?: string;
  href?: string | null;
  showMark?: boolean;
  size?: "sm" | "md" | "lg";
  variant?: "horizontal" | "stacked";
}) {
  const h = { sm: "h-8", md: "h-10", lg: "h-14" }[size];
  const src = variant === "stacked" ? "/logo.png" : "/logo2.png";

  const inner = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="WorshipHQ"
      className={cn("w-auto object-contain", h)}
    />
  );

  if (href === null) return <span className={cn("inline-flex", className)}>{inner}</span>;
  return (
    <Link href={href} className={cn("inline-flex transition-opacity hover:opacity-90", className)}>
      {inner}
    </Link>
  );
}

/** The WorshipHQ square shield mark (icon2.png) — for collapsed sidebar, avatars. */
export function LogoMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/icon2.png"
      alt="WorshipHQ"
      className={cn("shrink-0 object-contain", className)}
    />
  );
}
