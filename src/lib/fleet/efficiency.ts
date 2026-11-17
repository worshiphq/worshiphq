/**
 * Fuel economy, measured the only reliable way: from one full tank to the next full tank.
 * Every fill in between (partial or full) counts toward the litres used over that distance.
 */

export type Fill = { date: Date | string; litres: number; cost: number; odometer: number | null; fullTank: boolean };

export function kmPerLitre(fills: Fill[]): number | null {
  const withOdo = fills
    .filter((f) => f.odometer != null && f.litres > 0)
    .sort((a, b) => (a.odometer! - b.odometer!) || (new Date(a.date).getTime() - new Date(b.date).getTime()));
  let km = 0, litres = 0;
  let startIdx = withOdo.findIndex((f) => f.fullTank);
  while (startIdx >= 0) {
    let used = 0;
    let endIdx = -1;
    for (let i = startIdx + 1; i < withOdo.length; i++) {
      used += withOdo[i].litres;
      if (withOdo[i].fullTank) { endIdx = i; break; }
    }
    if (endIdx < 0) break;
    const dist = withOdo[endIdx].odometer! - withOdo[startIdx].odometer!;
    if (dist > 0 && used > 0) { km += dist; litres += used; }
    startIdx = endIdx;
  }
  return litres > 0 ? Math.round((km / litres) * 10) / 10 : null;
}

/** Running cost per km over a distance: fuel plus repairs divided by km driven. */
export function costPerKm(totalCost: number, km: number): number | null {
  return km > 0 ? Math.round((totalCost / km) * 100) / 100 : null;
}

/** Price paid per litre. */
export const pricePerLitre = (cost: number, litres: number) => (litres > 0 ? Math.round((cost / litres) * 100) / 100 : null);
