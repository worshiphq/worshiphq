import { createPortal } from "react-dom";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { useAppStore } from "../stores/app-store";
import { cn } from "../lib/utils";

const icons = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const colors = {
  success: "border-emerald-200 bg-white text-emerald-800",
  error: "border-red-200 bg-white text-red-800",
  info: "border-slate-200 bg-white text-slate-800",
};

export function Toast() {
  const { toast, clearToast } = useAppStore();
  if (!toast) return null;

  const Icon = icons[toast.type];

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[110] flex flex-col items-center gap-2 px-4">
      <div className={cn("pointer-events-auto flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg animate-slide-up", colors[toast.type])}>
        <Icon className="size-4 shrink-0" />
        <span>{toast.message}</span>
        <button onClick={clearToast} className="ml-1 opacity-50 transition-opacity hover:opacity-100">
          <X className="size-3.5" />
        </button>
      </div>
    </div>,
    document.body,
  );
}
