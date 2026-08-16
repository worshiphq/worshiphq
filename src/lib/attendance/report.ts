// Client-safe helpers for the end-of-service attendance report SMS. Shared by
// the server action (which renders + sends) and the End-service dialog (which
// shows a live preview). No server-only imports here.

export const DEFAULT_ATTENDANCE_REPORT =
  "{church}: {service} on {date} has ended. Total present: {total} — {adults} adults, {teens} teens, {children} children, {visitors} visitors.";

export interface AttendanceReportVars {
  church: string;
  service: string;
  date: string;
  total: number;
  adults: number;
  teens: number;
  children: number;
  visitors: number;
}

/** Placeholders shown as chips in the template editor. */
export const ATTENDANCE_REPORT_PLACEHOLDERS: { key: string; hint: string }[] = [
  { key: "church", hint: "Church name" },
  { key: "service", hint: "Service name" },
  { key: "date", hint: "Service date" },
  { key: "total", hint: "Total present" },
  { key: "adults", hint: "Adults" },
  { key: "teens", hint: "Teens" },
  { key: "children", hint: "Children" },
  { key: "visitors", hint: "Visitors" },
];

/** Fill the template. Unknown placeholders are dropped and double spaces
 *  collapse so a blank value never leaves an ugly gap. */
export function renderAttendanceReport(template: string, vars: AttendanceReportVars): string {
  const map: Record<string, string> = {
    church: vars.church,
    service: vars.service,
    date: vars.date,
    total: String(vars.total),
    adults: String(vars.adults),
    teens: String(vars.teens),
    children: String(vars.children),
    visitors: String(vars.visitors),
  };
  return (template || DEFAULT_ATTENDANCE_REPORT)
    .replace(/\{(\w+)\}/g, (_, k: string) => (k in map ? map[k] : ""))
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Split the free-text "extra numbers" box into individual phone strings. */
export function parseNumbers(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
