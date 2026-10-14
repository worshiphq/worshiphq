/** Facility pricing: a flat price per booking, per day, or per hour. Client-safe. */
export type RateUnit = "event" | "day" | "hour";

export const RATE_UNITS: { value: RateUnit; label: string; per: string }[] = [
  { value: "event", label: "One price for the whole booking", per: "per booking" },
  { value: "day", label: "Per day", per: "per day" },
  { value: "hour", label: "Per hour", per: "per hour" },
];

export const asRateUnit = (v: unknown): RateUnit => (v === "day" || v === "hour" ? v : "event");
export const rateUnitLabel = (u: RateUnit) => RATE_UNITS.find((x) => x.value === u)?.per ?? "per booking";

export interface PriceInput {
  unit: RateUnit;
  rate: number | null;
  /** YYYY-MM-DD and HH:mm, as the person typed them (church local time). */
  startDate: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
}

export interface PriceResult {
  amount: number | null;
  days: number;
  hours: number | null;
  /** e.g. "GH₵800 per day x 3 days" */
  detail: string;
}

const ms = (d: string, t: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  const [h, mi] = t.split(":").map(Number);
  return Date.UTC(y, m - 1, dd, h || 0, mi || 0);
};
const money = (n: number) => `GH₵${n.toLocaleString("en-GH", { maximumFractionDigits: 2 })}`;

/** Work out what a booking costs from its dates. Hourly prices need an end time. */
export function priceFor(i: PriceInput): PriceResult {
  const endDate = i.endDate && i.endDate >= i.startDate ? i.endDate : i.startDate;
  const days = Math.max(1, Math.round((ms(endDate, "00:00") - ms(i.startDate, "00:00")) / 86400000) + 1);
  let hours: number | null = null;
  if (i.startTime && i.endTime) {
    const diff = ms(endDate, i.endTime) - ms(i.startDate, i.startTime);
    if (diff > 0) hours = Math.max(1, Math.ceil(diff / 3600000));
  }
  if (!i.rate) return { amount: null, days, hours, detail: "" };
  if (i.unit === "day") return { amount: Math.round(i.rate * days * 100) / 100, days, hours, detail: `${money(i.rate)} per day x ${days} day${days === 1 ? "" : "s"}` };
  if (i.unit === "hour") {
    if (hours === null) return { amount: null, days, hours, detail: "" };
    return { amount: Math.round(i.rate * hours * 100) / 100, days, hours, detail: `${money(i.rate)} per hour x ${hours} hour${hours === 1 ? "" : "s"}` };
  }
  return { amount: i.rate, days, hours, detail: `${money(i.rate)} for the booking` };
}
