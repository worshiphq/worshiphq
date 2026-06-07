import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { JoinForm } from "./join-form";
import type { Metadata } from "next";

// All registration fields that can be toggled on/off
export const ALL_FIELDS = [
  { key: "otherNames", label: "Other names" },
  { key: "gender", label: "Gender" },
  { key: "title", label: "Title (e.g. Rev., Elder)" },
  { key: "dateOfBirth", label: "Date of birth" },
  { key: "occupation", label: "Occupation" },
  { key: "employer", label: "Employer / workplace" },
  { key: "previousChurch", label: "Previous church" },
  { key: "dateOfMembership", label: "Date of membership" },
  { key: "placeOfBirth", label: "Place of birth" },
  { key: "nationality", label: "Nationality" },
  { key: "country", label: "Country" },
  { key: "region", label: "Region" },
  { key: "district", label: "District" },
  { key: "town", label: "Town" },
  { key: "nationalId", label: "National ID (Ghana Card)" },
  { key: "houseAddress", label: "House address" },
  { key: "homeTown", label: "Home town" },
  { key: "workPhone", label: "Work phone" },
  { key: "postalAddress", label: "Postal address" },
  { key: "homePhone", label: "Home phone" },
  { key: "specialInterest", label: "Special interest / skills" },
  { key: "maritalStatus", label: "Marital status" },
  { key: "baptized", label: "Have you been baptised?" },
  { key: "emergencyName", label: "Emergency contact name" },
  { key: "emergencyPhone", label: "Emergency contact phone" },
  { key: "emergencyRelation", label: "Emergency contact relation" },
  { key: "emergencyEmail", label: "Emergency contact email" },
  { key: "emergencyAddress", label: "Emergency contact address" },
  { key: "department", label: "Department / ministry" },
] as const;

// Default fields shown when no config is set
export const DEFAULT_ENABLED = [
  "gender", "dateOfBirth", "occupation", "town", "region",
  "maritalStatus", "baptized", "department",
  "emergencyName", "emergencyPhone", "emergencyRelation",
] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const church = await db.church.findUnique({ where: { slug }, select: { name: true } });
  if (!church) return { title: "Church not found" };
  return {
    title: `Join ${church.name}`,
    description: `Register as a member of ${church.name}.`,
  };
}

export default async function JoinPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const church = await db.church.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      isDemo: true,
      logoUrl: true,
      accentColor: true,
      registrationFields: true,
      departments: { select: { id: true, name: true }, orderBy: { name: "asc" } },
    },
  });

  if (!church || church.isDemo) notFound();

  // Determine which fields are enabled
  const config = (church.registrationFields as Record<string, boolean> | null) ?? null;
  const enabledFields = config
    ? ALL_FIELDS.filter((f) => config[f.key] === true).map((f) => f.key)
    : [...DEFAULT_ENABLED];

  return (
    <div className="min-h-screen bg-[#faf8f4]">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
        {/* Header */}
        <div className="mb-8 text-center">
          {church.logoUrl && (
            <img
              src={church.logoUrl}
              alt={church.name}
              className="mx-auto mb-4 size-20 rounded-2xl object-cover"
            />
          )}
          <h1 className="font-display text-3xl font-bold text-[#1c1a16]">
            Join {church.name}
          </h1>
          <p className="mt-2 text-sm text-[#6b6560]">
            Fill in your details below to register as a member. Your information is safe and only visible to church leadership.
          </p>
        </div>

        <JoinForm
          churchSlug={church.slug}
          churchName={church.name}
          accentColor={church.accentColor}
          departments={church.departments}
          enabledFields={enabledFields}
        />
      </div>
    </div>
  );
}
