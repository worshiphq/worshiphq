/**
 * Staff & Payroll: payslip PDF smoke test. No database.
 *   npx tsx scripts/qa/test-payroll-pdf.ts
 */
import { writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { renderPayslip, renderPayslipsZip, type PayslipData } from "../../src/lib/payroll/payslip-pdf";

const data: PayslipData = {
  church: { name: "Grace Chapel International, Accra", address: "12 Ring Road, Accra", employerSsnitNo: "E1234567", employerTin: "C0001234567" },
  period: "November 2026", title: "November 2026 payroll", payDate: "27 November 2026",
  staff: { name: "Ama Mensah", staffNo: "ST-002", jobTitle: "Church administrator", department: "Office", payoutLabel: "MTN MoMo ending 4821", ssnitMasked: "GHA-•••••••89-0", tinMasked: "TIN ••••5678" },
  earnings: [{ label: "Basic salary", amount: 3000 }, { label: "Housing", amount: 500 }, { label: "Transport", amount: 300 }],
  deductions: [{ label: "SSNIT (employee 5.5%)", amount: 165 }, { label: "PAYE income tax", amount: 526.88 }, { label: "Welfare", amount: 20 }, { label: "School fees loan (L-0001)", amount: 200 }],
  gross: 3800, totalDeductions: 911.88, net: 2888.12, employer: [{ label: "Employer SSNIT", amount: 390 }],
  ytd: { gross: 41800, ssnit: 1815, paye: 5795.68, net: 31769.32 }, workingDays: 21, unpaidDays: 0, note: "Thank you for serving with us.",
};

async function main() {
  let fail = 0;
  const pdf = await renderPayslip(data);
  if (Buffer.from(pdf.slice(0, 4)).toString() !== "%PDF") { fail++; console.error("FAIL header"); }
  if (pdf.length < 2048) { fail++; console.error("FAIL size"); }
  const doc = await PDFDocument.load(pdf);
  if (doc.getPageCount() !== 1) { fail++; console.error("FAIL pages"); }
  const reversed = await renderPayslip({ ...data, reversed: true });
  if (reversed.length <= 0) { fail++; console.error("FAIL reversed"); }
  const zip = await renderPayslipsZip([{ fileName: "a.pdf", data }, { fileName: "b.pdf", data }]);
  if (Buffer.from(zip.slice(0, 2)).toString() !== "PK") { fail++; console.error("FAIL zip"); }
  if (process.argv[2]) writeFileSync(process.argv[2], pdf);
  console.log(`payroll pdf: ${fail ? "FAILED" : "passed"} (${pdf.length} bytes)`);
  if (fail) process.exit(1);
}
main();
