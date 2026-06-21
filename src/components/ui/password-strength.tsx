"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

const RULES = [
  { label: "At least 8 characters", test: (pw: string) => pw.length >= 8 },
  { label: "Uppercase letter", test: (pw: string) => /[A-Z]/.test(pw) },
  { label: "Lowercase letter", test: (pw: string) => /[a-z]/.test(pw) },
  { label: "Number", test: (pw: string) => /\d/.test(pw) },
  { label: "Special character (!@#$...)", test: (pw: string) => /[^A-Za-z0-9]/.test(pw) },
] as const;

const STRENGTH_LABELS = ["Too weak", "Weak", "Fair", "Good", "Strong"] as const;
const STRENGTH_COLORS = [
  "bg-danger",
  "bg-orange-500",
  "bg-amber-500",
  "bg-lime-500",
  "bg-success",
] as const;

export function PasswordStrength({ password }: { password: string }) {
  const { score, passed } = useMemo(() => {
    const passed = RULES.map((r) => r.test(password));
    const score = passed.filter(Boolean).length;
    return { score, passed };
  }, [password]);

  if (!password) return null;

  const segments = 5;

  return (
    <div className="mt-2 space-y-2">
      {/* Strength bar */}
      <div className="flex gap-1">
        {Array.from({ length: segments }, (_, i) => (
          <div
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-all duration-300",
              i < score ? STRENGTH_COLORS[score - 1] : "bg-line",
            )}
          />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className={cn("text-xs font-medium", score <= 1 ? "text-danger" : score <= 2 ? "text-orange-500" : score <= 3 ? "text-amber-500" : "text-success")}>
          {STRENGTH_LABELS[Math.max(0, score - 1)]}
        </span>
        <span className="text-xs text-ink-faint">{score}/{segments} requirements met</span>
      </div>

      {/* Requirements checklist */}
      <div className="space-y-1">
        {RULES.map((rule, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className={cn(
              "inline-block size-1.5 rounded-full transition-colors",
              passed[i] ? "bg-success" : "bg-line",
            )} />
            <span className={passed[i] ? "text-ink-muted" : "text-ink-faint"}>
              {rule.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
