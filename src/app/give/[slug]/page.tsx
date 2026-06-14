import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { GiveForm } from "./give-form";
import { HandCoins } from "lucide-react";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const church = await db.church.findUnique({ where: { slug }, select: { name: true } });
  if (!church) return { title: "Give" };
  return {
    title: `Give to ${church.name}`,
    description: `Give your tithes and offerings to ${church.name} securely via Mobile Money or card.`,
  };
}

export default async function GivePage({
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
      funds: { select: { name: true }, orderBy: { name: "asc" } },
    },
  });

  if (!church || church.isDemo) notFound();

  const fundNames = church.funds.map((f) => f.name);
  const funds = fundNames.length > 0 ? fundNames : ["General", "Tithe", "Offering", "Missions", "Building Fund"];

  return (
    <div className="min-h-screen bg-[#faf8f4]">
      <div className="mx-auto max-w-xl px-4 py-10 sm:px-6 sm:py-16">
        {/* Header */}
        <div className="mb-8 text-center">
          {church.logoUrl ? (
            <img
              src={church.logoUrl}
              alt={church.name}
              className="mx-auto mb-4 size-20 rounded-2xl object-cover"
            />
          ) : (
            <div
              className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl"
              style={{ backgroundColor: `${church.accentColor}18` }}
            >
              <HandCoins className="size-8" style={{ color: church.accentColor }} />
            </div>
          )}
          <h1 className="font-display text-3xl font-bold text-[#1c1a16]">
            Give to {church.name}
          </h1>
          <p className="mt-2 text-sm text-[#6b6560]">
            "Bring the whole tithe into the storehouse." — Malachi 3:10. Give securely with Mobile Money or card.
          </p>
        </div>

        <GiveForm
          churchSlug={church.slug}
          churchName={church.name}
          accentColor={church.accentColor}
          funds={funds}
        />
      </div>
    </div>
  );
}
