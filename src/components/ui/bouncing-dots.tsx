"use client";

import { cn } from "@/lib/utils";

export function BouncingDots({
  className,
  dots = 3,
  ...props
}: React.ComponentProps<"span"> & { dots?: number }) {
  return (
    <span
      role="status"
      className={cn("inline-flex items-center gap-[12%]", className)}
      {...props}
    >
      {Array.from({ length: dots }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="inline-block aspect-square grow rounded-full bg-current"
          style={{
            animation: "bounce-dot 1.4s ease-in-out infinite",
            animationDelay: `${i * 200}ms`,
          }}
        />
      ))}
      <span className="sr-only">Loading</span>
    </span>
  );
}
