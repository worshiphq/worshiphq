"use client";

import { useState } from "react";
import { Landmark } from "lucide-react";
import { Label } from "@/components/ui/input";

export interface AccountOption {
  id: string;
  name: string;
  isDefault: boolean;
  type?: string;
}

/**
 * A labelled account picker for money-recording forms.
 *
 * Two modes:
 *  - Controlled: pass `value` + `onChange` (used when the form is submitted via
 *    JS, e.g. batch recorders that build their own payload).
 *  - Form: pass `name` and it submits the chosen account with the surrounding
 *    <form>, tracking its own state.
 *
 * When the church only has one account there's nothing to choose, so it renders
 * a quiet "goes into X" line (plus a hidden input in form mode) instead of a
 * dropdown.
 */
export function AccountSelect({
  accounts,
  name,
  label = "Deposit into account",
  value,
  onChange,
  defaultValue,
  className = "",
}: {
  accounts: AccountOption[];
  name?: string;
  label?: string;
  value?: string;
  onChange?: (value: string) => void;
  defaultValue?: string;
  className?: string;
}) {
  const fallback = accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? "";
  const [internal, setInternal] = useState(defaultValue ?? fallback);
  const controlled = value !== undefined && onChange !== undefined;
  const current = controlled ? value! : internal;
  const setCurrent = (v: string) => (controlled ? onChange!(v) : setInternal(v));

  if (accounts.length === 0) return null;

  if (accounts.length === 1) {
    return (
      <div className={`flex items-center gap-1.5 text-xs text-muted-fg ${className}`}>
        <Landmark className="h-3.5 w-3.5" />
        <span>Goes into <span className="font-medium text-foreground">{accounts[0].name}</span></span>
        {name && <input type="hidden" name={name} value={accounts[0].id} />}
      </div>
    );
  }

  return (
    <div className={`space-y-1 ${className}`}>
      <Label className="text-xs flex items-center gap-1.5"><Landmark className="h-3.5 w-3.5" /> {label}</Label>
      <select
        name={name}
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        className="w-full border border-separator rounded-md px-3 py-2 text-sm bg-surface"
      >
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}{a.isDefault ? " (default)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
