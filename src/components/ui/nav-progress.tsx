"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * A slim top progress bar that gives instant feedback on navigation. It starts
 * when an internal link/button is clicked and completes once the new route's
 * pathname (or query) resolves. No dependencies.
 */
export function NavProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  function clearTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }

  function start() {
    clearTimers();
    setVisible(true);
    setProgress(8);
    // Creep toward 90% so it always feels alive while the route loads.
    timers.current.push(setTimeout(() => setProgress(35), 120));
    timers.current.push(setTimeout(() => setProgress(62), 320));
    timers.current.push(setTimeout(() => setProgress(82), 700));
  }

  function done() {
    clearTimers();
    setProgress(100);
    timers.current.push(setTimeout(() => setVisible(false), 220));
    timers.current.push(setTimeout(() => setProgress(0), 460));
  }

  // Intercept clicks on internal links to start the bar immediately.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const el = (e.target as HTMLElement)?.closest("a");
      if (!el) return;
      const href = el.getAttribute("href");
      if (!href || href.startsWith("#") || el.target === "_blank") return;
      try {
        const url = new URL(href, window.location.href);
        if (url.origin !== window.location.origin) return;
        if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      } catch {
        return;
      }
      start();
    }
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true } as EventListenerOptions);
  }, []);

  // Complete the bar whenever the route actually changes.
  useEffect(() => {
    done();
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  if (!visible && progress === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[120] h-0.5">
      <div
        className="h-full bg-gradient-to-r from-[#0d7377] to-[#0d9488] shadow-[0_0_10px_rgba(13,148,136,0.7)] transition-[width,opacity] duration-200 ease-out"
        style={{ width: `${progress}%`, opacity: visible ? 1 : 0 }}
      />
    </div>
  );
}
