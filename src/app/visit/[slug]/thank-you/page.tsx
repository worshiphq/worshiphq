import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const church = await db.church.findUnique({ where: { slug }, select: { name: true } });
  if (!church) return { title: "Thank you" };
  return { title: `Welcome to ${church.name}` };
}

export default async function VisitThankYouPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const church = await db.church.findUnique({
    where: { slug },
    select: { name: true, isDemo: true, logoUrl: true, accentColor: true },
  });
  if (!church || church.isDemo) notFound();

  return (
    <div className="grid min-h-screen place-items-center bg-[#faf8f4] px-4">
      <div className="w-full max-w-md rounded-2xl border border-[#e8e2d6] bg-white p-8 text-center shadow-sm">
        {church.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={church.logoUrl}
            alt={church.name}
            className="mx-auto mb-4 size-16 rounded-2xl object-cover"
          />
        )}
        <div
          className="mx-auto mb-4 grid size-16 place-items-center rounded-full"
          style={{ backgroundColor: `${church.accentColor}20` }}
        >
          <CheckCircle2 className="size-8" style={{ color: church.accentColor }} />
        </div>
        <h1 className="font-display text-2xl font-bold text-[#1c1a16]">
          Thank you for visiting {church.name}!
        </h1>
        <p className="mt-3 text-sm text-[#6b6560]">
          We&apos;re so glad you came. A church leader may follow up with you soon. God bless you!
        </p>
        <div className="mt-6 rounded-xl border border-[#e8e2d6] bg-[#faf8f4] p-4 text-xs text-[#a09888]">
          You can close this page now. We hope to see you again!
        </div>
      </div>
    </div>
  );
}
