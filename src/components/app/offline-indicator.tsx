"use client";

import { CloudOff, Wifi } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useOnline } from "@/hooks/use-online";

/** Shows an "offline — changes will sync" pill when the connection drops. */
export function OfflineIndicator() {
  const online = useOnline();
  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-3 py-1.5 text-xs font-medium text-warning"
        >
          <CloudOff className="size-3.5" />
          <span className="hidden sm:inline">Offline · changes will sync</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Small "synced" status used on dashboard. */
export function SyncStatus() {
  const online = useOnline();
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-faint">
      {online ? (
        <>
          <Wifi className="size-3.5 text-success" /> All changes synced
        </>
      ) : (
        <>
          <CloudOff className="size-3.5 text-warning" /> Working offline
        </>
      )}
    </span>
  );
}
