"use client";

import { useTransition } from "react";
import { cn } from "@/lib/utils";
import { buttonVariants, type ButtonProps } from "./button";
import { Spinner } from "./spinner";
import { useFeedback } from "./feedback";

interface ActionButtonProps extends Omit<ButtonProps, "onClick"> {
  /** The async server action (must NOT redirect — use a form for those). */
  action: () => void | Promise<unknown>;
  pendingLabel?: string;
  successMessage?: string;
  errorMessage?: string;
  /** Optional confirm() prompt before running. */
  confirm?: string;
  /** Show the full-screen overlay while running (default true). */
  overlay?: boolean;
}

/**
 * Button for onClick server actions (toggle, delete, update). Shows a spinner,
 * the busy overlay, and a success/error toast. For actions that redirect, use a
 * <form> with <SubmitButton> instead (redirect would surface as an error here).
 */
export function ActionButton({
  children,
  action,
  pendingLabel = "Working…",
  successMessage,
  errorMessage,
  confirm: confirmMsg,
  overlay = true,
  variant,
  size,
  className,
  ...props
}: ActionButtonProps) {
  const [pending, startTransition] = useTransition();
  const { run, toast } = useFeedback();

  function handleClick() {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    startTransition(async () => {
      if (overlay) {
        await run(async () => action(), { pending: pendingLabel, success: successMessage, error: errorMessage });
      } else {
        try {
          await action();
          if (successMessage) toast(successMessage, "success");
        } catch (e) {
          toast(errorMessage ?? (e as Error)?.message ?? "Something went wrong", "error");
        }
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-busy={pending}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {pending ? <Spinner size="sm" /> : children}
    </button>
  );
}
