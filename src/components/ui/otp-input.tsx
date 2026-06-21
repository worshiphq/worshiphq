"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";

interface OtpInputProps {
  length?: number;
  name?: string;
  onChange?: (code: string) => void;
}

export function OtpInput({ length = 6, name = "code", onChange }: OtpInputProps) {
  const [digits, setDigits] = useState<string[]>(Array(length).fill(""));
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const formRef = useRef<HTMLFormElement | null>(null);

  const focus = useCallback((i: number) => {
    if (i >= 0 && i < length) refs.current[i]?.focus();
  }, [length]);

  function setDigitAndMaybeSubmit(next: string[]) {
    setDigits(next);
    const code = next.join("");
    onChange?.(code);
    if (next.every((d) => d !== "")) {
      requestAnimationFrame(() => {
        formRef.current?.requestSubmit();
      });
    }
  }

  function handleInput(i: number, e: React.FormEvent<HTMLInputElement>) {
    const v = e.currentTarget.value.replace(/\D/g, "");
    if (!v) return;
    const next = [...digits];
    next[i] = v[0];
    setDigitAndMaybeSubmit(next);
    if (i < length - 1) focus(i + 1);
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (digits[i]) {
        const next = [...digits];
        next[i] = "";
        setDigits(next);
      } else if (i > 0) {
        const next = [...digits];
        next[i - 1] = "";
        setDigits(next);
        focus(i - 1);
      }
    } else if (e.key === "ArrowLeft") {
      focus(i - 1);
    } else if (e.key === "ArrowRight") {
      focus(i + 1);
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!text) return;
    const next = Array(length).fill("");
    for (let j = 0; j < text.length; j++) next[j] = text[j];
    setDigitAndMaybeSubmit(next);
    focus(Math.min(text.length, length - 1));
  }

  useEffect(() => {
    const el = refs.current[0];
    if (el) formRef.current = el.closest("form");
  }, []);

  const code = digits.join("");

  return (
    <div>
      <input type="hidden" name={name} value={code} />
      <div className="flex justify-center gap-2.5" onPaste={handlePaste}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={1}
            value={d}
            onInput={(e) => handleInput(i, e)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onFocus={(e) => e.currentTarget.select()}
            className={cn(
              "h-14 w-12 rounded-xl border-2 bg-surface text-center text-xl font-bold tabular-nums text-ink shadow-sm transition-all duration-150",
              d
                ? "border-primary/60 ring-2 ring-primary/20"
                : "border-line",
              "focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30",
              "placeholder:text-ink-faint/30",
            )}
            placeholder="·"
          />
        ))}
      </div>
    </div>
  );
}
