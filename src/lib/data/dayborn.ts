import "server-only";
import { db } from "@/lib/db";

export const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
export type DayName = (typeof DAYS)[number];

export const DAY_LABELS: Record<DayName, string> = {
  monday: "Monday (Adwoa / Kojo)",
  tuesday: "Tuesday (Abena / Kwabena)",
  wednesday: "Wednesday (Akua / Kwaku)",
  thursday: "Thursday (Yaa / Yaw)",
  friday: "Friday (Afia / Kofi)",
  saturday: "Saturday (Ama / Kwame)",
  sunday: "Sunday (Akosua / Kwesi)",
};

export interface DayBornWeekRow {
  id: string;
  weekOf: string;
  monday: number;
  tuesday: number;
  wednesday: number;
  thursday: number;
  friday: number;
  saturday: number;
  sunday: number;
  posted: boolean;
  postedAt: string | null;
  entries: DayBornEntryRow[];
  cashTotal: number;
  momoTotal: number;
  grandTotal: number;
}

export interface DayBornEntryRow {
  id: string;
  day: string;
  personName: string | null;
  method: string;
  amount: number;
  reference: string | null;
  createdAt: string;
}

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export async function getDayBornData(churchId: string) {
  const now = new Date();
  const currentMonday = getMonday(now);

  const weeks = await db.dayBornWeek.findMany({
    where: { churchId },
    orderBy: { weekOf: "desc" },
    take: 12,
    include: { entries: { orderBy: { createdAt: "desc" } } },
  });

  const rows: DayBornWeekRow[] = weeks.map((w) => {
    const cashTotal =
      Number(w.monday) + Number(w.tuesday) + Number(w.wednesday) +
      Number(w.thursday) + Number(w.friday) + Number(w.saturday) + Number(w.sunday);
    const momoTotal = w.entries.reduce((s, e) => s + Number(e.amount), 0);
    return {
      id: w.id,
      weekOf: w.weekOf.toISOString(),
      monday: Number(w.monday),
      tuesday: Number(w.tuesday),
      wednesday: Number(w.wednesday),
      thursday: Number(w.thursday),
      friday: Number(w.friday),
      saturday: Number(w.saturday),
      sunday: Number(w.sunday),
      posted: w.posted,
      postedAt: w.postedAt?.toISOString() ?? null,
      entries: w.entries.map((e) => ({
        id: e.id,
        day: e.day,
        personName: e.personName,
        method: e.method,
        amount: Number(e.amount),
        reference: e.reference,
        createdAt: e.createdAt.toISOString(),
      })),
      cashTotal,
      momoTotal,
      grandTotal: cashTotal + momoTotal,
    };
  });

  return { weeks: rows, currentMonday: currentMonday.toISOString() };
}
