import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { useAppStore } from "../stores/app-store";
import { cn } from "../lib/utils";

const icons = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const colors = {
  success: "bg-success/10 text-success border-success/20",
  error: "bg-danger/10 text-danger border-danger/20",
  info: "bg-primary-soft text-primary-bright border-primary/20",
};

export function Toast() {
  const { toast, clearToast } = useAppStore();
  if (!toast) return null;

  const Icon = icons[toast.type];

  return (
    <div className="fixed bottom-5 right-5 z-50 animate-in slide-in-from-bottom-2">
      <div className={cn("flex items-center gap-2.5 rounded-xl border px-4 py-2.5 shadow-lg", colors[toast.type])}>
        <Icon className="size-4 shrink-0" />
        <span className="text-sm font-medium">{toast.message}</span>
        <button onClick={clearToast} className="ml-2 opacity-60 hover:opacity-100">
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
