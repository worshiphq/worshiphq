import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { VisitorsClient } from "@/components/app/visitors-client";

export const metadata = { title: "Visitors" };

export default async function VisitorsPage() {
  const session = await requireModule("visitors");

  const [visitors, church] = await Promise.all([
    db.visitor.findMany({
      where: { churchId: session.churchId },
      orderBy: { visitDate: "desc" },
      take: 200,
      include: {
        person: {
          select: {
            id: true,
            biometrics: { where: { type: "scanner" }, select: { id: true }, take: 1 },
          },
        },
      },
    }),
    db.church.findUnique({
      where: { id: session.churchId },
      select: { slug: true, isDemo: true },
    }),
  ]);

  const visitUrl = church?.slug && !church.isDemo
    ? `/visit/${church.slug}`
    : null;

  const canWrite = !session.isDemo;

  return (
    <VisitorsClient
      visitors={visitors.map((v) => ({
        id: v.id,
        firstName: v.firstName,
        lastName: v.lastName,
        phone: v.phone,
        email: v.email,
        purpose: v.purpose,
        notes: v.notes,
        photoUrl: v.photoUrl,
        isRegular: v.isRegular,
        visitCount: v.visitCount,
        lastVisit: v.lastVisit.toISOString(),
        visitDate: v.visitDate.toISOString(),
        hasFingerprint: (v.person?.biometrics?.length ?? 0) > 0,
        personId: v.person?.id ?? null,
      }))}
      visitUrl={visitUrl}
      canWrite={canWrite}
    />
  );
}
