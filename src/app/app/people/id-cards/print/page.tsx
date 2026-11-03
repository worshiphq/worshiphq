import { redirect } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { IdCardSheet } from "@/components/app/id-card-sheet";

export const metadata = { title: "Print member ID cards" };
export const dynamic = "force-dynamic";

const MAX = 200;

export default async function PrintIdCardsPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const session = await requireModule("people");
  if (!session.isDemo && session.planLocked?.includes("member-ids")) redirect("/app/settings?tab=billing");

  const { ids } = await searchParams;
  // Ids come from the address bar, so they are treated as a request, not a fact: capped, cleaned, and used
  // only inside this church. A person from another church simply is not found.
  const wanted = [...new Set((ids ?? "").split(",").map((s) => s.trim()).filter((s) => /^[A-Za-z0-9_-]{10,40}$/.test(s)))].slice(0, MAX);
  if (wanted.length === 0) redirect("/app/people/id-cards");

  const [people, church] = await Promise.all([
    db.person.findMany({
      where: { churchId: session.churchId, id: { in: wanted }, memberId: { not: null } },
      select: { id: true, firstName: true, lastName: true, memberId: true, photoUrl: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
    db.church.findUnique({ where: { id: session.churchId }, select: { name: true, logoUrl: true, accentColor: true } }),
  ]);

  return (
    <IdCardSheet
      backHref="/app/people/id-cards"
      church={{ name: church?.name ?? "Church", logoUrl: church?.logoUrl ?? null, accent: church?.accentColor || "#0d7377" }}
      people={people.map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`.trim(), memberId: p.memberId!, photoUrl: p.photoUrl }))}
    />
  );
}
