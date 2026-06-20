import "server-only";
import { db } from "@/lib/db";

const METHOD_LABEL: Record<string, string> = {
  MTN_MoMo: "MTN MoMo", Telecel_Cash: "Telecel Cash", AirtelTigo: "AirtelTigo", Card: "Card", Cash: "Cash",
};

export interface HarvestContributionRow {
  id: string;
  donorName: string;
  donorPhone: string | null;
  donorType: string;
  personId: string | null;
  amount: number;
  method: string;
  date: string;
  receiptSent: boolean;
  photoUrl: string | null;
}

export interface HarvestData {
  harvest: {
    id: string;
    year: number;
    title: string;
    date: string | null;
    goal: number | null;
    raised: number;
  } | null;
  contributions: HarvestContributionRow[];
  totalRaised: number;
  contributorCount: number;
  memberCount: number;
  visitorCount: number;
  members: { id: string; firstName: string; lastName: string; phone: string | null; photoUrl: string | null }[];
}

export async function getHarvestData(churchId: string, year: number): Promise<HarvestData> {
  const [harvest, members] = await Promise.all([
    db.harvest.findUnique({
      where: { churchId_year: { churchId, year } },
      include: {
        contributions: {
          orderBy: { date: "desc" },
          include: { person: { select: { photoUrl: true } } },
        },
      },
    }),
    db.person.findMany({
      where: { churchId, status: { in: ["active", "visitor"] } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, phone: true, photoUrl: true },
    }),
  ]);

  if (!harvest) {
    return { harvest: null, contributions: [], totalRaised: 0, contributorCount: 0, memberCount: 0, visitorCount: 0, members };
  }

  const contributions: HarvestContributionRow[] = harvest.contributions.map((c) => ({
    id: c.id,
    donorName: c.donorName,
    donorPhone: c.donorPhone,
    donorType: c.donorType,
    personId: c.personId,
    amount: Number(c.amount),
    method: METHOD_LABEL[c.method] ?? "Cash",
    date: c.date.toISOString(),
    receiptSent: c.receiptSent,
    photoUrl: c.person?.photoUrl ?? null,
  }));

  const totalRaised = contributions.reduce((s, c) => s + c.amount, 0);
  const memberContribs = contributions.filter((c) => c.donorType === "member");
  const visitorContribs = contributions.filter((c) => c.donorType === "visitor");

  return {
    harvest: {
      id: harvest.id,
      year: harvest.year,
      title: harvest.title,
      date: harvest.date?.toISOString() ?? null,
      goal: harvest.goal ? Number(harvest.goal) : null,
      raised: totalRaised,
    },
    contributions,
    totalRaised,
    contributorCount: contributions.length,
    memberCount: memberContribs.length,
    visitorCount: visitorContribs.length,
    members,
  };
}
