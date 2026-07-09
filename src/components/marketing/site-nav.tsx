"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

const links = [
  { label: "Features", href: "/features" },
  { label: "Solutions", href: "/solutions" },
  { label: "Pricing", href: "/pricing" },
  { label: "About", href: "/about" },
];

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The homepage opens on a dark full-screen slider — use light text until scrolled.
  const overDark = pathname === "/" && !scrolled && !open;

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled || open
          ? "border-b border-ink/10 bg-parchment/95 shadow-[0_8px_24px_-18px_rgba(28,26,22,0.4)] backdrop-blur-md"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Logo href="/" size="sm" className={cn(overDark && "brightness-0 invert")} />

        <div className="hidden items-center md:flex">
          {links.map((l, i) => (
            <span key={l.href} className="flex items-center">
              {i > 0 && <span className={cn("mx-1 text-[8px]", overDark ? "text-brass" : "text-brass/60")}>✦</span>}
              <Link
                href={l.href}
                className={cn(
                  "px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors",
                  overDark ? "text-parchment/85 hover:text-white" : "text-ink-muted hover:text-evergreen",
                )}
              >
                {l.label}
              </Link>
            </span>
          ))}
        </div>

        <div className="hidden items-center gap-5 md:flex">
          <Link
            href="/sign-in"
            className={cn(
              "text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors",
              overDark ? "text-parchment/85 hover:text-white" : "text-ink-muted hover:text-evergreen",
            )}
          >
            Log in
          </Link>
          <Link
            href="/sign-up"
            className={cn(
              "rounded-full px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.15em] transition-colors",
              overDark
                ? "bg-parchment text-evergreen-deep hover:bg-white"
                : "border border-evergreen bg-evergreen text-parchment hover:bg-evergreen-deep",
            )}
          >
            Get started
          </Link>
        </div>

        <button
          className={cn("grid size-10 place-items-center md:hidden", overDark ? "text-parchment" : "text-ink")}
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </nav>

      {open && (
        <div className="border-t border-ink/10 bg-parchment px-5 pb-6 pt-3 md:hidden">
          <div className="flex flex-col">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="border-b border-ink/8 py-3.5 text-sm font-medium text-ink"
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-4 flex flex-col gap-2.5">
              <Link
                href="/sign-in"
                onClick={() => setOpen(false)}
                className="rounded-full border border-ink/20 py-3 text-center text-sm font-semibold text-ink"
              >
                Log in
              </Link>
              <Link
                href="/sign-up"
                onClick={() => setOpen(false)}
                className="rounded-full bg-evergreen py-3 text-center text-sm font-semibold text-parchment"
              >
                Get started
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
