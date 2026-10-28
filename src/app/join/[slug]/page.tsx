import { MembershipFull } from "@/components/public/membership-full";
import { memberRoom } from "@/lib/member-limit";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { DynamicJoinForm } from "./dynamic-join-form";
import { getFormDefinition } from "@/lib/forms/registration";
import { getCategoriesForForm } from "@/lib/members/categories";
import type { Metadata } from "next";

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
      groups: { where: { onForms: true, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } },
    },
  });

  if (!church || church.isDemo) notFound();
  const room = await memberRoom(church.id);
  const full = room.limit !== null && room.left <= 0;

  const fields = getFormDefinition(church.registrationFields);
  const categories = await getCategoriesForForm(church.id, { joinFormOnly: true });

  return (
    <div className="min-h-screen bg-[#faf8f4]">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
        <div className="mb-8 text-center">
          {church.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={church.logoUrl}
              alt={church.name}
              className="mx-auto mb-4 size-20 rounded-2xl object-cover"
            />
          )}
          <h1 className="font-display text-3xl font-bold text-[#1c1a16]">Join {church.name}</h1>
          <p className="mt-2 text-sm text-[#6b6560]">
            Fill in your details below to register as a member. Your information is safe and only visible to church leadership.
          </p>
        </div>

        {full ? (

          <MembershipFull churchName={church.name} accentColor={church.accentColor} />

        ) : (

          <DynamicJoinForm
            churchSlug={church.slug}
            churchName={church.name}
            accentColor={church.accentColor}
            fields={fields}
            departments={church.departments}
            groups={church.groups}
            categories={categories}
          />

        )}
      </div>
    </div>
  );
}
