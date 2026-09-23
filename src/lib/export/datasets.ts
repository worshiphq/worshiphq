import "server-only";
import { db } from "@/lib/db";

/**
 * One exportable table. Every tab in the app maps to a dataset here, so the
 * per-tab export, the combined workbook and the zip bundle all read from the
 * same definitions - no drift between them.
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
  {
    key: "communications",
    label: "Communications history",
    section: "communications",
    async fetch(churchId) {
      const rows = await db.communication.findMany({ where: { churchId }, orderBy: { createdAt: "desc" } });
      return {
        headers: ["Date", "Campaign", "Channel", "Segment", "Sent", "Delivered", "Opened", "Status"],
        rows: rows.map((c) => [d(c.createdAt), c.name, c.channel, c.segment ?? "", c.sent, c.delivered, c.opened, c.status]),
      };
    },
  },
  {
    key: "communication-recipients",
    label: "Communications - recipients",
    section: "communications",
    async fetch(churchId) {
      const rows = await db.communicationRecipient.findMany({
        where: { communication: { churchId } },
        orderBy: { createdAt: "desc" },
        include: { communication: { select: { name: true } } },
      });
      return {
        headers: ["Date", "Campaign", "Recipient", "Contact", "Status"],
        rows: rows.map((r) => [d(r.createdAt), r.communication.name, r.name ?? "", r.contact, r.status]),
      };
    },
  },
  {
    key: "transactions",
    label: "Accounting transactions",
    section: "accounting",
    async fetch(churchId) {
      const rows = await db.transaction.findMany({ where: { churchId }, orderBy: { date: "desc" } });
      return {
        headers: ["Date", "Description", "Category", "Fund", "Amount"],
        rows: rows.map((t) => [d(t.date), t.description, t.category, t.fund ?? "", n(t.amount)]),
      };
    },
  },
  {
    key: "sms-credits",
    label: "SMS credit ledger",
    section: "communications",
    async fetch(churchId) {
      const rows = await db.smsTransaction.findMany({ where: { churchId }, orderBy: { createdAt: "desc" } });
      return {
        headers: ["Date", "Kind", "Credits", "Balance after", "Note"],
        rows: rows.map((t) => [d(t.createdAt), t.kind, t.credits, t.balanceAfter, t.note ?? ""]),
      };
    },
  },
  {
    key: "welfare-records",
    label: "Welfare (dues & aid)",
    section: "welfare",
    async fetch(churchId) {
      const rows = await db.welfareRecord.findMany({
        where: { churchId },
        orderBy: { date: "desc" },
      });
      return {
        headers: ["Date", "Kind", "Recipient", "Type", "Amount", "Description"],
        rows: rows.map((r) => [d(r.date), r.kind, r.recipientName, r.type, n(r.amount), r.description ?? ""]),
      };
    },
  },
  {
    key: "welfare-dues",
    label: "Welfare dues paid",
    section: "welfare",
    async fetch(churchId) {
      const rows = await db.welfareDue.findMany({
        where: { churchId },
        orderBy: [{ year: "desc" }, { month: "desc" }],
        include: { person: { select: { firstName: true, lastName: true } } },
      });
      return {
        headers: ["Member", "Year", "Month", "Amount", "Recorded"],
        rows: rows.map((w) => [`${w.person.firstName} ${w.person.lastName}`, w.year, w.month, n(w.amount), d(w.createdAt)]),
      };
    },
  },
  {
    key: "dayborn",
    label: "Day Born collections",
    section: "dayborn",
    async fetch(churchId) {
      const rows = await db.dayBornEntry.findMany({
        where: { week: { churchId } },
        orderBy: { createdAt: "desc" },
        include: { week: { select: { weekOf: true } } },
      });
      return {
        headers: ["Week of", "Day", "Person", "Method", "Amount", "Reference"],
        rows: rows.map((e) => [d(e.week.weekOf), e.day, e.personName ?? "", String(e.method).replace(/_/g, " "), n(e.amount), e.reference ?? ""]),
      };
    },
  },
  {
    key: "follow-ups",
    label: "Follow-ups",
    section: "follow-ups",
    async fetch(churchId) {
      const rows = await db.followUp.findMany({
        where: { churchId },
        orderBy: { createdAt: "desc" },
        include: {
          person: { select: { firstName: true, lastName: true } },
          visitor: { select: { firstName: true, lastName: true } },
          assignee: { select: { name: true } },
        },
      });
      return {
        headers: ["Date", "Type", "Title", "For", "Assigned to", "Status", "Due date"],
        rows: rows.map((f) => [
          d(f.createdAt), f.type, f.title,
          f.person ? `${f.person.firstName} ${f.person.lastName}` : f.visitor ? `${f.visitor.firstName} ${f.visitor.lastName}` : "",
          f.assignee?.name ?? "", f.status, d(f.dueDate),
        ]),
      };
    },
  },
  {
    key: "sermons",
    label: "Sermons",
    section: "sermons",
    async fetch(churchId) {
      const rows = await db.sermon.findMany({ where: { churchId }, orderBy: { date: "desc" } });
      return {
        headers: ["Date", "Title", "Preacher", "Series", "Scripture", "Published"],
        rows: rows.map((s) => [d(s.date), s.title, s.preacher ?? "", s.series ?? "", s.scripture ?? "", s.published ? "Yes" : "No"]),
      };
    },
  },
  {
    key: "devotionals",
    label: "Devotionals",
    section: "devotionals",
    async fetch(churchId) {
      const rows = await db.devotional.findMany({ where: { churchId }, orderBy: { date: "desc" } });
      return {
        headers: ["Date", "Title", "Scripture", "Author", "Published"],
        rows: rows.map((v) => [d(v.date), v.title, v.scripture ?? "", v.author ?? "", v.published ? "Yes" : "No"]),
      };
    },
  },
  {
    key: "testimonies",
    label: "Testimonies",
    section: "testimonies",
    async fetch(churchId) {
      const rows = await db.testimony.findMany({
        where: { churchId },
        orderBy: { date: "desc" },
        include: { person: { select: { firstName: true, lastName: true } } },
      });
      return {
        headers: ["Date", "Title", "Person", "Category", "Status"],
        rows: rows.map((t) => [
          d(t.date), t.title, t.anonymous ? "Anonymous" : t.person ? `${t.person.firstName} ${t.person.lastName}` : "",
          t.category, t.status,
        ]),
      };
    },
  },
  {
    key: "counseling",
    label: "Counseling sessions",
    section: "counseling",
    async fetch(churchId) {
      const rows = await db.counselingSession.findMany({
        where: { churchId },
        orderBy: { date: "desc" },
        include: { person: { select: { firstName: true, lastName: true } }, counselor: { select: { name: true } } },
      });
      return {
        headers: ["Date", "Person", "Counselor", "Type", "Status", "Summary"],
        rows: rows.map((c) => [
          d(c.date), c.person ? `${c.person.firstName} ${c.person.lastName}` : "", c.counselor?.name ?? "",
          c.type, c.status, c.summary,
        ]),
      };
    },
  },
  {
    key: "assets",
    label: "Assets",
    section: "assets",
    async fetch(churchId) {
      const rows = await db.asset.findMany({ where: { churchId }, orderBy: { name: "asc" } });
      return {
        headers: ["Name", "Category", "Location", "Condition", "Serial No", "Purchase date", "Purchase price"],
        rows: rows.map((a) => [a.name, a.category, a.location ?? "", a.condition, a.serialNo ?? "", d(a.purchaseDate), a.purchasePrice ?? ""]),
      };
    },
  },
  {
    key: "bookings",
    label: "Bookings",
    section: "bookings",
    async fetch(churchId) {
      const rows = await db.booking.findMany({
        where: { churchId },
        orderBy: { startTime: "desc" },
        include: { facility: { select: { name: true } } },
      });
      return {
        headers: ["Facility", "Title", "Booked by", "Start", "End", "Status"],
        rows: rows.map((b) => [b.facility.name, b.title, b.bookedBy, d(b.startTime), d(b.endTime), b.status]),
      };
    },
  },
  {
    key: "volunteers",
    label: "Volunteer assignments",
    section: "volunteers",
    async fetch(churchId) {
      const rows = await db.volunteerAssignment.findMany({ where: { churchId }, orderBy: { serviceDate: "desc" } });
      return {
        headers: ["Service date", "Team", "Role", "Person", "Confirmed"],
        rows: rows.map((v) => [d(v.serviceDate), v.team, v.role, v.personName, v.confirmed ? "Yes" : "No"]),
      };
    },
  },
  {
    key: "rosters",
    label: "Volunteer rosters",
    section: "rosters",
    async fetch(churchId) {
      const rows = await db.volunteerSlot.findMany({
        where: { churchId },
        orderBy: { date: "desc" },
        include: { roster: { select: { name: true } }, person: { select: { firstName: true, lastName: true } } },
      });
      return {
        headers: ["Roster", "Date", "Service", "Role", "Person", "Shift", "Status"],
        rows: rows.map((s) => [
          s.roster.name, d(s.date), s.service ?? "", s.role,
          s.person ? `${s.person.firstName} ${s.person.lastName}` : (s.personName ?? ""),
          s.shift, s.status,
        ]),
      };
    },
  },
  {
    key: "notices",
    label: "Notices",
    section: "notices",
    async fetch(churchId) {
      const rows = await db.churchNotice.findMany({ where: { churchId }, orderBy: { createdAt: "desc" } });
      return {
        headers: ["Date", "Title", "Body", "Pinned"],
        rows: rows.map((n2) => [d(n2.createdAt), n2.title, n2.body, n2.pinned ? "Yes" : "No"]),
      };
    },
  },
  {
    key: "registrations",
    label: "Event registrations",
    section: "events",
    async fetch(churchId) {
      const rows = await db.registration.findMany({
        where: { event: { churchId } },
        orderBy: { createdAt: "desc" },
        include: { event: { select: { title: true } } },
      });
      return {
        headers: ["Date", "Event", "Name", "Email", "Phone", "Checked in"],
        rows: rows.map((r) => [d(r.createdAt), r.event.title, r.name, r.email ?? "", r.phone ?? "", r.checkedIn ? "Yes" : "No"]),
      };
    },
  },
  {
    key: "audit-log",
    label: "Audit log",
    section: "audit-log",
    async fetch(churchId) {
      const rows = await db.auditLog.findMany({
        where: { churchId },
        orderBy: { createdAt: "desc" },
        take: 20000,
        include: { user: { select: { name: true, email: true } } },
      });
      return {
        headers: ["Date", "User", "Action", "Entity", "Detail"],
        rows: rows.map((a) => [d(a.createdAt), a.user?.name ?? a.user?.email ?? "", a.action, a.entity, a.detail ?? ""]),
      };
    },
  },
];

/** Datasets this session is allowed to export, given their visible sections. */
export function allowedDatasets(hasSection: (key: string) => boolean): Dataset[] {
  return DATASETS.filter((ds) => hasSection(ds.section));
}
