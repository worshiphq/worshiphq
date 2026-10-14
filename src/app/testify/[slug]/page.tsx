import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { DynamicJoinForm } from "@/app/join/[slug]/dynamic-join-form";
import { FORM_KINDS } from "@/lib/forms/kinds";
import { submitPublicTestimony } from "@/app/actions/public-submissions";

import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const church = await db.church.findUnique({ where: { slug }, select: { name: true } });
  if (!church) return { title: "Church not found" };
  return { title: `Share a Testimony - ${church.name}`, description: `Share what God has done, with ${church.name}.` };
}

export default async function TestifyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const church = await db.church.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, isDemo: true, logoUrl: true, accentColor: true, testimonyFormFields: true },
  });
  if (!church || church.isDemo) notFound();

  return (
    <div className="min-h-screen bg-[#faf8f4]">
      <div className="mx-auto max-w-lg px-4 py-10 sm:px-6 sm:py-16">
        <div className="mb-8 text-center">
          {church.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={church.logoUrl} alt={church.name} className="mx-auto mb-4 size-20 rounded-2xl object-cover" />
          )}
          <h1 className="font-display text-3xl font-bold text-[#1c1a16]">Share a Testimony</h1>
          <p className="mt-2 text-sm text-[#6b6560]">{church.name} - tell us what God has done. We&rsquo;ll review it before sharing.</p>
        </div>
        <DynamicJoinForm
          churchSlug={church.slug}
          churchName={church.name}
          accentColor={church.accentColor}
          fields={FORM_KINDS.testimony.resolve(church.testimonyFormFields)}
          action={submitPublicTestimony}
          submitLabel={FORM_KINDS.testimony.submitLabel}
          footerNote={null}
        />
      </div>
    </div>
  );
}
