import "server-only";
import { db } from "@/lib/db";

/**
 * One exportable table. Every tab in the app maps to a dataset here, so the
 * per-tab export, the combined workbook and the zip bundle all read from the
 * same definitions — no drift between them.
 */
export interface Dataset {
  key: string;
  label: string;
  /** Section key the user must be able to see for this dataset. */
  section: string;
  fetch: (churchId: string) => Promise<{ headers: string[]; rows: unknown[][] }>;
}

const d = (v: Date | null | undefined) => (v ? v.toISOString().slice(0, 10) : "");
const n = (v: unknown) => (v === null || v === undefined ? "" : Number(v));

export const DATASETS: Dataset[] = [
  {
    key: "members",
    label: "Members",
    section: "people",
    async fetch(churchId) {
      const rows = await db.person.findMany({
        where: { churchId },
        orderBy: { firstName: "asc" },
        include: { department: { select: { name: true } } },
      });
      return {
        headers: ["Member ID", "First name", "Last name", "Phone", "Email", "Gender", "Status", "Department", "Birthday", "Joined"],
        rows: rows.map((p) => [
          p.memberId ?? "", p.firstName, p.lastName, p.phone ?? "", p.email ?? "",
          p.gender ?? "", p.status, p.department?.name ?? "", p.birthday ?? "", d(p.joinedAt),
        ]),
      };
    },
  },
  {
    key: "visitors",
    label: "Visitors",
    section: "visitors",
    async fetch(churchId) {
      const rows = await db.visitor.findMany({ where: { churchId }, orderBy: { visitDate: "desc" } });
      return {
        headers: ["First name", "Last name", "Phone", "Email", "Purpose", "Notes", "Visit date"],
        rows: rows.map((v) => [v.firstName, v.lastName, v.phone ?? "", v.email ?? "", v.purpose ?? "", v.notes ?? "", d(v.visitDate)]),
      };
    },
  },
  {
    key: "giving",
    label: "Giving",
    section: "giving",
    async fetch(churchId) {
      const rows = await db.gift.findMany({
        where: { churchId },
        orderBy: { date: "desc" },
        include: {
          person: { select: { firstName: true, lastName: true } },
          fund: { select: { name: true } },
        },
      });
      return {
        headers: ["Date", "Giver", "Amount", "Method", "Fund", "Reference"],
        rows: rows.map((g) => [
          d(g.date),
          g.person ? `${g.person.firstName} ${g.person.lastName}` : (g.donorName ?? "Anonymous"),
          n(g.amount), String(g.method).replace(/_/g, " "), g.fund?.name ?? "", g.reference ?? "",
        ]),
      };
    },
  },
  {
    key: "pledges",
    label: "Pledges",
    section: "pledges",
    async fetch(churchId) {
      const rows = await db.pledge.findMany({
        where: { churchId },
        orderBy: { dueAt: "asc" },
        include: { campaign: { select: { name: true } }, harvest: { select: { year: true } } },
      });
      return {
        headers: ["Pledger", "Type", "Phone", "Amount", "Paid", "Balance", "Due date", "Campaign", "Harvest"],
        rows: rows.map((p) => [
          p.donorName, p.donorType, p.donorPhone ?? "",
          n(p.amount), n(p.fulfilled), Number(p.amount) - Number(p.fulfilled),
          d(p.dueAt), p.campaign?.name ?? "", p.harvest?.year ?? "",
        ]),
      };
    },
  },
  {
    key: "pledge-payments",
    label: "Pledge payments",
    section: "pledges",
    async fetch(churchId) {
      const rows = await db.pledgePayment.findMany({
        where: { churchId },
        orderBy: { date: "desc" },
        include: { pledge: { select: { donorName: true } } },
      });
      return {
        headers: ["Date", "Pledger", "Amount", "Method", "Note"],
        rows: rows.map((p) => [d(p.date), p.pledge.donorName, n(p.amount), String(p.method).replace(/_/g, " "), p.note ?? ""]),
      };
    },
  },
  {
    key: "attendance",
    label: "Attendance",
    section: "attendance",
    async fetch(churchId) {
      const rows = await db.attendanceRecord.findMany({
        where: { churchId },
        orderBy: { date: "desc" },
        take: 20000,
        include: { person: { select: { firstName: true, lastName: true } } },
      });
      return {
        headers: ["Date", "Service", "Attendee", "Category", "Checked in via"],
        rows: rows.map((a) => [
          d(a.date),
          a.serviceName,
          a.person ? `${a.person.firstName} ${a.person.lastName}` : (a.guestName ?? "Guest"),
          a.category,
          a.method,
        ]),
      };
    },
  },
  {
    key: "events",
    label: "Events",
    section: "events",
    async fetch(churchId) {
      const rows = await db.event.findMany({ where: { churchId }, orderBy: { startsAt: "desc" } });
      return {
        headers: ["Title", "Type", "Starts", "Capacity", "Paid", "Price"],
        rows: rows.map((e) => [e.title, e.type ?? "", d(e.startsAt), e.capacity ?? "", e.paid ? "Yes" : "No", n(e.price)]),
      };
    },
  },
  {
    key: "groups",
    label: "Groups",
    section: "groups",
    async fetch(churchId) {
      const rows = await db.group.findMany({ where: { churchId }, orderBy: { name: "asc" } });
      return {
        headers: ["Name", "Meeting day", "Meeting time"],
        rows: rows.map((g) => [g.name, g.meetingDay ?? "", g.meetingTime ?? ""]),
      };
    },
  },
  {
    key: "departments",
    label: "Departments",
    section: "people",
    async fetch(churchId) {
      const rows = await db.department.findMany({
        where: { churchId },
        orderBy: { name: "asc" },
        include: { _count: { select: { members: true } } },
      });
      return {
        headers: ["Department", "Description", "Members"],
        rows: rows.map((x) => [x.name, x.description ?? "", x._count.members]),
      };
    },
  },
  {
    key: "expenses",
    label: "Expenses",
    section: "expenses",
    async fetch(churchId) {
      const rows = await db.expense.findMany({ where: { churchId }, orderBy: { date: "desc" } });
      return {
        headers: ["Date", "Description", "Category", "Amount", "Vendor", "Approved by"],
        rows: rows.map((e) => [d(e.date), e.description, e.category, n(e.amount), e.vendor ?? "", e.approvedBy ?? ""]),
      };
    },
  },
  {
    key: "budgets",
    label: "Budgets",
    section: "budgets",
    async fetch(churchId) {
      const rows = await db.budget.findMany({
        where: { churchId },
        orderBy: [{ year: "desc" }],
        include: { department: { select: { name: true } }, entries: true },
      });
      return {
        headers: ["Budget", "Department", "Year", "Quarter", "Status", "Allocated", "Income", "Spent", "Balance"],
        rows: rows.map((b) => {
          const income = b.entries.filter((e) => e.type === "income").reduce((s, e) => s + Number(e.amount), 0);
          const spent = b.entries.filter((e) => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);
          return [b.name, b.department?.name ?? "", b.year, b.quarter ?? "", b.status, n(b.total), income, spent, Number(b.total) + income - spent];
        }),
      };
    },
  },
  {
    key: "budget-entries",
    label: "Budget income & expenses",
    section: "budgets",
    async fetch(churchId) {
      const rows = await db.budgetEntry.findMany({
        where: { churchId },
        orderBy: { date: "desc" },
        include: { budget: { select: { name: true, department: { select: { name: true } } } } },
      });
      return {
        headers: ["Date", "Budget", "Department", "Type", "Description", "Category", "Amount"],
        rows: rows.map((e) => [
          d(e.date), e.budget.name, e.budget.department?.name ?? "", e.type, e.description, e.category ?? "", n(e.amount),
        ]),
      };
    },
  },
  {
    key: "harvest",
    label: "Harvest contributions",
    section: "harvest",
    async fetch(churchId) {
      const rows = await db.harvestContribution.findMany({
        where: { churchId },
        orderBy: { date: "desc" },
        include: { harvest: { select: { year: true } } },
      });
      return {
        headers: ["Year", "Date", "Donor", "Type", "Phone", "Amount", "Method"],
        rows: rows.map((h) => [
          h.harvest?.year ?? "", d(h.date), h.donorName, h.donorType, h.donorPhone ?? "", n(h.amount), String(h.method).replace(/_/g, " "),
        ]),
      };
    },
  },
  {
    key: "prayer-requests",
    label: "Prayer requests",
    section: "prayer-requests",
    async fetch(churchId) {
      const rows = await db.prayerRequest.findMany({ where: { churchId }, orderBy: { createdAt: "desc" } });
      return {
        headers: ["Date", "Name", "Request", "Status", "Prayers"],
        rows: rows.map((p) => [d(p.createdAt), p.isAnonymous ? "Anonymous" : p.name, p.request, p.status, p.prayerCount]),
      };
    },
  },
];

/** Datasets this session is allowed to export, given their visible sections. */
export function allowedDatasets(hasSection: (key: string) => boolean): Dataset[] {
  return DATASETS.filter((ds) => hasSection(ds.section));
}
