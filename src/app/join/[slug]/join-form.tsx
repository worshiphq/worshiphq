"use client";

import { selfRegister } from "@/app/actions/join";

const GHANA_REGIONS = [
  "Greater Accra", "Ashanti", "Central", "Western", "Eastern",
  "Northern", "Volta", "Upper East", "Upper West", "Bono",
  "Bono East", "Ahafo", "Western North", "Oti", "Savannah",
  "North East",
];

function FieldInput({
  label,
  name,
  type = "text",
  placeholder,
  required,
  options,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];
  defaultValue?: string;
}) {
  const base =
    "flex h-11 w-full rounded-xl border border-[#e8e2d6] bg-white px-3.5 text-sm text-[#1c1a16] placeholder:text-[#a09888] focus-visible:border-[#0d7377]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d7377]/20";
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-[#6b6560]">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {options ? (
        <select name={name} defaultValue={defaultValue ?? ""} className={base} required={required}>
          <option value="">Select...</option>
          {options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input
          name={name}
          type={type}
          placeholder={placeholder}
          required={required}
          defaultValue={defaultValue}
          className={base}
        />
      )}
    </div>
  );
}

export function JoinForm({
  churchSlug,
  churchName,
  accentColor,
  departments,
  enabledFields,
}: {
  churchSlug: string;
  churchName: string;
  accentColor: string;
  departments: { id: string; name: string }[];
  enabledFields: string[];
}) {
  const has = (f: string) => enabledFields.includes(f);

  return (
    <form
      action={selfRegister}
      className="space-y-6 rounded-2xl border border-[#e8e2d6] bg-white p-6 shadow-sm sm:p-8"
    >
      <input type="hidden" name="churchSlug" value={churchSlug} />

      {/* ── Required: name, phone, email ── */}
      <fieldset>
        <legend className="mb-4 text-base font-semibold text-[#1c1a16]">
          Personal information
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldInput label="First name" name="firstName" placeholder="Kwame" required />
          <FieldInput label="Last name (surname)" name="lastName" placeholder="Mensah" required />
        </div>
        {has("otherNames") && (
          <div className="mt-4">
            <FieldInput label="Other names" name="otherNames" placeholder="Middle name(s)" />
          </div>
        )}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <FieldInput label="Phone (mobile)" name="phone" placeholder="+233 24 000 0000" required />
          <FieldInput label="Email" name="email" type="email" placeholder="you@example.com" />
        </div>
        {(has("gender") || has("title")) && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {has("gender") && (
              <FieldInput label="Gender" name="gender" options={["Male", "Female"]} />
            )}
            {has("title") && (
              <FieldInput
                label="Title"
                name="title"
                options={["Mr", "Mrs", "Ms", "Dr", "Rev", "Pastor", "Elder", "Deacon", "Deaconess"]}
              />
            )}
          </div>
        )}
        {has("dateOfBirth") && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <FieldInput label="Date of birth" name="dateOfBirth" type="date" />
            {has("placeOfBirth") && (
              <FieldInput label="Place of birth" name="placeOfBirth" placeholder="Kumasi" />
            )}
          </div>
        )}
        {has("maritalStatus") && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <FieldInput
              label="Marital status"
              name="maritalStatus"
              options={["Single", "Married", "Divorced", "Widowed"]}
            />
            {has("nationality") && (
              <FieldInput label="Nationality" name="nationality" defaultValue="Ghanaian" />
            )}
          </div>
        )}
      </fieldset>

      {/* ── Location ── */}
      {(has("region") || has("town") || has("houseAddress") || has("homeTown") || has("district")) && (
        <fieldset>
          <legend className="mb-4 border-t border-[#e8e2d6] pt-6 text-base font-semibold text-[#1c1a16]">
            Location
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {has("region") && (
              <FieldInput label="Region" name="region" options={GHANA_REGIONS} />
            )}
            {has("district") && (
              <FieldInput label="District" name="district" placeholder="Accra Metro" />
            )}
            {has("town") && (
              <FieldInput label="Town" name="town" placeholder="Osu" />
            )}
            {has("homeTown") && (
              <FieldInput label="Home town" name="homeTown" placeholder="Nkawkaw" />
            )}
          </div>
          {has("houseAddress") && (
            <div className="mt-4">
              <FieldInput label="House address" name="houseAddress" placeholder="House No. / Street" />
            </div>
          )}
          {has("postalAddress") && (
            <div className="mt-4">
              <FieldInput label="Postal address" name="postalAddress" placeholder="P.O. Box ..." />
            </div>
          )}
        </fieldset>
      )}

      {/* ── Work & ID ── */}
      {(has("occupation") || has("employer") || has("nationalId")) && (
        <fieldset>
          <legend className="mb-4 border-t border-[#e8e2d6] pt-6 text-base font-semibold text-[#1c1a16]">
            Occupation & identification
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {has("occupation") && (
              <FieldInput label="Occupation" name="occupation" placeholder="Teacher" />
            )}
            {has("employer") && (
              <FieldInput label="Employer" name="employer" placeholder="Ghana Education Service" />
            )}
            {has("nationalId") && (
              <FieldInput label="Ghana Card / National ID" name="nationalId" placeholder="GHA-XXXX-XXXX" />
            )}
          </div>
        </fieldset>
      )}

      {/* ── Church ── */}
      {(has("department") || has("previousChurch") || has("dateOfMembership") || has("baptized") || has("specialInterest")) && (
        <fieldset>
          <legend className="mb-4 border-t border-[#e8e2d6] pt-6 text-base font-semibold text-[#1c1a16]">
            Church information
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {has("department") && departments.length > 0 && (
              <FieldInput
                label="Department / ministry"
                name="department"
                options={departments.map((d) => d.name)}
              />
            )}
            {has("previousChurch") && (
              <FieldInput label="Previous church" name="previousChurch" placeholder="Name of previous church" />
            )}
            {has("dateOfMembership") && (
              <FieldInput label="Date of membership" name="dateOfMembership" type="date" />
            )}
            {has("baptized") && (
              <FieldInput
                label="Have you been baptised?"
                name="baptized"
                options={["yes", "no"]}
              />
            )}
            {has("specialInterest") && (
              <div className="sm:col-span-2">
                <FieldInput
                  label="Special interests / skills"
                  name="specialInterest"
                  placeholder="Singing, Sound engineering, Graphic design..."
                />
              </div>
            )}
          </div>
        </fieldset>
      )}

      {/* ── Additional phones ── */}
      {(has("workPhone") || has("homePhone")) && (
        <fieldset>
          <legend className="mb-4 border-t border-[#e8e2d6] pt-6 text-base font-semibold text-[#1c1a16]">
            Additional contact numbers
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {has("workPhone") && (
              <FieldInput label="Work phone" name="workPhone" placeholder="+233 ..." />
            )}
            {has("homePhone") && (
              <FieldInput label="Home phone" name="homePhone" placeholder="+233 ..." />
            )}
          </div>
        </fieldset>
      )}

      {/* ── Emergency contact ── */}
      {(has("emergencyName") || has("emergencyPhone")) && (
        <fieldset>
          <legend className="mb-4 border-t border-[#e8e2d6] pt-6 text-base font-semibold text-[#1c1a16]">
            Emergency contact
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {has("emergencyName") && (
              <FieldInput label="Name" name="emergencyName" placeholder="Full name" />
            )}
            {has("emergencyPhone") && (
              <FieldInput label="Phone" name="emergencyPhone" placeholder="+233 ..." />
            )}
            {has("emergencyRelation") && (
              <FieldInput
                label="Relationship"
                name="emergencyRelation"
                options={["Spouse", "Parent", "Sibling", "Child", "Friend", "Other"]}
              />
            )}
            {has("emergencyEmail") && (
              <FieldInput label="Email" name="emergencyEmail" type="email" />
            )}
          </div>
          {has("emergencyAddress") && (
            <div className="mt-4">
              <FieldInput label="Address" name="emergencyAddress" placeholder="Residential address" />
            </div>
          )}
        </fieldset>
      )}

      <div className="border-t border-[#e8e2d6] pt-6">
        <button
          type="submit"
          className="w-full rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          style={{ backgroundColor: accentColor }}
        >
          Submit registration
        </button>
        <p className="mt-3 text-center text-xs text-[#a09888]">
          Your details are shared only with {churchName} leadership. By submitting, you consent to your information being stored securely.
        </p>
      </div>
    </form>
  );
}
