"use client";

import { cn } from "@/lib/utils";

export function Wave({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      role="status"
      className={cn("inline-flex items-end justify-center gap-[3px]", className)}
      {...props}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          aria-hidden="true"
          className="inline-block w-[3px] rounded-full bg-current animate-wave"
          style={{
            height: [10, 16, 20, 16, 10][i],
            animationDelay: `${i * 0.12}s`,
          }}
        />
      ))}
      <span className="sr-only">Loading</span>
    </span>
  );
}
