"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import type { CountryCode } from "libphonenumber-js/min";
import { isPossiblePhoneNumber } from "libphonenumber-js/min";
import { allCountries, composePhone, countryByIso, countryFromTimeZone, splitPhone } from "@/lib/countries";
import { cn } from "@/lib/utils";

/** The country a signed-in church's forms start on (its own country). Public pages leave it out and use the visitor's location. */
const DefaultCountryContext = React.createContext<CountryCode | null>(null);
export function PhoneDefaults({ country, children }: { country: CountryCode | null; children: React.ReactNode }) {
  return <DefaultCountryContext.Provider value={country}>{children}</DefaultCountryContext.Provider>;
}

let geoPromise: Promise<CountryCode | null> | null = null;
/** Where the visitor is, once per page: the host's country header, then the browser's language region. */
function visitorCountry(): Promise<CountryCode | null> {
  geoPromise ??= fetch("/api/geo", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d: { country?: string | null } | null) => {
      const fromHost = countryByIso(d?.country)?.iso;
      if (fromHost) return fromHost;
      // No country from the host: the time zone is a better clue than the language ("English (US)" is common everywhere).
      const zone = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "";
      const fromZone = countryFromTimeZone(zone);
      if (fromZone) return fromZone;
      const region = (typeof navigator !== "undefined" ? navigator.language : "").split("-")[1];
      return countryByIso(region)?.iso ?? null;
    })
    .catch(() => null);
  return geoPromise;
}

/** The country-code dropdown: shows "GH +233", opens the full list (Africa first) in the phone's own picker. */
export function CountryPicker({ iso, onChange, disabled, tone = "light" }: { iso: CountryCode; onChange: (iso: CountryCode) => void; disabled?: boolean; tone?: "light" | "dark" }) {
  const dark = tone === "dark";
  const countries = React.useMemo(() => allCountries(), []);
  const current = countryByIso(iso);
  const option = (c: (typeof countries)[number]) => (
    <option key={c.iso} value={c.iso}>{c.name} (+{c.dial})</option>
  );
  return (
    <div
      className={cn(
        "relative flex h-11 w-[6.75rem] shrink-0 items-center justify-between px-3 text-sm transition-colors",
        dark
          ? "rounded-lg border border-white/10 bg-white/5 text-slate-100 focus-within:border-teal-500/60"
          : "rounded-xl border border-line bg-surface text-ink shadow-sm focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/30",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span className="truncate font-medium">{current?.iso} <span className={dark ? "text-slate-400" : "text-ink-muted"}>+{current?.dial}</span></span>
      <ChevronDown className={cn("size-4 shrink-0", dark ? "text-slate-500" : "text-ink-faint")} aria-hidden />
      <select
        aria-label="Country code"
        value={iso}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as CountryCode)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        <optgroup label="Africa">{countries.filter((c) => c.africa).map(option)}</optgroup>
        <optgroup label="Rest of the world">{countries.filter((c) => !c.africa).map(option)}</optgroup>
      </select>
    </div>
  );
}

/** The visitor's country once it is known (null until then, or when it can't be told). */
export function useVisitorCountry(enabled = true): CountryCode | null {
  const [c, setC] = React.useState<CountryCode | null>(null);
  React.useEffect(() => {
    if (!enabled) return;
    let live = true;
    visitorCountry().then((v) => { if (live) setC(v); });
    return () => { live = false; };
  }, [enabled]);
  return c;
}

type Props = {
  /** Submitted under this name as the full international number, e.g. +23276123456. */
  name?: string;
  id?: string;
  /** Controlled value (international number). Leave out and use defaultValue for an uncontrolled field. */
  value?: string;
  defaultValue?: string | null;
  onChange?: (international: string) => void;
  /** Force the starting country (otherwise the church's country, then the visitor's location, then Ghana). */
  defaultCountry?: CountryCode;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
  autoFocus?: boolean;
  /** "dark" matches the SuperAdmin screens. */
  tone?: "light" | "dark";
};

export function PhoneInput({
  name, id, value, defaultValue, onChange, defaultCountry, required, disabled, placeholder = "24 123 4567", className, autoFocus,
  "aria-label": ariaLabel, tone = "light",
}: Props) {
  const dark = tone === "dark";
  const ctx = React.useContext(DefaultCountryContext);
  const startFrom = defaultCountry ?? ctx ?? "GH";
  const initial = React.useMemo(() => splitPhone(value ?? defaultValue ?? "", startFrom), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [iso, setIso] = React.useState<CountryCode>(initial.iso);
  const [national, setNational] = React.useState(initial.national);
  const touched = React.useRef(Boolean(initial.national));
  const detected = React.useRef<CountryCode | null>(null);
  const hidden = React.useRef<HTMLInputElement>(null);
  const visible = React.useRef<HTMLInputElement>(null);

  const international = composePhone(iso, national);

  // Start on the visitor's own country, unless the church supplied one or the field already holds a number.
  React.useEffect(() => {
    if (defaultCountry || ctx || touched.current) return;
    let live = true;
    visitorCountry().then((c) => { if (!live || !c) return; detected.current = c; if (!touched.current) setIso(c); });
    return () => { live = false; };
  }, [defaultCountry, ctx]);

  // A controlled parent changed the value from outside (e.g. cleared the form): follow it.
  const [seenValue, setSeenValue] = React.useState(value);
  if (value !== undefined && value !== seenValue) {
    setSeenValue(value);
    if (value !== international) {
      const next = splitPhone(value, iso);
      setIso(next.iso);
      setNational(next.national);
    }
  }

  // form.reset() on an uncontrolled field puts it back to where it started.
  React.useEffect(() => {
    const form = hidden.current?.form;
    if (!form || value !== undefined) return;
    const reset = () => { touched.current = Boolean(initial.national); setIso(initial.national ? initial.iso : (detected.current ?? initial.iso)); setNational(initial.national); };
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [value, initial]);

  const report = (nextIso: CountryCode, nextNational: string) => onChange?.(composePhone(nextIso, nextNational));

  const validate = (nextIso: CountryCode, nextNational: string, el: HTMLInputElement | null) => {
    if (!el) return;
    const full = composePhone(nextIso, nextNational);
    el.setCustomValidity(full && !isPossiblePhoneNumber(full) ? `Enter a valid ${countryByIso(nextIso)?.name ?? ""} phone number.` : "");
  };

  const onType = (text: string) => {
    touched.current = true;
    // Pasting a full "+232 76 123456" switches the country to match instead of garbling the number.
    if (text.trim().startsWith("+")) {
      const next = splitPhone(text, iso);
      setIso(next.iso); setNational(next.national);
      report(next.iso, next.national);
      return;
    }
    setNational(text);
    report(iso, text);
    visible.current?.setCustomValidity("");
  };

  return (
    <div className={cn("flex gap-2", className)}>
      <CountryPicker
        iso={iso}
        tone={tone}
        disabled={disabled}
        onChange={(next) => {
          touched.current = true;
          setIso(next);
          report(next, national);
          validate(next, national, visible.current);
        }}
      />
      <input
        ref={visible}
        id={id}
        type="tel"
        size={1}
        inputMode="tel"
        autoComplete="tel-national"
        value={national}
        required={required}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        placeholder={placeholder}
        onChange={(e) => onType(e.target.value)}
        onBlur={(e) => validate(iso, national, e.currentTarget)}
        className={cn(
          "flex h-11 min-w-0 flex-1 px-3.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          dark
            ? "rounded-lg border border-white/10 bg-white/5 text-slate-100 placeholder:text-slate-500 focus:border-teal-500/60 focus:outline-none"
            : "rounded-xl border border-line bg-surface text-ink shadow-sm placeholder:text-ink-faint focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
        )}
      />
      {name && <input ref={hidden} type="hidden" name={name} value={international} disabled={disabled} />}
    </div>
  );
}
