import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { DynamicJoinForm } from "@/app/join/[slug]/dynamic-join-form";
import { getChildrenFormDefinition } from "@/lib/forms/registration";
import { registerChild } from "@/app/actions/join";
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
    title: `Children's Registration — ${church.name}`,
    description: `Register your child at ${church.name}.`,
  };
}

export default async function ChildrenPage({
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
      childrenFormFields: true,
    },
  });

  if (!church || church.isDemo) notFound();

  const fields = getChildrenFormDefinition(church.childrenFormFields);

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
          <h1 className="font-display text-3xl font-bold text-[#1c1a16]">
            Children&apos;s Registration
          </h1>
          <p className="mt-1 text-sm font-medium" style={{ color: church.accentColor }}>
            {church.name}
          </p>
          <p className="mt-2 text-sm text-[#6b6560]">
            Register your child below. A parent or guardian&apos;s details are required.
          </p>
        </div>

        <DynamicJoinForm
          churchSlug={church.slug}
          churchName={church.name}
          accentColor={church.accentColor}
          fields={fields}
          action={registerChild}
          submitLabel="Register child"
        />
      </div>
    </div>
  );
}
