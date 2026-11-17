import { cn } from "@/lib/utils";

/**
 * A number plate in the Ghana style: white plate, dark border, dark mono letters, a small GH strip on the left.
 * Plates are white in light and dark mode alike, so the colours are fixed (never white text on a theme colour).
 */
export function Plate({ reg, size = "md", className }: { reg: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const s = size === "lg" ? "h-11 text-xl" : size === "sm" ? "h-6 text-[11px]" : "h-8 text-sm";
  return (
    <span
      className={cn("inline-flex shrink-0 items-stretch overflow-hidden rounded-md border-2 font-mono font-bold tracking-wider", s, className)}
      style={{ background: "#ffffff", borderColor: "#1c1a16", color: "#1c1a16" }}
      aria-label={`Number plate ${reg}`}
    >
      <span className="flex flex-col items-center justify-center px-1 text-[0.5em] leading-none" style={{ background: "#1c1a16", color: "#ffffff" }} aria-hidden>
        <span>GH</span>
      </span>
      <span className="flex items-center whitespace-nowrap px-2">{reg}</span>
    </span>
  );
}
