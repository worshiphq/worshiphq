"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Lock } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useFeedback } from "@/components/ui/feedback";
import { setPayrollAccess } from "@/app/actions/settings";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "", label: "None" },
  { value: "view", label: "Can view" },
  { value: "manage", label: "Can manage" },
] as const;

/** Main Admin only: one person's payroll access. Salaries are private, so this is the only way anyone gets in. */
export function PayrollAccessSelect({ userId, name, initial }: { userId: string; name: string; initial: string | null }) {
  const [value, setValue] = useState(initial ?? "");
  const [saving, setSaving] = useState<string | null>(null);
  const [, start] = useTransition();
  const { toast } = useFeedback();
  const router = useRouter();

  const choose = (next: string) => {
    if (next === value || saving) return;
    setSaving(next);
    start(async () => {
      try {
        const r = await setPayrollAccess(userId, next);
        if (r.ok) {
          setValue(next);
          toast(next ? `${name} ${next === "manage" ? "can now manage" : "can now view"} payroll` : `${name} no longer sees payroll`, "success");
          router.refresh();
        } else toast(r.error, "error");
      } catch (e) {
        toast(e instanceof Error ? e.message : "Something went wrong.", "error");
      } finally {
        setSaving(null);
      }
    });
  };

  return (
    <div className="rounded-xl border border-line bg-surface-2/40 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold"><Banknote className="size-4 text-primary" /> Payroll access</div>
      <p className="mt-1 text-xs text-ink-muted"><Lock className="mr-1 inline size-3" />Salaries are private. Only people you choose here can see pay.</p>
      <div role="radiogroup" aria-label="Payroll access" className="mt-3 inline-flex flex-wrap gap-0.5 rounded-xl border border-line bg-surface-2 p-1 text-sm">
        {OPTIONS.map((o) => {
          const active = value === o.value;
          return (
            <button key={o.value} type="button" role="radio" aria-checked={active} disabled={!!saving} onClick={() => choose(o.value)}
              className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-colors", active ? "bg-primary text-white shadow-sm" : "text-ink-muted hover:text-ink")}>
              {saving === o.value && <Spinner size="sm" />}
              {saving === o.value ? "Saving…" : o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
