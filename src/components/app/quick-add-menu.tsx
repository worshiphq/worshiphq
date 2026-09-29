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

export function QuickAddMenu() {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
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
    setHighlighted(0);
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
    if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setHighlighted((h) => Math.min(h + 1, ACTIONS.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlighted((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); go(ACTIONS[highlighted].href); }
  }

  return (
    <div className="relative" ref={ref} data-tour="quick-add" onKeyDown={onKeyDown}>
      <Button size="sm" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <Plus className="size-4" /> Quick add
      </Button>
      {open && (
        <div
          role="menu"
          className={`absolute right-0 z-30 w-52 overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-xl animate-pop-in ${openUpward ? "bottom-full mb-2" : "top-full mt-2"}`}
        >
          {ACTIONS.map((a, i) => (
            <button
              key={a.label}
              role="menuitem"
              onMouseEnter={() => setHighlighted(i)}
              onClick={() => go(a.href)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${i === highlighted ? "bg-surface-2" : "hover:bg-surface-2"}`}
            >
              <a.icon className={`size-4 ${a.color}`} />
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
