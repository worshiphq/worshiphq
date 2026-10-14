"use client";

import { useState } from "react";

export type SelectOption = string | { label: string; value: string };

const isOther = (o: SelectOption) => /^other\b/i.test(typeof o === "string" ? o : o.value) || /^other\b/i.test(typeof o === "string" ? o : o.label);
const valueOf = (o: SelectOption) => (typeof o === "string" ? o : o.value);
const labelOf = (o: SelectOption) => (typeof o === "string" ? o : o.label);

/**
 * A select where picking "Other" reveals a box to type what it is. The form
 * receives the typed text under `name` (not the word "other"), so what gets
 * saved is the real answer. If the saved value is not in the list (someone
 * typed their own last time) it opens on "Other" with that text filled in.
 */
export function OtherSelect({
  name, options, defaultValue, required, className, inputClassName, onValueChange, otherPlaceholder = "Please specify…", emptyLabel,
}: {
  name: string;
  options: SelectOption[];
  defaultValue?: string | number;
  required?: boolean;
  className?: string;
  inputClassName?: string;
  /** Called with the value that will be submitted (typed text when Other). */
  onValueChange?: (value: string) => void;
  otherPlaceholder?: string;
  /** Adds a blank first choice with this label (so nothing is chosen until the person picks). */
  emptyLabel?: string;
}) {
  const otherOpt = options.find(isOther);
  const known = new Set(options.map(valueOf));
  const initial = defaultValue == null ? "" : String(defaultValue);
  const custom = !!otherOpt && initial !== "" && !known.has(initial);

  const [sel, setSel] = useState(custom ? valueOf(otherOpt!) : initial || (emptyLabel !== undefined ? "" : options[0] ? valueOf(options[0]) : ""));
  const [text, setText] = useState(custom ? initial : "");
  const showText = !!otherOpt && sel === valueOf(otherOpt);

  return (
    <div className="space-y-2">
      <select
        // When "Other" is chosen the text box carries the value, so the select must not.
        name={showText ? undefined : name}
        value={sel}
        required={required}
        className={className}
        onChange={(e) => {
          setSel(e.target.value);
          onValueChange?.(otherOpt && e.target.value === valueOf(otherOpt) ? text : e.target.value);
        }}
      >
        {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
        {options.map((o) => (
          <option key={valueOf(o)} value={valueOf(o)}>{labelOf(o)}</option>
        ))}
      </select>
      {showText && (
        <input
          name={name}
          type="text"
          value={text}
          onChange={(e) => { setText(e.target.value); onValueChange?.(e.target.value); }}
          placeholder={otherPlaceholder}
          maxLength={80}
          required
          autoFocus
          className={inputClassName ?? className}
        />
      )}
    </div>
  );
}
