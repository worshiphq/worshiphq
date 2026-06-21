import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { VisitorsClient } from "@/components/app/visitors-client";

export const metadata = { title: "Visitors" };

export default async function VisitorsPage() {
  const session = await requireModule("people");

  const [visitors, church] = await Promise.all([
    db.visitor.findMany({
      where: { churchId: session.churchId },
      orderBy: { visitDate: "desc" },
      take: 200,
    }),
    db.church.findUnique({
      where: { id: session.churchId },
      select: { slug: true, isDemo: true },
    }),
  ]);

  const visitUrl = church?.slug && !church.isDemo
    ? `/visit/${church.slug}`
    : null;

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
        visitDate: v.visitDate.toISOString(),
      }))}
      visitUrl={visitUrl}
    />
  );
}
