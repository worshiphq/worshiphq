// Shapes the Service income screen receives. Types and small pure helpers only, safe in client components.

export const GIFT_METHOD_LABEL: Record<string, string> = {
  Cash: "Cash", MTN_MoMo: "MTN MoMo", Telecel_Cash: "Telecel Cash", AirtelTigo: "AirtelTigo", Card: "Card", Bank: "Bank",
};

export interface SheetGift {
  id: string;
  fundId: string | null;
  fund: string;
  amount: number;
  method: string;
  accountId: string | null;
  pending: boolean;
  donorName: string | null;
  /** A counted collection line (editable on the sheet) rather than a named or online gift. */
  counted: boolean;
}

export interface ServiceCard {
  id: string;
  dateYmd: string;
  serviceName: string;
  sessionId: string | null;
  slotId: string | null;
  headcount: number | null;
  attendance: number | null;
  attendanceFrom: "session" | "headcount" | null;
  countedBy: string | null;
  note: string | null;
  total: number;
  perPerson: number | null;
  byFund: { fundId: string | null; name: string; total: number }[];
  gifts: SheetGift[];
}

export interface UntaggedGift { id: string; dateYmd: string; fund: string; amount: number; method: string; donorName: string | null }

export interface ServiceWeekData {
  weekStartYmd: string;
  weekEndYmd: string;
  todayYmd: string;
  services: ServiceCard[];
  weekTotal: number;
  lastWeekTotal: number;
  untagged: UntaggedGift[];
  funds: { id: string; name: string; inServiceSheet: boolean; kind: "tithes" | "offertory" | "other" }[];
  slots: { id: string; name: string; weekday: number; startMinute: number }[];
  sessions: { id: string; serviceName: string; dateYmd: string; total: number }[];
  accounts: { id: string; name: string; isDefault: boolean; type: string }[];
  access: { manage: boolean; del: boolean };
}

export interface ServiceMonthData {
  year: number;
  month: number; // 0-11
  weeks: { key: string; label: string; from: string; to: string; services: number; attendance: number; total: number }[];
  rows: { name: string; cells: number[]; total: number }[];
  total: number;
  services: number;
  attendance: number;
}

/** Sunday of the week holding a local day (weeks run Sunday to Saturday, like Accounting). */
export function weekStartOf(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() - t.getUTCDay());
  return t.toISOString().slice(0, 10);
}

export function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const weekdayOf = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay();
