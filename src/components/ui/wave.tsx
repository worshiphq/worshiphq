"use client";

import { cn } from "@/lib/utils";

const BARS = [10, 16, 20, 16, 10];

export function Wave({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      role="status"
      className={cn("inline-flex items-end justify-center gap-[3px]", className)}
      {...props}
    >
      {BARS.map((h, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="inline-block w-[3px] rounded-full bg-current"
          style={{
            height: h,
            animation: "wave-bar 1s ease-in-out infinite",
            animationDelay: `${i * 120}ms`,
          }}
        />
      ))}
      <span className="sr-only">Loading</span>
    </span>
  );
}
