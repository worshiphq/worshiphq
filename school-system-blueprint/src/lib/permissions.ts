export type Role = "SCHOOL_ADMIN" | "HEADTEACHER" | "TEACHER" | "BURSAR" | "REGISTRAR" | "PARENT";

export type Permission =
  | "school.settings"
  | "users.manage"
  | "academics.manage" // years, terms, classes, subjects
  | "students.read"
  | "students.write"
  | "admissions.manage"
  | "attendance.take"
  | "attendance.read"
  | "scores.enter"
  | "scores.lock"
  | "reports.review" // add remarks / approve
  | "reports.publish"
  | "fees.structure"
  | "invoices.manage"
  | "payments.record"
  | "payments.reverse"
  | "fees.read"
  | "messages.send"
  | "audit.read";

const ALL: Permission[] = [
  "school.settings", "users.manage", "academics.manage", "students.read", "students.write",
  "admissions.manage", "attendance.take", "attendance.read", "scores.enter", "scores.lock",
  "reports.review", "reports.publish", "fees.structure", "invoices.manage", "payments.record",
  "payments.reverse", "fees.read", "messages.send", "audit.read",
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SCHOOL_ADMIN: ALL,
  HEADTEACHER: [
    "students.read", "attendance.read", "scores.lock", "reports.review", "reports.publish",
    "fees.read", "messages.send", "academics.manage", "admissions.manage", "audit.read",
  ],
  TEACHER: ["students.read", "attendance.take", "attendance.read", "scores.enter", "reports.review"],
  BURSAR: [
    "students.read", "fees.structure", "invoices.manage", "payments.record", "fees.read", "messages.send",
  ],
  REGISTRAR: ["students.read", "students.write", "admissions.manage", "attendance.read", "messages.send"],
  PARENT: [], // parents use row-level access: only their own linked children
};

export const can = (role: Role, p: Permission) => ROLE_PERMISSIONS[role].includes(p);

/** Teachers may only act on classes/subjects they are assigned to; enforce in the query layer, not just the UI. */
export const SCOPED_TO_ASSIGNMENT: Permission[] = ["attendance.take", "scores.enter"];
