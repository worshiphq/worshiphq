import "server-only";
import { db } from "@/lib/db";
import type { RealStats } from "@/lib/landing-stats-shared";

export * from "@/lib/landing-stats-shared";

export async function getRealStats(): Promise<RealStats> {
  try {
    const live = { isDemo: false };
    const [churches, countries, members, giving, checkIns] = await Promise.all([
      db.church.count({ where: live }),
      db.church.groupBy({ by: ["country"], where: live }),
      db.person.count({ where: { church: live } }),
      db.gift.aggregate({ where: { church: live }, _sum: { amount: true } }),
      db.attendanceRecord.count({ where: { church: live } }),
    ]);
    return {
      churches,
      countries: countries.filter((c) => c.country && !/^other$/i.test(c.country)).length,
      members,
      giving: Math.round(Number(giving._sum.amount ?? 0)),
      checkIns,
    };
  } catch {
    return { churches: 0, countries: 0, members: 0, giving: 0, checkIns: 0 };
  }
}
