import { PrismaClient } from "@prisma/client";

const base = new PrismaClient();

/**
 * Tenant guard. Models listed here always have `schoolId`; we inject it into every
 * where/data so one school can never read or write another school's rows.
 * Tables without a direct schoolId (Enrollment, InvoiceLine, GradeBand, …) are reached
 * through a parent that is already scoped. Add Postgres Row-Level Security as a second layer.
 */
const TENANT_MODELS = new Set([
  "AcademicYear", "Term", "CalendarDay", "Level", "Class", "Subject", "Student", "Guardian", "Staff",
  "AdmissionApplication", "AttendanceRecord", "AttendanceSubmission", "GradingScale", "AssessmentScheme",
  "Score", "SubjectResult", "TermReport", "FeeItem", "FeeStructureLine", "Discount", "Invoice", "Payment",
  "MessageTemplate", "Message", "SmsCreditEntry", "Announcement", "DocumentSequence",
]);

export function forSchool(schoolId: string) {
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);
          const a = args as any;
          if (["create", "createMany"].includes(operation)) {
            if (Array.isArray(a.data)) a.data = a.data.map((d: object) => ({ ...d, schoolId }));
            else a.data = { ...a.data, schoolId };
          } else if (operation === "upsert") {
            a.where = { ...a.where, schoolId };
            a.create = { ...a.create, schoolId };
          } else {
            a.where = { ...a.where, schoolId };
          }
          return query(a);
        },
      },
    },
  });
}

export const platformDb = base; // super-admin only; never expose to tenant request handlers
