// Starting points for setting up levies. Generic and fully editable: no denomination names and no claim that any
// rate is anyone's real or official rate. The church changes every figure to what it actually pays.
import type { Frequency, LevyKind } from "./types";

export const TEMPLATE_NOTE = "Example rates. Change them to match what your church actually pays.";

/** Which of the church's funds to tick first (the church confirms or changes the selection). */
export type SourceHint = "tithes" | "offertory" | "tithes_offertory" | "all" | null;

export interface LevyTemplate {
  key: string;
  name: string;
  payee: string;
  payeeKind: string;
  kind: LevyKind;
  /** Example only. */
  rate: number | null;
  /** Fixed templates leave the amount blank; the church types it in. */
  fixedAmount: number | null;
  placeholder?: string;
  frequency: Frequency;
  dueDays: number;
  sourceHint: SourceHint;
  blurb: string;
}

export const LEVY_TEMPLATES: LevyTemplate[] = [
  {
    key: "tithe-share", name: "Tithe share to head office", payee: "Head office", payeeKind: "hq",
    kind: "percent", rate: 10, fixedAmount: null, frequency: "monthly", dueDays: 15, sourceHint: "tithes",
    blurb: "A percentage of each month's tithes, due 15 days after the month ends.",
  },
  {
    key: "offering-share", name: "Offering share to district or area", payee: "District", payeeKind: "district",
    kind: "percent", rate: 5, fixedAmount: null, frequency: "monthly", dueDays: 15, sourceHint: "offertory",
    blurb: "A percentage of each month's offerings.",
  },
  {
    key: "missions-fixed", name: "Fixed monthly missions levy", payee: "Missions fund", payeeKind: "mission",
    kind: "fixed", rate: null, fixedAmount: null, placeholder: "e.g. 200.00", frequency: "monthly", dueDays: 15, sourceHint: null,
    blurb: "The same amount every month, whatever came in.",
  },
  {
    key: "area-dues-quarterly", name: "Quarterly area dues", payee: "Area", payeeKind: "area",
    kind: "fixed", rate: null, fixedAmount: null, placeholder: "e.g. 600.00", frequency: "quarterly", dueDays: 30, sourceHint: null,
    blurb: "A fixed amount once a quarter.",
  },
  {
    key: "convention-yearly", name: "Annual convention levy", payee: "Head office", payeeKind: "hq",
    kind: "fixed", rate: null, fixedAmount: null, placeholder: "e.g. 1,500.00", frequency: "yearly", dueDays: 60, sourceHint: null,
    blurb: "A fixed amount once a year.",
  },
];

export interface TemplateSet { key: string; name: string; blurb: string; templates: string[] }

export const TEMPLATE_SETS: TemplateSet[] = [
  { key: "tithe-based", name: "Tithe based", blurb: "One share of tithes to head office.", templates: ["tithe-share"] },
  { key: "tithe-offering", name: "Tithe and offering split", blurb: "A tithe share to head office and an offering share to the district.", templates: ["tithe-share", "offering-share"] },
  { key: "fixed-only", name: "Fixed dues only", blurb: "Set amounts monthly, quarterly and yearly, whatever came in.", templates: ["missions-fixed", "area-dues-quarterly", "convention-yearly"] },
];

export const templateByKey = (k: string) => LEVY_TEMPLATES.find((t) => t.key === k) ?? null;
