import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PrayerForm } from "./prayer-form";
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
    title: `Prayer Requests — ${church.name}`,
    description: `Submit a prayer request to ${church.name}.`,
  };
}

export default async function PrayPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const church = await db.church.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, isDemo: true, logoUrl: true, accentColor: true },
  });

  if (!church || church.isDemo) notFound();

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
            Prayer Requests
          </h1>
          <p className="mt-2 text-sm text-[#6b6560]">
            {church.name} — share your prayer need and our community will lift you up.
          </p>
        </div>

        <PrayerForm churchSlug={church.slug} accentColor={church.accentColor} />
      </div>
    </div>
  );
}
