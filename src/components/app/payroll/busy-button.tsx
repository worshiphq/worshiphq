"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useFeedback } from "@/components/ui/feedback";

export type Result = { ok: true; message?: string; warnings?: string[] } | { ok: false; error: string };

/**
 * A button that runs a payroll server action returning { ok, error }. While it runs it shows a spinner AND a message
 * ("Approving…"), disables itself and raises the busy overlay; then it toasts the outcome and refreshes the page.
 */
export function BusyButton({
  run,
  pendingLabel,
  successMessage,
  confirm: confirmMsg,
  onDone,
  refresh = true,
  overlay = true,
  children,
  disabled,
  ...props
}: Omit<ButtonProps, "onClick"> & {
  run: () => Promise<Result>;
  pendingLabel: string;
  successMessage?: string;
  confirm?: string;
  onDone?: (r: Result) => void;
  refresh?: boolean;
  overlay?: boolean;
}) {
  const [pending, start] = useTransition();
  const { toast, showBusy, hideBusy } = useFeedback();
  const router = useRouter();
  return (
    <Button
      type="button"
      disabled={pending || disabled}
      aria-busy={pending}
      onClick={() => {
        if (confirmMsg && !window.confirm(confirmMsg)) return;
        start(async () => {
          if (overlay) showBusy(pendingLabel);
          try {
            const r = await run();
            if (r.ok) {
              toast(r.message ?? successMessage ?? "Done", "success");
              for (const w of r.warnings ?? []) toast(w, "info");
              if (refresh) router.refresh();
            } else {
              toast(r.error, "error");
            }
            onDone?.(r);
          } catch (e) {
            toast(e instanceof Error ? e.message : "Something went wrong.", "error");
          } finally {
            if (overlay) hideBusy();
          }
        });
      }}
      {...props}
    >
      {pending ? (
        <>
          <Spinner size="sm" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

/** A pending-aware link button: spinner + message while the next page loads. */
export { PendingLink } from "@/components/ui/pending-link";
