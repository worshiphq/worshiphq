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
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="relative" ref={ref} data-tour="quick-add">
      <Button size="sm" onClick={() => setOpen((o) => !o)}>
        <Plus className="size-4" /> Quick add
      </Button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-52 overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-xl">
          {ACTIONS.map((a) => (
            <button
              key={a.label}
              onClick={() => {
                setOpen(false);
                router.push(a.href);
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-surface-2"
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
