"use client";

import { selfRegister } from "@/app/actions/join";
import { SubmitButton } from "@/components/ui/submit-button";
import { MemberFormFields } from "@/components/app/member-form-fields";
import { type FormField } from "@/lib/forms/registration";

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
  return (
    <form
      action={selfRegister}
      className="space-y-5 rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8"
    >
      <input type="hidden" name="churchSlug" value={churchSlug} />

      <MemberFormFields fields={fields} departments={departments} />

      <div className="border-t border-line pt-6">
        <SubmitButton
          pendingLabel="Submitting…"
          className="w-full rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
          style={{ backgroundColor: accentColor }}
        >
          Submit registration
        </SubmitButton>
        <p className="mt-3 text-center text-xs text-ink-faint">
          Your details are shared only with {churchName} leadership. By submitting, you consent to your
          information being stored securely.
        </p>
      </div>
    </form>
  );
}
