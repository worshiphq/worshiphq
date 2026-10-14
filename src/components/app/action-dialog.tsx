"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Modal } from "@/components/ui/modal";
import { OtherSelect } from "@/components/app/other-select";
import { SearchSelect } from "@/components/app/search-select";

/**
 * A button that opens a modal with a form bound to a server action.
 * The submit button shows a spinner + busy overlay while saving, the form
 * closes only AFTER the action completes, and a success toast is shown.
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
  pendingLabel = "Saving…",
  successMessage = "Saved",
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
  pendingLabel?: string;
  successMessage?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} variant={variant} disabled={disabled} onClick={() => setOpen(true)}>
        {triggerIcon}
        {triggerLabel}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} description={description}>
        <form action={action} className="space-y-4">
          {children}
          <SubmitButton className="w-full" pendingLabel={pendingLabel} successMessage={successMessage}>
            {submitLabel}
          </SubmitButton>
          <CloseOnComplete onDone={() => setOpen(false)} />
        </form>
      </Modal>
    </>
  );
}

/** Closes the dialog once the bound server action finishes, and refreshes the
 *  route so a newly created/edited row shows immediately (belt-and-braces on top
 *  of the action's own revalidatePath). */
function CloseOnComplete({ onDone }: { onDone: () => void }) {
  const { pending } = useFormStatus();
  const router = useRouter();
  const was = useRef(false);
  useEffect(() => {
    if (pending) was.current = true;
    else if (was.current) {
      was.current = false;
      onDone();
      router.refresh();
    }
  }, [pending, onDone, router]);
  return null;
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
  suggestions,
  step,
  hint,
  rows,
  searchable,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  defaultValue?: string | number;
  required?: boolean;
  options?: string[] | { label: string; value: string }[];
  /** Free-text input with a dropdown of suggested values (type your own too). */
  suggestions?: string[];
  step?: string;
  hint?: string;
  rows?: number;
  /** A select you can type into to narrow the list (use for members and other long lists). */
  searchable?: boolean;
}) {
  const base =
    "flex h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-sm text-ink placeholder:text-ink-faint focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30";
  const areaBase = base.replace("h-11 ", "").replace("flex ", "");
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-ink-muted">{label}</label>
      {options && searchable ? (
        <SearchSelect
          name={name}
          required={required}
          defaultValue={defaultValue == null ? "" : String(defaultValue)}
          options={options.map((o) => (typeof o === "string" ? { value: o, label: o } : o))}
          placeholder={placeholder ?? "Select…"}
        />
      ) : options ? (
        <OtherSelect name={name} options={options} defaultValue={defaultValue} className={base} required={required} />
      ) : suggestions ? (
        <>
          <input
            name={name}
            type="text"
            list={`${name}-suggestions`}
            placeholder={placeholder}
            defaultValue={defaultValue}
            required={required}
            className={base}
          />
          <datalist id={`${name}-suggestions`}>
            {suggestions.map((s) => <option key={s} value={s} />)}
          </datalist>
        </>
      ) : type === "textarea" ? (
        <textarea
          name={name}
          rows={rows ?? 4}
          placeholder={placeholder}
          defaultValue={defaultValue}
          required={required}
          className={`${areaBase} min-h-24 py-2.5`}
        />
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
      {hint && <p className="mt-1 text-[11px] text-ink-faint">{hint}</p>}
    </div>
  );
}
