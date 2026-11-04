"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Instant feedback when someone taps a link. Pages are no longer all loaded ahead of time, so a tap can take a moment
 * on a slow connection, and with nothing moving people assume it did not register and tap again. This shows the moment
 * they tap, and goes away when the new page arrives.
 */
function Tracker({ onChange }: { onChange: () => void }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => { onChange(); }, [pathname, search, onChange]);
  return null;
}

const clear = (set: (v: boolean) => void) => () => set(false);

export function NavProgress() {
  const [active, setActive] = useState(false);
  const [done] = useState(() => clear(setActive));

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || !a.href || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      setActive(true);
    };
    // The capture phase, because Next's Link cancels the browser's default click before it would bubble up to here.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (!active) return;
    // Never leave it on screen if a navigation is abandoned.
    const t = setTimeout(() => setActive(false), 15_000);
    return () => clearTimeout(t);
  }, [active]);

  return (
    <>
      <Suspense fallback={null}><Tracker onChange={done} /></Suspense>
      {active && (
        <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-0 z-[100]">
          <div className="h-[3px] w-full animate-pulse bg-primary" />
          <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs font-semibold text-ink shadow-lg">
            <span className="size-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
            Loading...
          </div>
        </div>
      )}
    </>
  );
}
