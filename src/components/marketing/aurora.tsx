import { cn } from "@/lib/utils";

/** Animated aurora/gradient atmosphere for dark sections. Pure CSS, GPU-friendly. */
export function Aurora({ className, intensity = "default" }: { className?: string; intensity?: "default" | "soft" | "strong" }) {
  const op = intensity === "strong" ? "opacity-50" : intensity === "soft" ? "opacity-25" : "opacity-40";
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden>
      <div
        className={cn(
          "absolute -top-40 left-1/2 size-[46rem] -translate-x-1/2 rounded-full blur-[130px] animate-aurora",
          op,
        )}
        style={{ background: "radial-gradient(circle at center, #8E7BFF 0%, transparent 65%)" }}
      />
      <div
        className="absolute -top-20 right-[8%] size-[34rem] rounded-full opacity-30 blur-[130px] animate-float-slow"
        style={{ background: "radial-gradient(circle at center, #B79BFF 0%, transparent 65%)" }}
      />
      <div
        className="absolute top-40 left-[6%] size-[30rem] rounded-full opacity-25 blur-[130px] animate-float"
        style={{ background: "radial-gradient(circle at center, #F0C97A 0%, transparent 70%)" }}
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
          "radial-gradient(circle at 1px 1px, rgba(28,26,22,0.06) 1px, transparent 0)",
        backgroundSize: "32px 32px",
        maskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, black 30%, transparent 75%)",
        WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, black 30%, transparent 75%)",
      }}
    />
  );
}
