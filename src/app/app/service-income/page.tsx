import { requireModule } from "@/lib/auth";
import { serviceIncomeAccess } from "@/lib/levies/guards";
import { getServiceWeek } from "@/lib/data/service-income";
import { ServiceIncomeClient } from "@/components/app/service-income/service-income-client";

export const metadata = { title: "Service income" };

export default async function ServiceIncomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireModule("service-income");
  const params = await searchParams;
  const w = Array.isArray(params.w) ? params.w[0] : params.w;
  const a = serviceIncomeAccess(session);
  const week = await getServiceWeek(session.churchId, w ?? null, { manage: a.manage, del: a.del });
  return <ServiceIncomeClient week={week} />;
}
