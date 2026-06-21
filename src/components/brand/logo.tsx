import Link from "next/link";
import { cn } from "@/lib/utils";

/** WorshipHQ full logo from logo.png (wide horizontal wordmark). */
export function Logo({
  className,
  href = "/",
  size = "md",
}: {
  className?: string;
  href?: string | null;
  showMark?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const w = { sm: "w-32", md: "w-40", lg: "w-52" }[size];

  const inner = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="WorshipHQ"
      className={cn("object-contain", w)}
    />
  );

  if (href === null) return <span className={cn("inline-flex", className)}>{inner}</span>;
  return (
    <Link href={href} className={cn("inline-flex transition-opacity hover:opacity-90", className)}>
      {inner}
    </Link>
  );
}

/** The WorshipHQ square shield mark — for favicons, collapsed sidebar, avatars. */
export function LogoMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo2.png"
      alt="WorshipHQ"
      className={cn("shrink-0 object-contain", className)}
    />
  );
}
