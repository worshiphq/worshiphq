"use client";

import { useState } from "react";
import { selfRegister } from "@/app/actions/join";
import { SubmitButton } from "@/components/ui/submit-button";
import { type FormField, DEPARTMENT_FIELD_ID } from "@/lib/forms/registration";

export function DynamicJoinForm({
  churchSlug,
  churchName,
  accentColor,
  fields,
  departments,
}: {
  churchSlug: string;
  churchName: string;
  accentColor: string;
  fields: FormField[];
  departments: { id: string; name: string }[];
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const setValue = (id: string, v: string) => setValues((s) => ({ ...s, [id]: v }));

  const visible = (f: FormField) => {
    if (!f.showIf) return true;
    return (values[f.showIf.fieldId] ?? "") === f.showIf.equals;
  };

  const inputCls =
    "flex h-11 w-full rounded-xl border border-[#e8e2d6] bg-white px-3.5 text-sm text-[#1c1a16] placeholder:text-[#a09888] focus-visible:border-[#0d7377]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d7377]/20";

  return (
    <form
      action={selfRegister}
      className="space-y-5 rounded-2xl border border-[#e8e2d6] bg-white p-6 shadow-sm sm:p-8"
    >
      <input type="hidden" name="churchSlug" value={churchSlug} />

      <div className="grid gap-4 sm:grid-cols-2">
        {fields.filter(visible).map((f) => {
          const options =
            f.id === DEPARTMENT_FIELD_ID ? departments.map((d) => d.name) : f.options ?? [];
          const fullWidth = f.type === "textarea" || f.type === "checkbox";
          return (
            <div key={f.id} className={fullWidth ? "sm:col-span-2" : undefined}>
              <label className="mb-1.5 block text-sm font-medium text-[#6b6560]">
                {f.label} {f.required && <span className="text-red-500">*</span>}
              </label>

              {f.type === "select" ? (
                <select
                  name={f.id}
                  required={f.required}
                  value={values[f.id] ?? ""}
                  onChange={(e) => setValue(f.id, e.target.value)}
                  className={inputCls}
                >
                  <option value="">Select…</option>
                  {options.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : f.type === "textarea" ? (
                <textarea
                  name={f.id}
                  required={f.required}
                  placeholder={f.placeholder}
                  value={values[f.id] ?? ""}
                  onChange={(e) => setValue(f.id, e.target.value)}
                  className={`${inputCls} h-24 py-2.5`}
                />
              ) : f.type === "checkbox" ? (
                <label className="flex items-center gap-2 text-sm text-[#1c1a16]">
                  <input
                    type="checkbox"
                    name={f.id}
                    value="yes"
                    checked={values[f.id] === "yes"}
                    onChange={(e) => setValue(f.id, e.target.checked ? "yes" : "")}
                    className="size-4 rounded border-[#e8e2d6]"
                  />
                  Yes
                </label>
              ) : (
                <input
                  name={f.id}
                  type={f.type}
                  required={f.required}
                  placeholder={f.placeholder}
                  value={values[f.id] ?? ""}
                  onChange={(e) => setValue(f.id, e.target.value)}
                  className={inputCls}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-[#e8e2d6] pt-6">
        <SubmitButton
          pendingLabel="Submitting…"
          className="w-full rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          style={{ backgroundColor: accentColor }}
        >
          Submit registration
        </SubmitButton>
        <p className="mt-3 text-center text-xs text-[#a09888]">
          Your details are shared only with {churchName} leadership. By submitting, you consent to your
          information being stored securely.
        </p>
      </div>
    </form>
  );
}
