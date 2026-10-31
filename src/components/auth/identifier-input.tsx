"use client";

import * as React from "react";
import type { CountryCode } from "libphonenumber-js/min";
import { composePhone, splitPhone } from "@/lib/countries";
import { CountryPicker, useVisitorCountry } from "@/components/ui/phone-input";
import { cn } from "@/lib/utils";

/**
 * Sign-in / reset box that takes an email OR a phone number. While the text looks like an email it is a
 * plain box; as soon as it starts with a digit or "+" a country code appears beside it, so a local number
 * is read for the right country. The form always receives one value under `name`.
 */
export function IdentifierInput({ id, name = "identifier", placeholder, required }: { id?: string; name?: string; placeholder?: string; required?: boolean }) {
  const [text, setText] = React.useState("");
  const [iso, setIso] = React.useState<CountryCode>("GH");
  const touched = React.useRef(false);
  const visitor = useVisitorCountry();
  React.useEffect(() => { if (visitor && !touched.current) setIso(visitor); }, [visitor]);

  const trimmed = text.trim();
  const looksLikePhone = /^[+\d][\d\s\-()+.]*$/.test(trimmed);
  const submitted = !trimmed ? "" : looksLikePhone ? composePhone(iso, trimmed) || trimmed : trimmed;

  const onType = (next: string) => {
    if (next.trim().startsWith("+")) {
      // A full "+232 76 123456" picks its own country instead of being read as a local number.
      const parts = splitPhone(next, iso);
      touched.current = true;
      setIso(parts.iso);
      setText(parts.national);
      return;
    }
    setText(next);
  };

  return (
    <div className="flex gap-2">
      {looksLikePhone && <CountryPicker iso={iso} onChange={(c) => { touched.current = true; setIso(c); }} />}
      <input
        id={id}
        type="text"
        size={1}
        inputMode="text"
        autoComplete="username"
        value={text}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onType(e.target.value)}
        className={cn(
          "flex h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 text-sm text-ink shadow-sm transition-colors placeholder:text-ink-faint",
          "focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
        )}
      />
      <input type="hidden" name={name} value={submitted} />
    </div>
  );
}
