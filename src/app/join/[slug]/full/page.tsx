import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { MembershipFull } from "@/components/public/membership-full";

export const metadata = { title: "Registration is full" };

/** Where a registration lands if the church filled up while the person was filling in the form. */
export default async function JoinFullPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const church = await db.church.findUnique({ where: { slug }, select: { name: true, logoUrl: true, accentColor: true, isDemo: true } });
  if (!church || church.isDemo) notFound();
  return (
    <div className="min-h-screen bg-[#faf8f4]">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
        {church.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={church.logoUrl} alt={church.name} className="mx-auto mb-6 size-20 rounded-2xl object-cover" />
        )}
        <MembershipFull churchName={church.name} accentColor={church.accentColor} />
      </div>
    </div>
  );
}
