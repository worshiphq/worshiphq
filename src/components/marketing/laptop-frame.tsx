import { cn } from "@/lib/utils";

/** A sleek laptop frame to showcase the dashboard mockup as a living product shot. */
export function LaptopFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("relative w-full", className)}>
      {/* Screen */}
      <div className="relative rounded-2xl border border-line bg-[#0c0c12] p-2 shadow-[0_40px_120px_-30px_rgba(109,94,248,0.45)]">
        <div className="overflow-hidden rounded-lg ring-1 ring-white/5">
          <div className="aspect-[16/10] w-full">{children}</div>
        </div>
        {/* camera dot */}
        <div className="absolute left-1/2 top-3 size-1 -translate-x-1/2 rounded-full bg-white/20" />
      </div>
      {/* Base / hinge */}
      <div className="relative mx-auto h-3 w-[104%] -translate-x-[2%] rounded-b-xl border-x border-b border-line bg-gradient-to-b from-[#15151d] to-[#0a0a0f]">
        <div className="absolute left-1/2 top-0 h-1 w-24 -translate-x-1/2 rounded-b-md bg-black/40" />
      </div>
    </div>
  );
}
