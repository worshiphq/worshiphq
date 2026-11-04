"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";

/**
 * A link for the signed-in app that prepares its page only when someone shows intent: hovering with a mouse, or
 * touching it on a phone. Next's normal behaviour prepares every link as soon as it scrolls into view, so a list of
 * 50 groups made 50 server requests whether or not anyone clicked. On a plan that bills server CPU, that cost grows
 * with every church that joins.
 *
 * Pass `prefetch` to override this for one link.
 */
export default function AppLink({ prefetch, onMouseEnter, onTouchStart, onFocus, ...props }: ComponentProps<typeof Link>) {
  const [intent, setIntent] = useState(false);
  return (
    <Link
      {...props}
      prefetch={prefetch !== undefined ? prefetch : intent ? null : false}
      onMouseEnter={(e) => { setIntent(true); onMouseEnter?.(e); }}
      onTouchStart={(e) => { setIntent(true); onTouchStart?.(e); }}
      onFocus={(e) => { setIntent(true); onFocus?.(e); }}
    />
  );
}
