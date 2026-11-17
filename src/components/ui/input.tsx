import * as React from "react";
import { cn } from "@/lib/utils";

type InputMode = React.HTMLAttributes<HTMLInputElement>["inputMode"];

/**
 * Which phone keypad a field should bring up. Number fields get the number pad:
 * "decimal" when fractions are allowed (a step like 0.01 or "any"), otherwise "numeric".
 * Phone fields get the phone pad. An explicit inputMode always wins.
 */
export function keypadFor(type?: string, step?: string | number, inputMode?: InputMode): InputMode {
  if (inputMode) return inputMode;
  if (type === "tel") return "tel";
  if (type !== "number") return undefined;
  const st = step == null ? "" : String(step);
  return st === "any" || st.includes(".") ? "decimal" : "numeric";
}

/** Stops a mouse wheel from silently changing a focused number field while the page scrolls. */
export function blurNumberOnWheel(e: React.WheelEvent<HTMLInputElement>) {
  if (e.currentTarget.type === "number" && document.activeElement === e.currentTarget) e.currentTarget.blur();
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  /**
   * Shorthand for a number-pad text field: "decimal" for money and other amounts with
   * fractions, "numeric" for whole numbers (counts, PINs, codes). Keeps type="text" so
   * the browser does not reformat or scroll-change the value; add your own parsing.
   */
  numeric?: "decimal" | "numeric";
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, numeric, inputMode, step, onWheel, pattern, ...props }, ref) => (
    <input
      ref={ref}
      type={numeric ? (type ?? "text") : type}
      step={step}
      inputMode={numeric ?? keypadFor(type, step, inputMode)}
      pattern={pattern ?? (numeric === "numeric" ? "[0-9]*" : undefined)}
      onWheel={onWheel ?? (type === "number" ? blurNumberOnWheel : undefined)}
      className={cn(
        "flex h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-sm text-ink shadow-sm transition-colors",
        "placeholder:text-ink-faint",
        "focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-24 w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink shadow-sm transition-colors",
      "placeholder:text-ink-faint",
      "focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("mb-1.5 block text-sm font-medium text-ink-muted", className)}
      {...props}
    />
  );
}
