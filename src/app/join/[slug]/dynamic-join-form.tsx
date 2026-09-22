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
  departments = [],
  action,
  submitLabel = "Submit registration",
  requireGuardianConsent = false,
}: {
  churchSlug: string;
  churchName: string;
  accentColor: string;
  fields: FormField[];
  departments?: { id: string; name: string }[];
  action?: (formData: FormData) => Promise<void>;
  submitLabel?: string;
  /** This registers a minor - require an affirmative parent/guardian consent
   *  checkbox before the browser will let the form submit. */
  requireGuardianConsent?: boolean;
}) {
  return (
    <form
      action={action ?? selfRegister}
      className="space-y-5 rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8"
    >
      <input type="hidden" name="churchSlug" value={churchSlug} />

      <MemberFormFields fields={fields} departments={departments} />

      {requireGuardianConsent && (
        <label className="flex items-start gap-2 rounded-lg border border-line bg-surface-2/50 p-3 text-xs text-ink-muted">
          <input
            type="checkbox"
            name="guardianConsent"
            required
            className="mt-0.5 size-4 shrink-0 rounded border-line accent-primary"
          />
          <span>
            I am this child&apos;s parent or guardian, and I consent to {churchName} collecting and storing this
            information.
          </span>
        </label>
      )}

      <div className="border-t border-line pt-6">
        <SubmitButton
          pendingLabel="Submitting…"
          className="w-full rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
          style={{ backgroundColor: accentColor }}
        >
          {submitLabel}
        </SubmitButton>
        <p className="mt-3 text-center text-xs text-ink-faint">
          Your details are shared only with {churchName} leadership. By submitting, you consent to your
          information being stored securely.
        </p>
      </div>
    </form>
  );
}
