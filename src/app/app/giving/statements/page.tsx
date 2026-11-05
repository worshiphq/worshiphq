import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { StatementsClient } from "@/components/app/statements-client";
import { PageHeader } from "@/components/app/page-header";
import { queryDonors } from "@/lib/data/statements";

export const metadata = { title: "Giving statements" };

export default async function StatementsPage() {
  const session = await requireModule("giving");

  const now = new Date();
  const year = now.getFullYear();

  const [first, church] = await Promise.all([
    queryDonors(session.churchId, year, "", 1),
    db.church.findUnique({
      where: { id: session.churchId },
      select: { name: true, address: true, city: true, country: true, logoUrl: true },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Giving statements"
        description={`${year} giving summary for each member. Click a member to view their detailed statement.`}
      />
      <StatementsClient
        initial={first}
        year={year}
        churchName={church?.name ?? ""}
        churchAddress={[church?.address, church?.city, church?.country].filter(Boolean).join(", ")}
      />
    </div>
  );
}
