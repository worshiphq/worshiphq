"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, UserPlus, HandCoins, Send, CalendarPlus, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";

const ACTIONS = [
  { icon: UserPlus, label: "Add member", href: "/app/people", color: "text-primary-bright" },
  { icon: HandCoins, label: "Record gift", href: "/app/giving", color: "text-gold" },
  { icon: QrCode, label: "Take attendance", href: "/app/attendance", color: "text-success" },
  { icon: Send, label: "Send SMS", href: "/app/communications", color: "text-info" },
  { icon: CalendarPlus, label: "New event", href: "/app/events", color: "text-primary-bright" },
];

/** Quick add: a small menu of shortcuts. Arrow keys, Home and End move through it (see KeyboardLayer); Escape closes it. */
export function QuickAddMenu() {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (!open || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const estimatedHeight = ACTIONS.length * 44 + 12;
    const spaceBelow = window.innerHeight - rect.bottom;
    setOpenUpward(spaceBelow < estimatedHeight && rect.top > spaceBelow);
  }, [open]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === "Escape") { e.preventDefault(); setOpen(false); triggerRef.current?.focus(); }
    else if (e.key === "Tab") setOpen(false);
  }

  // Leaving the menu with the keyboard (or a click elsewhere) closes it.
  function onBlur(e: React.FocusEvent) {
    if (open && !ref.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
  }

  return (
    <div className="relative" ref={ref} data-tour="quick-add" onKeyDown={onKeyDown} onBlur={onBlur}>
      <Button ref={triggerRef} size="sm" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <Plus className="size-4" aria-hidden /> Quick add
      </Button>
      {open && (
        <div
          role="menu"
          aria-label="Quick add"
          className={`absolute right-0 z-30 w-52 overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-xl animate-pop-in ${openUpward ? "bottom-full mb-2" : "top-full mt-2"}`}
        >
          {ACTIONS.map((a) => (
            <button
              key={a.label}
              type="button"
              role="menuitem"
              onClick={() => go(a.href)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-surface-2 focus:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50"
            >
              <a.icon className={`size-4 ${a.color}`} aria-hidden />
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
