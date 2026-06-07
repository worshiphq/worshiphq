"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

/**
 * A button that opens a modal with a form bound to a server action.
 * The form auto-closes after submit (deferred so the action dispatches first).
 * Field inputs are passed as children from the (server) page.
 */
export function ActionDialog({
  triggerLabel,
  triggerIcon,
  title,
  description,
  submitLabel,
  action,
  children,
  disabled,
  variant = "primary",
  size = "sm",
}: {
  triggerLabel: string;
  triggerIcon?: React.ReactNode;
  title: string;
  description?: string;
  submitLabel: string;
  action: (formData: FormData) => void | Promise<void>;
  children: React.ReactNode;
  disabled?: boolean;
  variant?: "primary" | "secondary";
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} variant={variant} disabled={disabled} onClick={() => setOpen(true)}>
        {triggerIcon}
        {triggerLabel}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} description={description}>
        <form action={action} onSubmit={() => setTimeout(() => setOpen(false), 0)} className="space-y-4">
          {children}
          <Button type="submit" className="w-full">
            {submitLabel}
          </Button>
        </form>
      </Modal>
    </>
  );
}

/** Reusable labelled field row for use inside ActionDialog. */
export function Field({
  label,
  name,
  type = "text",
  placeholder,
  defaultValue,
  required,
  options,
  step,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  defaultValue?: string | number;
  required?: boolean;
  options?: string[];
  step?: string;
}) {
  const base =
    "flex h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-sm text-ink placeholder:text-ink-faint focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30";
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-ink-muted">{label}</label>
      {options ? (
        <select name={name} defaultValue={defaultValue} className={base} required={required}>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          name={name}
          type={type}
          step={step}
          placeholder={placeholder}
          defaultValue={defaultValue}
          required={required}
          className={base}
        />
      )}
    </div>
  );
}
