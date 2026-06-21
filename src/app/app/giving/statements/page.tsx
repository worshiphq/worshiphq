import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { StatementsClient } from "@/components/app/statements-client";
import { PageHeader } from "@/components/app/page-header";

export const metadata = { title: "Giving statements" };

export default async function StatementsPage() {
  const session = await requireModule("giving");

  const now = new Date();
  const year = now.getFullYear();

  const [people, church] = await Promise.all([
    db.person.findMany({
      where: {
        churchId: session.churchId,
        gifts: { some: { date: { gte: new Date(year, 0, 1) } } },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        memberId: true,
        gifts: {
          where: { date: { gte: new Date(year, 0, 1) } },
          select: {
            id: true,
            amount: true,
            date: true,
            method: true,
            fund: { select: { name: true } },
          },
          orderBy: { date: "asc" },
        },
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
    db.church.findUnique({
      where: { id: session.churchId },
      select: { name: true, address: true, city: true, country: true, logoUrl: true },
    }),
  ]);

  const donors = people.map((p) => {
    const total = p.gifts.reduce((sum, g) => sum + Number(g.amount), 0);
    const byFund: Record<string, number> = {};
    for (const g of p.gifts) {
      const fundName = g.fund?.name ?? "General";
      byFund[fundName] = (byFund[fundName] ?? 0) + Number(g.amount);
    }

    return {
      id: p.id,
      name: `${p.firstName} ${p.lastName}`,
      memberId: p.memberId,
      phone: p.phone,
      email: p.email,
      total,
      giftCount: p.gifts.length,
      byFund: Object.entries(byFund).map(([fund, amount]) => ({ fund, amount })),
      gifts: p.gifts.map((g) => ({
        id: g.id,
        amount: Number(g.amount),
        date: g.date.toISOString(),
        method: g.method,
        fund: g.fund?.name ?? "General",
      })),
    };
  });

  return (
    <div>
      <PageHeader
        title="Giving statements"
        description={`${year} giving summary for each member. Click a member to view their detailed statement.`}
      />
      <StatementsClient
        donors={donors}
        year={year}
        churchName={church?.name ?? ""}
        churchAddress={[church?.address, church?.city, church?.country].filter(Boolean).join(", ")}
      />
    </div>
  );
}
