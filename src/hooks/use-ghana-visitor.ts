"use client";

import { useEffect, useState } from "react";

/**
 * True when the visitor's device is set to Ghana time (Africa/Accra), so public pages can show cedi prices.
 * Worked out in the browser on purpose: the marketing pages stay static (no per-request server work), and
 * the price simply switches from dollars to cedis a moment after the page loads.
 */
export function useGhanaVisitor(): boolean {
  const [ghana, setGhana] = useState(false);
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one read of the device setting after hydration
      setGhana(tz === "Africa/Accra");
    } catch {
      /* stay on dollars */
    }
  }, []);
  return ghana;
}
