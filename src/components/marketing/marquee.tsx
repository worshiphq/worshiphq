"use client";

import { motion } from "motion/react";
import { useReducedMotionSafe } from "@/hooks/use-reduced-motion";

const WORDS = [
  "Attendance at the door", "Bulk SMS", "Tithes & offerings", "Day Born", "Absentee follow-up", "Birthday texts",
  "Mobile Money giving", "Harvest & pledges", "Church accounts", "Visitors", "Rosters", "Monday briefing", "Branches",
];

/** A slow band of what WorshipHQ covers, between the hero and the page. Stands still when less motion is asked for. */
export function Marquee() {
  const reduce = useReducedMotionSafe();
  const row = (
    <div className="flex shrink-0 items-center">
      {WORDS.map((w) => (
        <span key={w} className="flex items-center whitespace-nowrap">
          <span className="px-7 font-display text-lg font-semibold tracking-tight text-parchment/85 sm:text-xl">{w}</span>
          <span className="text-brass">✦</span>
        </span>
      ))}
    </div>
  );
  return (
    <div className="relative overflow-hidden border-y border-brass/25 bg-evergreen-deep py-4" aria-hidden>
      <motion.div className="flex w-max" animate={reduce ? undefined : { x: ["0%", "-50%"] }} transition={{ duration: 48, repeat: Infinity, ease: "linear" }}>
        {row}
        {row}
      </motion.div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-evergreen-deep to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-evergreen-deep to-transparent" />
    </div>
  );
}
