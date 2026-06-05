import { cn } from "@/lib/utils";

/** Animated aurora/gradient atmosphere for dark sections. Pure CSS, GPU-friendly. */
export function Aurora({ className, intensity = "default" }: { className?: string; intensity?: "default" | "soft" | "strong" }) {
  const op = intensity === "strong" ? "opacity-90" : intensity === "soft" ? "opacity-40" : "opacity-60";
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden>
      <div
        className={cn(
          "absolute -top-40 left-1/2 size-[46rem] -translate-x-1/2 rounded-full blur-[120px] animate-aurora",
          op,
        )}
        style={{ background: "radial-gradient(circle at center, #6D5EF8 0%, transparent 65%)" }}
      />
      <div
        className="absolute -top-20 right-[8%] size-[34rem] rounded-full opacity-50 blur-[120px] animate-float-slow"
        style={{ background: "radial-gradient(circle at center, #9B6DFF 0%, transparent 65%)" }}
      />
      <div
        className="absolute top-40 left-[6%] size-[30rem] rounded-full opacity-30 blur-[120px] animate-float"
        style={{ background: "radial-gradient(circle at center, #E5B567 0%, transparent 70%)" }}
      />
    </div>
  );
}

/** Subtle dotted grid backdrop. */
export function GridBackdrop({ className }: { className?: string }) {
  return (
    <div
      className={cn("pointer-events-none absolute inset-0", className)}
      aria-hidden
      style={{
        backgroundImage:
          "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0)",
        backgroundSize: "32px 32px",
        maskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, black 30%, transparent 75%)",
        WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, black 30%, transparent 75%)",
      }}
    />
  );
}
