"use client";

import { submitVisitorForm } from "@/app/actions/visit";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormField } from "@/lib/forms/registration";

export function VisitorForm({
  churchSlug,
  churchName,
  accentColor,
  fields,
}: {
  churchSlug: string;
  churchName: string;
  accentColor: string;
  fields: FormField[];
}) {
  return (
    <form
      action={submitVisitorForm}
      className="space-y-5 rounded-2xl border border-[#e8e2d6] bg-white p-6 shadow-sm sm:p-8"
    >
      <input type="hidden" name="churchSlug" value={churchSlug} />

      {fields.map((f) => (
        <div key={f.id} className="space-y-1.5">
          <label htmlFor={f.id} className="block text-sm font-medium text-[#1c1a16]">
            {f.label}
            {f.required && <span className="ml-0.5 text-red-500">*</span>}
          </label>

          {f.type === "textarea" ? (
            <textarea
              id={f.id}
              name={f.id}
              required={f.required}
              placeholder={f.placeholder}
              rows={3}
              className="w-full rounded-xl border border-[#e8e2d6] bg-[#faf8f4] px-4 py-2.5 text-sm text-[#1c1a16] outline-none focus:border-transparent focus:ring-2"
              style={{ "--tw-ring-color": accentColor } as React.CSSProperties}
            />
          ) : f.type === "select" && f.options ? (
            <select
              id={f.id}
              name={f.id}
              required={f.required}
              className="w-full rounded-xl border border-[#e8e2d6] bg-[#faf8f4] px-4 py-2.5 text-sm text-[#1c1a16] outline-none focus:border-transparent focus:ring-2"
              style={{ "--tw-ring-color": accentColor } as React.CSSProperties}
            >
              <option value="">Select…</option>
              {f.options.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          ) : (
            <input
              id={f.id}
              name={f.id}
              type={f.type === "tel" ? "tel" : f.type === "email" ? "email" : "text"}
              required={f.required}
              placeholder={f.placeholder}
              className="w-full rounded-xl border border-[#e8e2d6] bg-[#faf8f4] px-4 py-2.5 text-sm text-[#1c1a16] outline-none focus:border-transparent focus:ring-2"
              style={{ "--tw-ring-color": accentColor } as React.CSSProperties}
            />
          )}
        </div>
      ))}

      <div className="border-t border-[#e8e2d6] pt-6">
        <SubmitButton
          pendingLabel="Submitting…"
          className="w-full rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
          style={{ backgroundColor: accentColor }}
        >
          Submit visitor form
        </SubmitButton>
        <p className="mt-3 text-center text-xs text-[#a09888]">
          Your details are shared only with {churchName} leadership.
        </p>
      </div>
    </form>
  );
}
