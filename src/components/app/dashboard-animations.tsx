"use client";

import { useEffect, useRef } from "react";

/**
 * Wraps the dashboard and applies scroll-triggered fade-up animations
 * to all child elements with data-animate attributes.
 */
export function DashboardAnimations({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    // Find all elements with data-animate
    const targets = root.querySelectorAll<HTMLElement>("[data-animate]");

    // Set initial state
    targets.forEach((el) => {
      const type = el.dataset.animate;
      if (type === "stagger") {
        // Stagger children
        Array.from(el.children).forEach((child, i) => {
          const c = child as HTMLElement;
          c.style.opacity = "0";
          c.style.transform = "translateY(20px)";
          c.style.transition = `opacity 0.5s cubic-bezier(0.22,1,0.36,1) ${i * 0.08}s, transform 0.5s cubic-bezier(0.22,1,0.36,1) ${i * 0.08}s`;
        });
      } else {
        el.style.opacity = "0";
        el.style.transform = "translateY(20px)";
        el.style.transition = "opacity 0.6s cubic-bezier(0.22,1,0.36,1), transform 0.6s cubic-bezier(0.22,1,0.36,1)";
      }
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target as HTMLElement;
          const type = el.dataset.animate;
          if (type === "stagger") {
            Array.from(el.children).forEach((child) => {
              const c = child as HTMLElement;
              c.style.opacity = "1";
              c.style.transform = "translateY(0)";
            });
          } else {
            el.style.opacity = "1";
            el.style.transform = "translateY(0)";
          }
          observer.unobserve(el);
        });
      },
      { threshold: 0.1, rootMargin: "-40px" },
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return <div ref={ref}>{children}</div>;
}
