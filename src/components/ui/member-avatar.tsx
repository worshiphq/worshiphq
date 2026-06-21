"use client";

import { cn } from "@/lib/utils";

const SIZES = { xs: "size-7", sm: "size-9", md: "size-11", lg: "size-16", xl: "size-24" } as const;
const ICON_SIZES = { xs: "size-4", sm: "size-5", md: "size-6", lg: "size-9", xl: "size-14" } as const;

/**
 * Member avatar with photo support and gendered default silhouette.
 * Falls back to a grey male/female icon when no photo is available.
 */
export function MemberAvatar({
  name,
  photoUrl,
  gender,
  size = "md",
  className,
}: {
  name: string;
  photoUrl?: string | null;
  gender?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name}
        className={cn(SIZES[size], "shrink-0 rounded-full object-cover ring-2 ring-surface", className)}
      />
    );
  }

  const isFemale = gender?.toLowerCase().startsWith("f");

  return (
    <div
      className={cn(
        SIZES[size],
        "relative shrink-0 overflow-hidden rounded-full bg-surface-2 ring-2 ring-line",
        className,
      )}
      aria-label={name}
    >
      <svg
        viewBox="0 0 36 36"
        fill="none"
        className={cn("absolute inset-0", SIZES[size], "text-ink-faint/40")}
        aria-hidden
      >
        {isFemale ? (
          /* Female silhouette — longer hair, softer shoulders */
          <>
            <circle cx="18" cy="13" r="6" fill="currentColor" />
            <ellipse cx="18" cy="14" rx="7.5" ry="4" fill="currentColor" opacity="0.3" />
            <path d="M8 32 C8 24 12 20 18 20 C24 20 28 24 28 32" fill="currentColor" />
          </>
        ) : (
          /* Male silhouette — shorter hair, broader shoulders */
          <>
            <circle cx="18" cy="13" r="5.5" fill="currentColor" />
            <path d="M7 32 C7 23 11 20 18 20 C25 20 29 23 29 32" fill="currentColor" />
          </>
        )}
      </svg>
    </div>
  );
}
