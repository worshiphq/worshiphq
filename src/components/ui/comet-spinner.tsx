"use client";

import { cn } from "@/lib/utils";

export function CometSpinner({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn("relative inline-flex items-center justify-center", className)}
      {...props}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-full border-2 border-current/20"
      />
      <span
        aria-hidden="true"
        className="whq-spin absolute inset-0 rounded-full border-2 border-transparent border-t-current"
      />
      <span className="sr-only">Loading</span>
    </span>
  );
}
