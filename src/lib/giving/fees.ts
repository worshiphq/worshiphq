/**
 * How one online gift is split. Pure maths, so the giving page can show the same numbers the server charges.
 *
 * Two ways to pay the fee, chosen per church:
 *  - "giver":  the giver pays a little extra, so the church receives exactly the gift.
 *  - "church": the giver pays exactly the gift, and the fee comes out of what the church receives.
 *
 * In both, the church receives a fixed, known amount. WorshipHQ's side is the flat `transactionCharge`:
 * out of it Paystack takes its own fee (it bills the main account), and what is left is WorshipHQ's platform cut.
 */

export type FeeMode = "giver" | "church";

export const isFeeMode = (v: unknown): v is FeeMode => v === "giver" || v === "church";

export interface GiftSplit {
  /** What the giver is charged, in cedis. */
  charge: number;
  /** The flat amount that goes to the main (WorshipHQ) account; the church gets `charge - transactionCharge`. */
  transactionCharge: number;
  /** What the church receives. */
  churchGets: number;
  /** The processing fee shown to the giver (everything above the gift in "giver" mode). */
  addedToGiver: number;
  /** Paystack's expected fee on this charge. */
  paystackFee: number;
  /** WorshipHQ's platform cut. */
  platformCut: number;
}

const cedis = (pesewas: number) => Math.round(pesewas) / 100;

export function splitGift(opts: { amount: number; mode: FeeMode; feePercent: number; platformPercent: number }): GiftSplit {
  const rate = Math.max(0, Math.min(opts.feePercent, 20)) / 100;
  const net = Math.max(0, Math.round(opts.amount * 100));
  const cut = Math.ceil((net * Math.max(0, Math.min(opts.platformPercent, 100))) / 100);

  if (opts.mode === "giver") {
    // The extra the giver pays must cover Paystack's fee on the whole charge, plus the platform cut.
    const charge = rate > 0 ? Math.ceil((net + cut) / (1 - rate)) : net + cut;
    return {
      charge: cedis(charge),
      transactionCharge: cedis(charge - net),
      churchGets: cedis(net),
      addedToGiver: cedis(charge - net),
      paystackFee: cedis(Math.ceil(charge * rate)),
      platformCut: cedis(cut),
    };
  }

  // The church absorbs it: the giver pays the gift as typed, and the fee and cut come out of the church's share.
  const fee = Math.ceil(net * rate);
  // Never take more than the gift itself.
  const take = Math.min(net, fee + cut);
  return {
    charge: cedis(net),
    transactionCharge: cedis(take),
    churchGets: cedis(net - take),
    addedToGiver: 0,
    paystackFee: cedis(fee),
    platformCut: cedis(cut),
  };
}
