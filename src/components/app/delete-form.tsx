"use client";

import { Trash2 } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";

/**
 * Reusable delete control: a form bound to a (server) delete action with an
 * optional confirm() prompt. Safe to drop into server components — the bound
 * action is passed as a prop.
 */
export function DeleteForm({
  action,
  confirm: message,
  successMessage = "Deleted",
  label,
  className = "text-ink-faint hover:text-danger",
}: {
  action: () => void | Promise<void>;
  confirm?: string;
  successMessage?: string;
  label?: string;
  className?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (message && !window.confirm(message)) e.preventDefault();
      }}
    >
      <SubmitButton size="sm" variant="ghost" overlay={false} successMessage={successMessage} className={className}>
        <Trash2 className="size-4" /> {label}
      </SubmitButton>
    </form>
  );
}
