/**
 * Staff & Payroll: database test. WRITES TO THE DATABASE, so it is locked down:
 *
 *   - It only runs with PAYROLL_TEST_OK=yes.
 *   - It only runs against a church whose slug starts with "zz-qa-" AND whose Church.isInternal is true.
 *     Give an existing hidden QA church with PAYROLL_QA_SLUG=zz-qa-..., or leave it out and the script makes a
 *     throwaway one (zz-qa-payroll-<time>), marks it internal, and deletes it at the end.
 *   - Everything it creates is removed in `finally`, and it then checks nothing is left behind.
 *   - No SMS or email is ever sent: only the pure payslipSmsText is called.
 *
 *   PAYROLL_TEST_OK=yes npx tsx scripts/qa/test-payroll-db.ts
 *
 * Point DATABASE_URL at a Supabase branch or a local Postgres when you can.
 */
import Module from "node:module";
import { PrismaClient } from "@prisma/client";
import * as E from "../../src/lib/payroll/engine";
import { computeLine, toP, fromP } from "../../src/lib/payroll/calc";
import { rulesFromJson } from "../../src/lib/payroll/rules";
import { isPayrollLocked, payslipSmsText } from "../../src/lib/payroll/mask";
import { unpaidDaysInMonth } from "../../src/lib/payroll/leave";

// Server-only modules (crypto-box for sealing) refuse to load outside Next; stub that guard for this script only.
const M = Module as unknown as { _load: (req: string, ...rest: unknown[]) => unknown };
const origLoad = M._load;
M._load = function (req: string, ...rest: unknown[]) {
  if (req === "server-only") return {};
  return origLoad.call(this, req, ...rest);
};

const prisma = new PrismaClient();
let pass = 0;
let fail = 0;
function ok(name: string, cond: unknown) {
  if (cond) pass++;
  else { fail++; console.error(`FAIL ${name}`); }
}
function eq(name: string, got: unknown, want: unknown) {
  ok(`${name} (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`, JSON.stringify(got) === JSON.stringify(want));
}
async function throws(name: string, fn: () => Promise<unknown>) {
  try { await fn(); fail++; console.error(`FAIL ${name}: did not throw`); } catch { pass++; }
}
const n = (v: { toString(): string } | null | undefined) => Number(v?.toString() ?? 0);

const YEAR = 2026;
const MONTH = 11;

async function isInternal(churchId: string): Promise<boolean> {
  try {
    const rows = await prisma.$queryRawUnsafe<{ isInternal: boolean }[]>(`SELECT "isInternal" FROM "Church" WHERE "id" = $1`, churchId);
    return rows[0]?.isInternal === true;
  } catch {
    return false; // the column does not exist yet: refuse
  }
}

async function main() {
  if (process.env.PAYROLL_TEST_OK !== "yes") {
    console.error("Refusing: set PAYROLL_TEST_OK=yes. This script writes to the database.");
    process.exit(2);
  }
  const givenSlug = process.env.PAYROLL_QA_SLUG?.trim();
  if (givenSlug && !givenSlug.startsWith("zz-qa-")) { console.error("Refusing: PAYROLL_QA_SLUG must start with zz-qa-."); process.exit(2); }

  const started = new Date();
  let churchId = "";
  let ownChurch = false;
  const made = { users: [] as string[], staff: [] as string[], accounts: [] as string[], departments: [] as string[], leaveTypes: [] as string[], settings: false };

  try {
    // ── Church ──
    if (givenSlug) {
      const c = await prisma.church.findUnique({ where: { slug: givenSlug }, select: { id: true } });
      if (!c) throw new Error(`No church ${givenSlug}`);
      churchId = c.id;
    } else {
      const c = await prisma.church.create({ data: { slug: `zz-qa-payroll-${Date.now()}`, name: "ZZ QA Payroll", smsCredits: 0 } as never, select: { id: true } });
      churchId = c.id;
      ownChurch = true;
      await prisma.$executeRawUnsafe(`UPDATE "Church" SET "isInternal" = true WHERE "id" = $1`, churchId).catch(() => {});
    }
    const slug = (await prisma.church.findUnique({ where: { id: churchId }, select: { slug: true } }))!.slug;
    if (!slug.startsWith("zz-qa-") || !(await isInternal(churchId))) {
      throw new Error(`Refusing: ${slug} is not a hidden internal QA church (needs slug zz-qa-... and isInternal = true).`);
    }

    // ── Setup ──
    const acc = await prisma.churchAccount.create({ data: { churchId, name: "QA Main", type: "bank", openingBalance: 100000, isDefault: false } });
    made.accounts.push(acc.id);
    const dept = await prisma.department.create({ data: { churchId, name: `QA Office ${Date.now()}` } });
    made.departments.push(dept.id);
    if (!(await prisma.payrollSettings.findUnique({ where: { churchId } }))) made.settings = true;
    await E.ensureSettings(prisma, churchId);
    await prisma.payrollSettings.update({ where: { churchId }, data: { statutoryMode: "ghana", makerChecker: "auto", postingMode: "split", workingDaysRule: "weekdays" } });

    const mkUser = async (name: string, role: "Owner" | "Admin" | "Volunteer", extra: Record<string, unknown> = {}) => {
      const u = await prisma.user.create({ data: { churchId, name, email: `${name.toLowerCase()}-${Date.now()}@example.test`, role, ...extra } });
      made.users.push(u.id);
      return u;
    };
    const owner = await mkUser("QAOwner", "Owner");
    const mgrA = await mkUser("QAMgrA", "Admin", { payrollAccess: "manage" });
    const mgrB = await mkUser("QAMgrB", "Admin", { payrollAccess: "manage" });
    await mkUser("QAAdminC", "Admin");
    const staffU = await mkUser("QAStaffU", "Volunteer", { staffPortalOnly: true });

    const mkStaff = async (first: string, basic: string, pay: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => {
      const s = await prisma.staffMember.create({ data: { churchId, firstName: first, lastName: "QA", staffNo: `QA-${first}-${Date.now()}`, departmentId: dept.id, startDate: new Date("2020-01-01"), ...extra } });
      made.staff.push(s.id);
      await prisma.staffPayProfile.create({ data: { staffId: s.id, churchId, basicSalary: basic, payoutMethod: "momo", momoNetwork: "MTN", momoNoLast4: "4821", ...pay } });
      return s;
    };
    const pastor = await mkStaff("Pastor", "6000", { isClergy: true, payeApplies: false });
    const admin = await mkStaff("Administrator", "3000", {}, { userId: staffU.id });
    const cleaner = await mkStaff("Cleaner", "450");
    await prisma.staffPayItem.createMany({ data: [
      { churchId, staffId: admin.id, kind: "earning", code: "housing", label: "Housing", amount: "500", taxable: true },
      { churchId, staffId: admin.id, kind: "earning", code: "transport", label: "Transport", amount: "300", taxable: true },
      { churchId, staffId: admin.id, kind: "deduction", code: "welfare", label: "Welfare", amount: "20" },
    ] });
    const loan = await prisma.$transaction((tx) => E.createLoan(tx, { churchId, staffId: admin.id, kind: "loan", label: "QA loan", principal: "1000", installment: "200", startPeriod: "2026-11", accountId: acc.id, postExpense: false, actor: { id: owner.id, name: owner.name } }));

    const A = { id: mgrA.id, name: mgrA.name };
    const B = { id: mgrB.id, name: mgrB.name };

    // 1. createRun builds 3 lines that match calc; a second regular run for the month fails.
    const run = await prisma.$transaction((tx) => E.createRun(tx, { churchId, year: YEAR, month: MONTH, kind: "regular", actor: A }), { timeout: 60_000 });
    const lines = await prisma.payrollLine.findMany({ where: { runId: run.id } });
    eq("3 lines", lines.length, 3);
    const adminLine = lines.find((l) => l.staffId === admin.id)!;
    const rules = rulesFromJson(run.rules);
    const expect = computeLine({ basic: "3000", items: [
      { kind: "earning", code: "housing", label: "Housing", amount: "500" },
      { kind: "earning", code: "transport", label: "Transport", amount: "300" },
      { kind: "deduction", code: "welfare", label: "Welfare", amount: "20" },
      { kind: "deduction", code: "loan", label: "Loan", amount: "200", loanBalance: "1000", loanId: loan.id },
    ], workingDays: adminLine.workingDays, ssnitApplies: true, tier2Applies: true, payeApplies: true }, rules);
    eq("admin net matches calc", adminLine.net.toString(), fromP(expect.netP));
    eq("admin net is the worked example", fromP(toP(adminLine.net.toString())), "2888.12");
    eq("pastor PAYE off", n(lines.find((l) => l.staffId === pastor.id)!.paye), 0);
    eq("cleaner PAYE 0", n(lines.find((l) => l.staffId === cleaner.id)!.paye), 0);
    await throws("second regular run for the month", () => prisma.$transaction((tx) => E.createRun(tx, { churchId, year: YEAR, month: MONTH, kind: "regular", actor: A })));

    // 2. Approved unpaid leave of 2 days for the cleaner, then refresh.
    const unpaid = await prisma.leaveType.create({ data: { churchId, name: `QA Unpaid ${Date.now()}`, paid: false, daysPerYear: "0" } });
    made.leaveTypes.push(unpaid.id);
    await prisma.leaveRequest.create({ data: { churchId, staffId: cleaner.id, leaveTypeId: unpaid.id, startDate: new Date("2026-11-16"), endDate: new Date("2026-11-17"), days: "2", status: "approved" } });
    eq("leave clip", unpaidDaysInMonth({ startDate: "2026-11-16", endDate: "2026-11-17" }, YEAR, MONTH), 2);
    let r = await prisma.payrollRun.findUniqueOrThrow({ where: { id: run.id } });
    await prisma.$transaction((tx) => E.refreshRun(tx, { churchId, runId: run.id, actor: A, version: r.version }), { timeout: 60_000 });
    const cl = await prisma.payrollLine.findFirstOrThrow({ where: { runId: run.id, staffId: cleaner.id }, include: { items: true } });
    eq("cleaner unpaid days", n(cl.unpaidDays), 2);
    ok("cleaner leave item", cl.items.some((i) => i.code === "unpaid_leave"));

    // 3. mgrA submits; mgrA cannot approve; a stale version is refused; mgrB approves.
    r = await prisma.payrollRun.findUniqueOrThrow({ where: { id: run.id } });
    await prisma.$transaction((tx) => E.submitRun(tx, { churchId, runId: run.id, version: r.version, actor: A }));
    r = await prisma.payrollRun.findUniqueOrThrow({ where: { id: run.id } });
    eq("status review", r.status, "review");
    await throws("maker cannot approve", () => prisma.$transaction((tx) => E.approveRun(tx, { churchId, runId: run.id, version: r.version, actor: A })));
    await throws("stale version refused", () => prisma.$transaction((tx) => E.approveRun(tx, { churchId, runId: run.id, version: r.version - 1, actor: B })));
    await prisma.$transaction((tx) => E.approveRun(tx, { churchId, runId: run.id, version: r.version, actor: B }));
    r = await prisma.payrollRun.findUniqueOrThrow({ where: { id: run.id } });
    eq("approved, not self-approved", [r.status, r.selfApproved], ["approved", false]);

    // 4. markPaid.
    const expBefore = await prisma.expense.aggregate({ where: { churchId, accountId: acc.id }, _sum: { amount: true } });
    await prisma.$transaction((tx) => E.markPaid(tx, { churchId, runId: run.id, version: r.version, actor: B, accountId: acc.id, payDate: new Date("2026-11-27T12:00:00Z") }), { timeout: 60_000 });
    const runExp = await prisma.expense.findMany({ where: { payrollRunId: run.id } });
    r = await prisma.payrollRun.findUniqueOrThrow({ where: { id: run.id } });
    eq("one net-pay expense", runExp.length, 1);
    eq("expense = net", toP(runExp[0].amount), toP(r.net.toString()));
    eq("vendor is Payroll", runExp[0].vendor, "Payroll");
    ok("no staff name in the expense", !/Administrator|Pastor|Cleaner/.test(runExp[0].description));
    const postings = await prisma.payrollPosting.findMany({ where: { runId: run.id } });
    ok("2 or 3 pending postings", [2, 3].includes(postings.filter((p) => p.status === "pending").length));
    eq("loan balance 800", n((await prisma.staffLoan.findUniqueOrThrow({ where: { id: loan.id } })).balance), 800);
    const expAfter = await prisma.expense.aggregate({ where: { churchId, accountId: acc.id }, _sum: { amount: true } });
    eq("account spending up by net", toP(expAfter._sum.amount ?? 0) - toP(expBefore._sum.amount ?? 0), toP(r.net.toString()));
    await throws("markPaid twice", () => prisma.$transaction((tx) => E.markPaid(tx, { churchId, runId: run.id, version: r.version, actor: B, accountId: acc.id, payDate: new Date() })));
    ok("payroll expense is locked", isPayrollLocked(runExp[0]));

    // 5. markRemitted SSNIT and PAYE; then the invariant.
    for (const p of postings.filter((x) => x.status === "pending")) {
      await prisma.$transaction((tx) => E.markRemitted(tx, { churchId, postingId: p.id, actor: B, accountId: acc.id, date: new Date("2026-12-10T12:00:00Z"), reference: "QA" }));
    }
    const allExp = await prisma.expense.aggregate({ where: { payrollRunId: run.id }, _sum: { amount: true } });
    const paidLines = await prisma.payrollLine.findMany({ where: { runId: run.id, excluded: false }, include: { items: true } });
    const employerCost = paidLines.reduce((t, l) => t + toP(l.employerCost.toString()), 0);
    const retained = paidLines.reduce((t, l) => t + l.items.filter((i) => i.kind === "deduction" && !i.preTax && !i.remitted).reduce((s, i) => s + toP(i.amount.toString()), 0), 0);
    eq("expenses = employer cost - retained", toP(allExp._sum.amount ?? 0), employerCost - retained);

    // 6. YTD for the administrator equals the November line.
    const ytd = await E.ytdFor(prisma, churchId, admin.id, YEAR, MONTH);
    eq("YTD net", ytd.netP, toP(paidLines.find((l) => l.staffId === admin.id)!.net.toString()));

    // 7. Reverse "never paid".
    r = await prisma.payrollRun.findUniqueOrThrow({ where: { id: run.id } });
    await prisma.$transaction((tx) => E.reverseRun(tx, { churchId, runId: run.id, version: r.version, actor: A, mode: "never_paid", reason: "QA test" }), { timeout: 60_000 });
    // Same call shape as loadRows in src/lib/data/ledger.ts.
    const ledgerExp = await prisma.expense.findMany({ where: { churchId, payrollRunId: run.id }, select: { id: true } });
    eq("ledger shows no payroll expenses", ledgerExp.length, 0);
    eq("loan back to 1000", n((await prisma.staffLoan.findUniqueOrThrow({ where: { id: loan.id } })).balance), 1000);
    r = await prisma.payrollRun.findUniqueOrThrow({ where: { id: run.id } });
    eq("regularKey cleared", r.regularKey, null);
    const actions = (await prisma.payrollEvent.findMany({ where: { runId: run.id }, select: { action: true } })).map((e) => e.action);
    for (const a of ["run.created", "run.submitted", "run.approved", "run.paid", "posting.remitted", "run.reversed"]) ok(`event ${a}`, actions.includes(a));

    // 8. A second run, paid, then reversed as "the money came back".
    const run2 = await prisma.$transaction((tx) => E.createRun(tx, { churchId, year: YEAR, month: MONTH, kind: "regular", actor: A }), { timeout: 60_000 });
    let r2 = await prisma.payrollRun.findUniqueOrThrow({ where: { id: run2.id } });
    await prisma.$transaction((tx) => E.submitRun(tx, { churchId, runId: run2.id, version: r2.version, actor: A }));
    r2 = await prisma.payrollRun.findUniqueOrThrow({ where: { id: run2.id } });
    await prisma.$transaction((tx) => E.approveRun(tx, { churchId, runId: run2.id, version: r2.version, actor: B }));
    r2 = await prisma.payrollRun.findUniqueOrThrow({ where: { id: run2.id } });
    await prisma.$transaction((tx) => E.markPaid(tx, { churchId, runId: run2.id, version: r2.version, actor: B, accountId: acc.id, payDate: new Date() }), { timeout: 60_000 });
    r2 = await prisma.payrollRun.findUniqueOrThrow({ where: { id: run2.id } });
    await prisma.$transaction((tx) => E.reverseRun(tx, { churchId, runId: run2.id, version: r2.version, actor: A, mode: "returned", reason: "QA returned" }), { timeout: 60_000 });
    const out2 = await prisma.expense.aggregate({ where: { payrollRunId: run2.id }, _sum: { amount: true } });
    const in2 = await prisma.transaction.aggregate({ where: { payrollRunId: run2.id }, _sum: { amount: true } });
    eq("came back: net ledger effect 0", toP(out2._sum.amount ?? 0) - toP(in2._sum.amount?.toString() ?? "0"), 0);
    ok("corrections carry payrollRunId", (await prisma.transaction.count({ where: { payrollRunId: run2.id } })) > 0);

    // 9. Self-approval only with one manager: remove mgrB's access.
    await prisma.user.update({ where: { id: mgrB.id }, data: { payrollAccess: null } });
    await prisma.user.update({ where: { id: owner.id }, data: { role: "Admin" } }); // leave mgrA as the only manager
    const run3 = await prisma.$transaction((tx) => E.createRun(tx, { churchId, year: YEAR, month: 12, kind: "regular", actor: A }), { timeout: 60_000 });
    let r3 = await prisma.payrollRun.findUniqueOrThrow({ where: { id: run3.id } });
    await prisma.$transaction((tx) => E.submitRun(tx, { churchId, runId: run3.id, version: r3.version, actor: A }));
    r3 = await prisma.payrollRun.findUniqueOrThrow({ where: { id: run3.id } });
    const self = await prisma.$transaction((tx) => E.approveRun(tx, { churchId, runId: run3.id, version: r3.version, actor: A }));
    eq("lone manager self-approves", self.selfApproved, true);

    // 10. Secrets: seal then reveal round-trips, and the column never holds the plain number.
    const { sealId, revealId } = await import("../../src/lib/payroll/secrets");
    const sealed = sealId("GHA-123456789-0");
    await prisma.staffPayProfile.update({ where: { staffId: admin.id }, data: { ghanaCardSealed: sealed.sealed, ghanaCardLast4: sealed.last4 } });
    const stored = await prisma.staffPayProfile.findUniqueOrThrow({ where: { staffId: admin.id } });
    ok("sealed column has no plain text", !stored.ghanaCardSealed!.includes("123456789"));
    eq("reveal round-trips", revealId(stored.ghanaCardSealed), "GHA-123456789-0");

    // 11. SMS text has no amount by default; PDF renders.
    ok("SMS has no amount", !/GHS|\d+\.\d{2}/.test(payslipSmsText("ZZ QA", "November 2026")));
    const { renderPayslip } = await import("../../src/lib/payroll/payslip-pdf");
    const pdf = await renderPayslip({
      church: { name: "ZZ QA" }, period: "November 2026", title: "November 2026 payroll", staff: { name: "Administrator QA" },
      earnings: [{ label: "Basic salary", amount: 3000 }], deductions: [{ label: "PAYE income tax", amount: 526.88 }], gross: 3800, totalDeductions: 911.88, net: 2888.12, employer: [],
    });
    ok("PDF header", Buffer.from(pdf.slice(0, 4)).toString() === "%PDF");
    ok("PDF over 2KB", pdf.length > 2048);
  } finally {
    // ── Cleanup ──
    if (churchId) {
      if (ownChurch) {
        await prisma.church.delete({ where: { id: churchId } }).catch((e) => console.error("cleanup church", e));
      } else {
        await prisma.expense.deleteMany({ where: { churchId, OR: [{ payrollRun: { churchId } }, { staffLoan: { staffId: { in: made.staff } } }] } }).catch(() => {});
        await prisma.transaction.deleteMany({ where: { churchId, payrollRun: { churchId } } }).catch(() => {});
        await prisma.payrollRun.deleteMany({ where: { churchId, createdAt: { gte: started } } }).catch(() => {});
        await prisma.staffMember.deleteMany({ where: { id: { in: made.staff } } }).catch(() => {});
        await prisma.leaveType.deleteMany({ where: { id: { in: made.leaveTypes } } }).catch(() => {});
        await prisma.payrollEvent.deleteMany({ where: { churchId, createdAt: { gte: started } } }).catch(() => {});
        if (made.settings) await prisma.payrollSettings.deleteMany({ where: { churchId } }).catch(() => {});
        await prisma.user.deleteMany({ where: { id: { in: made.users } } }).catch(() => {});
        await prisma.department.deleteMany({ where: { id: { in: made.departments } } }).catch(() => {});
        await prisma.churchAccount.deleteMany({ where: { id: { in: made.accounts } } }).catch(() => {});
      }
      const left = await Promise.all([
        prisma.staffMember.count({ where: { id: { in: made.staff } } }),
        prisma.payrollRun.count({ where: { churchId, createdAt: { gte: started } } }),
        prisma.payrollEvent.count({ where: { churchId, createdAt: { gte: started } } }),
        prisma.user.count({ where: { id: { in: made.users } } }),
        ownChurch ? prisma.church.count({ where: { id: churchId } }) : Promise.resolve(0),
      ]);
      eq("nothing left behind", left, [0, 0, 0, 0, 0]);
    }
    await prisma.$disconnect();
  }
  console.log(`\npayroll db: ${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
