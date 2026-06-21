"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { CometSpinner } from "@/components/ui/comet-spinner";

type ToastType = "success" | "error" | "info";
interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface FeedbackApi {
  /** Show a transient toast. */
  toast: (message: string, type?: ToastType) => void;
  /** Show the full-screen busy overlay with a message. */
  showBusy: (message?: string) => void;
  /** Hide the busy overlay. */
  hideBusy: () => void;
  /**
   * Run an async action with overlay + success/error toast.
   * Returns the action's result (or undefined on error).
   */
  run: <T>(
    fn: () => Promise<T>,
    opts?: { pending?: string; success?: string; error?: string },
  ) => Promise<T | undefined>;
}

const FeedbackContext = createContext<FeedbackApi | null>(null);

export function useFeedback(): FeedbackApi {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useFeedback must be used within <FeedbackProvider>");
  return ctx;
}

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busy, setBusy] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: "",
  });
  const idRef = useRef(0);

  const toast = useCallback((message: string, type: ToastType = "info") => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const showBusy = useCallback((message = "Working…") => setBusy({ visible: true, message }), []);
  const hideBusy = useCallback(() => setBusy((b) => ({ ...b, visible: false })), []);

  const run = useCallback<FeedbackApi["run"]>(
    async (fn, opts) => {
      setBusy({ visible: true, message: opts?.pending ?? "Working…" });
      try {
        const result = await fn();
        setBusy((b) => ({ ...b, visible: false }));
        if (opts?.success) toast(opts.success, "success");
        return result;
      } catch (e) {
        setBusy((b) => ({ ...b, visible: false }));
        toast(opts?.error ?? (e as Error)?.message ?? "Something went wrong", "error");
        return undefined;
      }
    },
    [toast],
  );

  return (
    <FeedbackContext.Provider value={{ toast, showBusy, hideBusy, run }}>
      {children}

      {/* ── Busy overlay ── */}
      <AnimatePresence>
        {busy.visible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[100] grid place-items-center bg-black/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.92, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="flex flex-col items-center gap-4 rounded-2xl bg-white px-10 py-8 shadow-2xl"
            >
              <CometSpinner className="size-12 text-primary-bright" />
              <p className="text-sm font-medium text-[#1c1a16]">{busy.message}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Toasts ── */}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[110] flex flex-col items-center gap-2 px-4">
        <AnimatePresence>
          {toasts.map((t) => (
            <ToastCard key={t.id} toast={t} onClose={() => setToasts((x) => x.filter((y) => y.id !== t.id))} />
          ))}
        </AnimatePresence>
      </div>
    </FeedbackContext.Provider>
  );
}

const TOAST_STYLES: Record<ToastType, { icon: typeof Info; cls: string }> = {
  success: { icon: CheckCircle2, cls: "border-emerald-200 bg-white text-emerald-800" },
  error: { icon: AlertTriangle, cls: "border-red-200 bg-white text-red-800" },
  info: { icon: Info, cls: "border-slate-200 bg-white text-slate-800" },
};

function ToastCard({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const { icon: Icon, cls } = TOAST_STYLES[toast.type];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 24, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className={`pointer-events-auto flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${cls}`}
    >
      <Icon className="size-5 shrink-0" />
      <span>{toast.message}</span>
      <button onClick={onClose} className="ml-1 opacity-50 transition-opacity hover:opacity-100">
        <X className="size-4" />
      </button>
    </motion.div>
  );
}
