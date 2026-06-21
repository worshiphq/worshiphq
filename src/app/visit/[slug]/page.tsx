import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { VisitorForm } from "./visitor-form";
import { getVisitorFormDefinition } from "@/lib/forms/registration";
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
    title: `Visit ${church.name}`,
    description: `Record your visit to ${church.name}.`,
  };
}

export default async function VisitPage({
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
      visitorFormFields: true,
    },
  });

  if (!church || church.isDemo) notFound();

  const fields = getVisitorFormDefinition(church.visitorFormFields);

  return (
    <div className="min-h-screen bg-[#faf8f4]">
      <div className="mx-auto max-w-lg px-4 py-10 sm:px-6 sm:py-16">
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
            Welcome to {church.name}
          </h1>
          <p className="mt-2 text-sm text-[#6b6560]">
            We&apos;re glad you&apos;re here! Please fill in the form below so we can follow up with you.
          </p>
        </div>

        <VisitorForm
          churchSlug={church.slug}
          churchName={church.name}
          accentColor={church.accentColor}
          fields={fields}
        />
      </div>
    </div>
  );
}
