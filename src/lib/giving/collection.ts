// Turning a counted collection into gifts, one per way it was received. Shared by Giving ("Record a collection") and the
// service income sheet, so both write exactly the same rows. Takes the Prisma client, so it can be tested directly.
import type { GiftMethod, Prisma, PrismaClient } from "@prisma/client";

export interface CollectionLineInput { method: string; amount: number; accountId?: string | null; notBanked?: boolean }

const METHOD_FROM_LABEL: Record<string, GiftMethod> = {
  "MTN MoMo": "MTN_MoMo", "Telecel Cash": "Telecel_Cash", AirtelTigo: "AirtelTigo", Card: "Card", Cash: "Cash", Bank: "Bank", "Bank transfer": "Bank",
};
const METHODS: GiftMethod[] = ["Cash", "MTN_MoMo", "Telecel_Cash", "AirtelTigo", "Card", "Bank"];

/** Clean what the browser sent: a known method and a positive amount rounded to the pesewa. */
export function cleanCollectionLines(lines: CollectionLineInput[] | undefined) {
  return (lines ?? [])
    .map((l) => ({
      method: METHOD_FROM_LABEL[l.method] ?? (METHODS.includes(l.method as GiftMethod) ? (l.method as GiftMethod) : null),
      amount: Math.round(Number(l.amount) * 100) / 100,
      accountId: l.accountId ?? null,
      notBanked: !!l.notBanked,
    }))
    .filter((l): l is { method: GiftMethod; amount: number; accountId: string | null; notBanked: boolean } => !!l.method && Number.isFinite(l.amount) && l.amount > 0);
}

/** "Offertory collection (1st service)", the name collection gifts carry so Giving shows them as a counted total. */
export function collectionDonorName(fundName: string, note?: string | null) {
  const n = (note ?? "").trim().slice(0, 60);
  return `${fundName} collection${n ? ` (${n})` : ""}`;
}

/**
 * Create one gift per line. `resolveAccount` turns the chosen account into one the church owns (or its default);
 * lines marked "not banked yet" get no account and are flagged as pending.
 */
export async function createCollectionGifts(
  client: PrismaClient | Prisma.TransactionClient,
  churchId: string,
  input: {
    fundId: string; fundName: string; date: Date; note?: string | null; branchId?: string | null; serviceIncomeId?: string | null;
    lines: ReturnType<typeof cleanCollectionLines>;
    resolveAccount: (chosen: string | null) => Promise<string | null>;
  },
): Promise<{ total: number; ids: string[] }> {
  const donorName = collectionDonorName(input.fundName, input.note);
  let total = 0;
  const ids: string[] = [];
  for (const l of input.lines) {
    const accountId = l.notBanked ? null : await input.resolveAccount(l.accountId);
    const g = await client.gift.create({
      data: {
        churchId, branchId: input.branchId ?? undefined, donorName, fundId: input.fundId, accountId, pendingDeposit: l.notBanked,
        amount: l.amount, method: l.method, currency: "GHS", date: input.date, serviceIncomeId: input.serviceIncomeId ?? null,
      },
      select: { id: true },
    });
    ids.push(g.id);
    total += l.amount;
  }
  return { total: Math.round(total * 100) / 100, ids };
}
