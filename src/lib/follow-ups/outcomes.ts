/** How someone reached out, and what came of it. Shared by the report form,
 *  the follow-ups list, the summary page and the Excel export. */

export const REPORT_METHODS = [
  { value: "call", label: "Phone call" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "sms", label: "Text message" },
  { value: "visit", label: "Home visit" },
  { value: "in_person", label: "Met in person" },
  { value: "other", label: "Other" },
] as const;

export const REPORT_OUTCOMES = [
  { value: "reached", label: "Spoke with them", tone: "success" },
  { value: "will_return", label: "Will come again", tone: "success" },
  { value: "joining", label: "Wants to join the church", tone: "success" },
  { value: "needs_care", label: "Needs prayer or pastoral care", tone: "info" },
  { value: "no_answer", label: "No answer / couldn't reach", tone: "warning" },
  { value: "wrong_number", label: "Wrong or invalid number", tone: "danger" },
  { value: "not_interested", label: "Not interested", tone: "muted" },
] as const;

export type ReportMethod = (typeof REPORT_METHODS)[number]["value"];
export type ReportOutcome = (typeof REPORT_OUTCOMES)[number]["value"];

export const methodLabel = (v: string) => REPORT_METHODS.find((m) => m.value === v)?.label ?? v;
export const outcomeLabel = (v: string) => REPORT_OUTCOMES.find((o) => o.value === v)?.label ?? v;
export const outcomeTone = (v: string) => REPORT_OUTCOMES.find((o) => o.value === v)?.tone ?? "muted";

/** Outcomes that mean the person was actually reached. */
export const REACHED_OUTCOMES: readonly string[] = ["reached", "will_return", "joining", "needs_care", "not_interested"];
