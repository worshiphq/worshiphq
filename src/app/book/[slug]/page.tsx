import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { BookingRequestForm } from "./booking-form";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const church = await db.church.findUnique({ where: { slug }, select: { name: true } });
  if (!church) return { title: "Church not found" };
  return { title: `Book a facility - ${church.name}`, description: `Request to book a hall or room at ${church.name}.` };
}

export default async function BookFacilityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const church = await db.church.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, isDemo: true, suspended: true, logoUrl: true, accentColor: true, publicBookingOn: true, bookingNote: true },
  });
  if (!church || church.isDemo || church.suspended) notFound();

  const accent = church.accentColor ?? "#6366f1";

  if (!church.publicBookingOn) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#faf8f4] px-4">
        <div className="max-w-md text-center">
          <h1 className="font-display text-2xl font-bold text-[#1c1a16]">Booking requests are closed</h1>
          <p className="mt-2 text-sm text-[#6b6560]">{church.name} isn&apos;t taking facility booking requests online right now. Please contact the church office.</p>
        </div>
      </div>
    );
  }

  const [facilities, busy] = await Promise.all([
    db.facility.findMany({
      where: { churchId: church.id, isActive: true, publicBookable: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, capacity: true, location: true, description: true, imageUrl: true, rate: true },
    }),
    db.booking.findMany({
      where: { churchId: church.id, status: "confirmed", endTime: { gte: new Date() }, startTime: { lte: new Date(Date.now() + 120 * 86400000) } },
      orderBy: { startTime: "asc" },
      select: { facilityId: true, startTime: true, endTime: true },
      take: 400,
    }),
  ]);

  return (
    <div className="min-h-screen bg-[#faf8f4]">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="mb-8 text-center">
          {church.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={church.logoUrl} alt={church.name} className="mx-auto mb-4 size-20 rounded-2xl object-cover" />
          )}
          <h1 className="font-display text-3xl font-bold text-[#1c1a16]">Book a facility</h1>
          <p className="mt-2 text-sm text-[#6b6560]">{church.name} - choose a space and tell us when you need it. We&apos;ll confirm by phone or text.</p>
        </div>

        {church.bookingNote && (
          <div className="mb-6 whitespace-pre-line rounded-2xl border border-[#e5e0db] bg-white p-4 text-sm text-[#4b463f]">{church.bookingNote}</div>
        )}

        {facilities.length === 0 ? (
          <p className="text-center text-sm text-[#6b6560]">No facilities are open for booking at the moment.</p>
        ) : (
          <BookingRequestForm
            churchSlug={church.slug}
            accent={accent}
            facilities={facilities.map((f) => ({ ...f, rate: f.rate ? Number(f.rate) : null }))}
            busy={busy.map((b) => ({ facilityId: b.facilityId, start: b.startTime.toISOString(), end: b.endTime.toISOString() }))}
          />
        )}

        <p className="mt-8 text-center text-xs text-[#a09890]">Powered by <span className="font-semibold">WorshipHQ</span></p>
      </div>
    </div>
  );
}
