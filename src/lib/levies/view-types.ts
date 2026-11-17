// Shapes the Levies screen receives from the server. Types only, safe to import in client components.
import type { Breakdown } from "./engine";
import type { Frequency, LevyStatus } from "./types";
import type { SourceHint } from "./templates";

export interface VersionView {
  id: string;
  fromYmd: string;
  kind: "percent" | "fixed";
  rate: number | null;
  fixedAmount: number | null;
  allIncome: boolean;
  sources: string[];
  sourceLabels: string[];
  minAmount: number | null;
  maxAmount: number | null;
  /** "10% of Tithes and Offertory" or "GH₵500.00 each month". */
  summary: string;
  byName: string | null;
}

export interface RuleView {
  id: string;
  name: string;
  payee: string;
  payeeKind: string;
  payeeChurchId: string | null;
  frequency: Frequency;
  yearStartMonth: number;
  dueDays: number;
  startsYmd: string;
  endsYmd: string | null;
  active: boolean;
  afterRuleId: string | null;
  afterName: string | null;
  notes: string | null;
  current: VersionView | null;
  versions: VersionView[];
  /** Frequency, start date and year start are fixed once a period is paid or closed. */
  scheduleLocked: boolean;
  hasPayments: boolean;
  /** "Due 15 days after each month ends". */
  dueText: string;
}

export interface PaymentView {
  id: string;
  recordId: string;
  paidOnYmd: string;
  amount: number;
  method: string;
  reference: string | null;
  note: string | null;
  hasProof: boolean;
  proofName: string | null;
  proofType: string | null;
  expenseId: string | null;
  recordedByName: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  ruleName?: string;
  periodLabel?: string;
}

export interface AdjustmentView { id: string; amount: number; kind: string; reason: string; byName: string | null; createdAt: string }

export interface RecordView {
  id: string;
  ruleId: string;
  ruleName: string;
  payee: string;
  periodKey: string;
  label: string;
  short: string;
  frequency: Frequency;
  startYmd: string;
  endYmd: string;
  dueYmd: string;
  state: "open" | "closed";
  status: LevyStatus;
  statusText: string;
  overdue: boolean;
  partPaid: boolean;
  calculated: number;
  adjustmentsTotal: number;
  due: number;
  paid: number;
  left: number;
  incomeBase: number;
  /** One line per income stream, in plain English. */
  explanation: string[];
  breakdown: Breakdown | null;
  adjustments: AdjustmentView[];
  payments: PaymentView[];
  closedAt: string | null;
  closedByName: string | null;
  drift: number;
  calculatedAt: string | null;
}

export interface ChangeView { id: string; ruleId: string; ruleName: string; action: string; summary: string; byName: string | null; createdAt: string }

export interface StreamOption { key: string; label: string; last3: number; kind: "tithes" | "offertory" | "other" }

export interface ScheduleItem {
  name: string;
  payee: string;
  kind: "percent" | "fixed";
  rate: number | null;
  fixedAmount: number | null;
  frequency: Frequency;
  dueDays: number;
  sourceHint: SourceHint;
  note: string | null;
}

export interface LeviesPageData {
  year: number;
  todayYmd: string;
  tz: string;
  churchName: string;
  access: { manage: boolean; del: boolean; reopen: boolean; branchLocked: boolean };
  settings: { remindOn: boolean; remindDays: number[]; remindSms: boolean; remindUserIds: string[]; autoClose: boolean };
  team: { id: string; name: string; role: string }[];
  streams: StreamOption[];
  rules: RuleView[];
  records: RecordView[];
  summary: {
    overdueCount: number; overdueTotal: number;
    dueNext: { total: number; dueYmd: string } | null;
    paidThisYear: number; incomeThisYear: number; leviesThisYear: number; keepPct: number | null;
    owedNow: number;
  };
  current: { label: string; untilYmd: string; lines: { ruleName: string; text: string; amount: number }[] }[];
  strip: { key: string; label: string; status: LevyStatus | "none"; due: number; paid: number }[];
  retention: { label: string; shares: { name: string; pct: number }[]; totalPct: number; keepPct: number }[];
  changes: ChangeView[];
  accounts: { id: string; name: string; isDefault: boolean; type: string }[];
  parent: { id: string; name: string; schedule: ScheduleItem[]; shares: boolean } | null;
  isParent: boolean;
  ownSchedule: ScheduleItem[];
  payments: { rows: PaymentView[]; total: number; page: number };
  r2Ready: boolean;
}

export interface BranchChild {
  id: string;
  name: string;
  kind: string;
  shares: boolean;
  owed: number;
  paid: number;
  overdueCount: number;
  overdueTotal: number;
  lastPaidOn: string | null;
  records: (Pick<RecordView, "id" | "ruleName" | "label" | "short" | "status" | "statusText" | "due" | "paid" | "left" | "dueYmd"> & { payments: PaymentView[] })[];
}
