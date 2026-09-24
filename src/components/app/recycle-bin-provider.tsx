"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { RotateCcw, Trash2, X } from "lucide-react";
import { BouncingDots } from "@/components/ui/bouncing-dots";
import { useFeedback } from "@/components/ui/feedback";
import { onRecycleBinChanged, onFlyToBin, type FlyToBinOrigin } from "@/lib/recycle-bin-events";
import { getRecycleBinCount, getRecycleBinItems, restoreRecycleBinItem, purgeRecycleBinItem, type RecycleBinItem } from "@/app/actions/recycle-bin";

type Ghost = { id: number; from: FlyToBinOrigin; to: DOMRect };

const RecycleBinContext = createContext<{ refresh: () => void } | null>(null);

/** Anywhere in the tree can grab this to say "the bin's contents may have
 *  changed" (e.g. after a delete outside DeleteForm). No-ops if the provider
 *  isn't mounted, so it's safe to call from components that render on pages
 *  without the app shell. */
export function useRecycleBinRefresh(): () => void {
  const ctx = useContext(RecycleBinContext);
  return ctx?.refresh ?? (() => {});
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function BinIcon({ lidKick }: { lidKick: number }) {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none">
      <motion.g
        style={{ transformBox: "fill-box", transformOrigin: "15% 25%" }}
        animate={lidKick ? { rotate: [0, -30, 0] } : { rotate: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      >
        <path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </motion.g>
      <path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function RecycleBinProvider({ children, canManage }: { children: React.ReactNode; canManage: boolean }) {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<RecycleBinItem[] | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lidKick, setLidKick] = useState(0);
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const binRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const { toast } = useFeedback();

  const refreshCount = useCallback(() => {
    if (!canManage) return;
    getRecycleBinCount().then(setCount).catch(() => {});
  }, [canManage]);

  const refreshList = useCallback(() => {
    if (!canManage) return;
    setLoadingList(true);
    getRecycleBinItems()
      .then((list) => setItems(list))
      .catch(() => toast("Couldn't load the recycle bin.", "error"))
      .finally(() => setLoadingList(false));
  }, [canManage, toast]);

  useEffect(() => refreshCount(), [refreshCount, pathname]);
  useEffect(() => onRecycleBinChanged(() => { refreshCount(); if (open) refreshList(); }), [refreshCount, refreshList, open]);

  useEffect(
    () =>
      onFlyToBin((from) => {
        const to = binRef.current?.getBoundingClientRect();
        if (!to) return;
        const id = Date.now() + Math.random();
        setGhosts((g) => [...g, { id, from, to }]);
        setTimeout(() => {
          setGhosts((g) => g.filter((x) => x.id !== id));
          setLidKick((k) => k + 1);
        }, 500);
      }),
    [],
  );

  useEffect(() => {
    if (open) refreshList();
  }, [open, refreshList]);

  if (!canManage) return <>{children}</>;

  async function handleRestore(item: RecycleBinItem) {
    setBusyId(item.id);
    const result = await restoreRecycleBinItem(item.id, item.source);
    setBusyId(null);
    if (result?.ok) {
      toast(`Restored "${item.label}"`, "success");
      setItems((list) => list?.filter((x) => x.id !== item.id) ?? null);
      refreshCount();
    } else {
      toast(result?.error ?? "Couldn't restore that.", "error");
    }
  }

  async function handlePurge(item: RecycleBinItem) {
    if (!window.confirm(`Permanently delete "${item.label}"? This can't be undone.`)) return;
    setBusyId(item.id);
    const result = await purgeRecycleBinItem(item.id, item.source);
    setBusyId(null);
    if (result?.ok) {
      toast("Permanently deleted", "success");
      setItems((list) => list?.filter((x) => x.id !== item.id) ?? null);
      refreshCount();
    } else {
      toast(result?.error ?? "Couldn't delete that.", "error");
    }
  }

  return (
    <RecycleBinContext.Provider value={{ refresh: () => { refreshCount(); if (open) refreshList(); } }}>
      {children}

      {/* ── Flying ghosts: a small trash glyph traveling from the deleted row to the bin ── */}
      {ghosts.map((g) => (
        <motion.div
          key={g.id}
          initial={{ left: g.from.x, top: g.from.y, width: g.from.width, height: g.from.height, opacity: 1, scale: 1 }}
          animate={{
            left: g.to.left + g.to.width / 2 - 8,
            top: g.to.top + g.to.height / 2 - 8,
            width: 16,
            height: 16,
            opacity: 0.15,
            scale: 0.4,
          }}
          transition={{ duration: 0.5, ease: "easeIn" }}
          className="pointer-events-none z-[70] grid place-items-center rounded-md bg-danger/80 text-white"
          style={{ position: "fixed" }}
        >
          <Trash2 className="size-3.5" />
        </motion.div>
      ))}

      {/* ── Floating action button ── */}
      <motion.button
        ref={binRef}
        onClick={() => setOpen(true)}
        whileTap={{ scale: 0.92 }}
        className="fixed bottom-24 right-5 z-40 grid size-14 place-items-center rounded-full border border-line bg-surface text-ink-muted shadow-lg transition-colors hover:text-danger"
        aria-label="Recycle bin"
      >
        <BinIcon lidKick={lidKick} />
        <AnimatePresence>
          {count > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -right-1 -top-1 grid min-w-[1.25rem] place-items-center rounded-full bg-danger px-1 text-[11px] font-bold leading-5 text-white"
            >
              {count > 99 ? "99+" : count}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      {/* ── Drawer ── */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
              className="fixed inset-y-0 right-0 z-[65] flex w-full max-w-sm flex-col border-l border-line bg-surface shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <div>
                  <h2 className="font-display text-lg font-bold text-ink">Recycle bin</h2>
                  <p className="text-xs text-ink-muted">Restore anything deleted by mistake.</p>
                </div>
                <button onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-lg text-ink-muted hover:bg-surface-2">
                  <X className="size-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-3 py-3">
                {loadingList && !items ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-faint">
                    <BouncingDots className="size-4" /> Loading…
                  </div>
                ) : !items || items.length === 0 ? (
                  <div className="grid place-items-center gap-2 py-14 text-center text-sm text-ink-faint">
                    <Trash2 className="size-8 text-ink-faint/60" />
                    Nothing here right now.
                  </div>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {items.map((item) => (
                      <li key={`${item.source}-${item.id}`} className="rounded-xl border border-line bg-surface-2/50 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{item.entityLabel}</span>
                            <p className="truncate text-sm font-semibold text-ink">{item.label}</p>
                            {item.detail && <p className="truncate text-xs text-ink-muted">{item.detail}</p>}
                            <p className="mt-0.5 text-[11px] text-ink-faint">
                              Deleted {timeAgo(item.deletedAt)}
                              {item.deletedByName ? ` by ${item.deletedByName}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            onClick={() => handleRestore(item)}
                            disabled={busyId === item.id}
                            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition-opacity disabled:opacity-60"
                          >
                            {busyId === item.id ? (
                              <>
                                <BouncingDots className="size-3.5" /> Restoring…
                              </>
                            ) : (
                              <>
                                <RotateCcw className="size-3.5" /> Restore
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => handlePurge(item)}
                            disabled={busyId === item.id}
                            className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-60"
                            aria-label="Delete forever"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </RecycleBinContext.Provider>
  );
}
