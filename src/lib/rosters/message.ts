// Shared roster-announcement body builder. Groups a roster's slots by service
// (ordered by date) so a combined sheet reads:
//   Sunday Service — Sun 12 Jan
//   Word: John
//   Prayer: Mary
//
//   Wednesday Service — Wed 15 Jan
//   Word: Paul

export type RosterSlotLite = { service: string | null; date: Date; role: string; personName: string | null };

const fmtServiceDate = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const hasTime = (d: Date) => d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0;
const fmtTime = (d: Date) => {
  let h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ap = h < 12 ? "am" : "pm";
  h = h % 12 === 0 ? 12 : h % 12;
  return `${h}:${String(m).padStart(2, "0")} ${ap}`;
};

export function buildRosterBody(slots: RosterSlotLite[]): string {
  const groups = new Map<string, { title: string; lines: string[] }>();
  const sorted = [...slots].sort((a, b) => a.date.getTime() - b.date.getTime());
  for (const s of sorted) {
    const key = `${s.service ?? ""}|${s.date.toISOString().slice(0, 10)}`;
    if (!groups.has(key)) {
      const dateLabel = fmtServiceDate(s.date) + (hasTime(s.date) ? ` at ${fmtTime(s.date)}` : "");
      groups.set(key, { title: `${s.service || "Service"} — ${dateLabel}`, lines: [] });
    }
    groups.get(key)!.lines.push(`${s.role}: ${s.personName ?? "-"}`);
  }
  return [...groups.values()].map((g) => `${g.title}\n${g.lines.join("\n")}`).join("\n\n");
}
