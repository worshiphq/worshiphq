"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";
import { buttonVariants, type ButtonProps } from "./button";
import { BouncingDots } from "@/components/ui/bouncing-dots";
import { useFeedback } from "./feedback";

interface SubmitButtonProps extends ButtonProps {
  /** Label shown while the form is submitting. */
  pendingLabel?: string;
  /** Toast shown after a successful (non-navigating) submit. */
  successMessage?: string;
  /** Also show the full-screen busy overlay while submitting (default true). */
  overlay?: boolean;
}

/**
 * Drop-in submit button for `<form action={serverAction}>`. Shows an inline
 * spinner + pending label, disables itself, raises the global busy overlay, and
 * fires a success toast when the action completes. Must be rendered inside a form.
 */
export function SubmitButton({
  children,
  pendingLabel = "Saving…",
  successMessage,
  overlay = true,
  variant,
  size,
  className,
  disabled,
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const { showBusy, hideBusy, toast } = useFeedback();
  const wasPending = useRef(false);

  useEffect(() => {
    if (pending && !wasPending.current) {
      wasPending.current = true;
      if (overlay) showBusy(pendingLabel);
    } else if (!pending && wasPending.current) {
      wasPending.current = false;
      if (overlay) hideBusy();
      if (successMessage) toast(successMessage, "success");
    }
  }, [pending, overlay, pendingLabel, successMessage, showBusy, hideBusy, toast]);

  // If we unmount while still pending (e.g. the action redirected), make sure
  // the global overlay doesn't get stuck on.
  useEffect(() => {
    return () => {
      if (wasPending.current && overlay) hideBusy();
    };
  }, [overlay, hideBusy]);

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {pending ? (
        <>
          <BouncingDots className="size-5" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
