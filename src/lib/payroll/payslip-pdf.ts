/**
 * Staff & Payroll: the payslip PDF (A4), with the church's own logo. pdf-lib + fontkit and the receipt fonts.
 * No database: the caller passes everything to print.
 */
import { PDFDocument, rgb, degrees, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { FONT_REGULAR_B64, FONT_SEMIBOLD_B64, FONT_BOLD_B64 } from "@/lib/receipts/assets.generated";

export interface PayslipData {
  church: { name: string; address?: string | null; logo?: { bytes: Buffer; type: string } | null; employerSsnitNo?: string | null; employerTin?: string | null };
  period: string;
  title: string;
  payDate?: string | null;
  staff: { name: string; staffNo?: string | null; jobTitle?: string | null; department?: string | null; payoutLabel?: string | null; ssnitMasked?: string | null; tinMasked?: string | null };
  earnings: { label: string; amount: number }[];
  deductions: { label: string; amount: number }[];
  gross: number;
  totalDeductions: number;
  net: number;
  employer: { label: string; amount: number }[];
  ytd?: { gross: number; ssnit: number; paye: number; net: number } | null;
  workingDays?: number;
  unpaidDays?: number;
  note?: string | null;
  reversed?: boolean;
}

const col = (r: number, g: number, b: number) => rgb(r / 255, g / 255, b / 255);
const C = {
  ink: col(25, 37, 47), muted: col(91, 103, 112), faint: col(138, 148, 155), line: col(223, 228, 230), tint: col(243, 246, 246),
  teal: col(13, 115, 119), tealBright: col(13, 148, 136), tealBg: col(232, 246, 246), white: col(255, 255, 255), red: col(180, 35, 24),
};
const b64 = (s: string) => Uint8Array.from(Buffer.from(s, "base64"));

export function fmtMoney(n: number): string {
  const neg = n < 0;
  const [w, f] = Math.abs(Math.round(n * 100) / 100).toFixed(2).split(".");
  return `${neg ? "-" : ""}GHS ${w.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${f}`;
}

async function embedLogo(doc: PDFDocument, logo: PayslipData["church"]["logo"]): Promise<PDFImage | null> {
  if (!logo) return null;
  try {
    if (logo.type === "image/png") return await doc.embedPng(logo.bytes);
    if (logo.type === "image/jpeg") return await doc.embedJpg(logo.bytes);
    // pdf-lib only embeds PNG and JPEG: WebP and GIF go through sharp.
    const sharp = (await import("sharp")).default;
    const png = await sharp(logo.bytes).png().toBuffer();
    return await doc.embedPng(png);
  } catch {
    return null;
  }
}

export async function renderPayslip(d: PayslipData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`Payslip ${d.period} ${d.staff.name}`);
  doc.setCreator("WorshipHQ");
  const F = {
    r: await doc.embedFont(b64(FONT_REGULAR_B64), { subset: true }),
    s: await doc.embedFont(b64(FONT_SEMIBOLD_B64), { subset: true }),
    b: await doc.embedFont(b64(FONT_BOLD_B64), { subset: true }),
  };
  const logo = await embedLogo(doc, d.church.logo);
  const W = 595.28, H = 841.89, M = 44;
  const page = doc.addPage([W, H]);
  const Y = (top: number) => H - top;
  const width = (t: string, f: PDFFont, size: number) => f.widthOfTextAtSize(t, size);
  const text = (p: PDFPage, t: string, x: number, top: number, size: number, f: PDFFont, color = C.ink, align: "left" | "right" = "left") => {
    const safe = t.replace(/[^\x20-\x7E -ɏ•]/g, "");
    p.drawText(safe, { x: align === "right" ? x - width(safe, f, size) : x, y: Y(top), size, font: f, color });
  };
  const fit = (t: string, f: PDFFont, size: number, max: number) => {
    if (width(t, f, size) <= max) return t;
    let s = t;
    while (s.length > 1 && width(`${s}...`, f, size) > max) s = s.slice(0, -1);
    return `${s}...`;
  };

  // Top bar.
  page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: C.teal });

  // Header: logo + church, PAYSLIP + period.
  let top = 34;
  let textX = M;
  if (logo) {
    const h = 46;
    const w = Math.min(120, (logo.width / logo.height) * h);
    page.drawImage(logo, { x: M, y: Y(top + h), width: w, height: h });
    textX = M + w + 12;
  }
  text(page, fit(d.church.name, F.b, 15, 290), textX, top + 18, 15, F.b);
  if (d.church.address) text(page, fit(d.church.address, F.r, 9, 290), textX, top + 33, 9, F.r, C.muted);
  const ids = [d.church.employerSsnitNo ? `Employer SSNIT ${d.church.employerSsnitNo}` : "", d.church.employerTin ? `TIN ${d.church.employerTin}` : ""].filter(Boolean).join("   ");
  if (ids) text(page, fit(ids, F.r, 8, 290), textX, top + 46, 8, F.r, C.faint);
  text(page, "PAYSLIP", W - M, top + 16, 20, F.b, C.teal, "right");
  text(page, d.period, W - M, top + 32, 11, F.s, C.ink, "right");
  if (d.payDate) text(page, `Paid ${d.payDate}`, W - M, top + 46, 8.5, F.r, C.muted, "right");

  top = 104;
  page.drawLine({ start: { x: M, y: Y(top) }, end: { x: W - M, y: Y(top) }, thickness: 0.8, color: C.line });

  // Staff box.
  top += 14;
  const boxH = 64;
  page.drawRectangle({ x: M, y: Y(top + boxH), width: W - 2 * M, height: boxH, color: C.tint });
  const colW = (W - 2 * M) / 3;
  const cell = (i: number, row: number, label: string, value: string) => {
    const x = M + 12 + i * colW;
    const t = top + 14 + row * 28;
    text(page, label.toUpperCase(), x, t, 6.8, F.s, C.faint);
    text(page, fit(value || "-", F.s, 9.5, colW - 18), x, t + 12, 9.5, F.s);
  };
  cell(0, 0, "Name", d.staff.name);
  cell(1, 0, "Staff number", d.staff.staffNo ?? "-");
  cell(2, 0, "Job title", d.staff.jobTitle ?? "-");
  cell(0, 1, "Department", d.staff.department ?? "-");
  cell(1, 1, "Paid to", d.staff.payoutLabel ?? "-");
  cell(2, 1, "SSNIT / TIN", [d.staff.ssnitMasked, d.staff.tinMasked].filter(Boolean).join("  ") || "-");
  top += boxH + 22;

  // Two columns: earnings and deductions.
  const gap = 18;
  const halfW = (W - 2 * M - gap) / 2;
  const table = (x: number, title: string, rows: { label: string; amount: number }[], totalLabel: string, total: number) => {
    let t = top;
    page.drawRectangle({ x, y: Y(t + 22), width: halfW, height: 22, color: C.tealBg });
    text(page, title, x + 10, t + 15, 9, F.b, C.teal);
    text(page, "GHS", x + halfW - 10, t + 15, 8, F.s, C.teal, "right");
    t += 22;
    for (const r of rows) {
      t += 19;
      text(page, fit(r.label, F.r, 9, halfW - 110), x + 10, t - 5, 9, F.r);
      text(page, fmtMoney(r.amount).replace("GHS ", ""), x + halfW - 10, t - 5, 9, F.r, r.amount < 0 ? C.red : C.ink, "right");
      page.drawLine({ start: { x: x + 10, y: Y(t + 2) }, end: { x: x + halfW - 10, y: Y(t + 2) }, thickness: 0.4, color: C.line });
    }
    if (!rows.length) { t += 19; text(page, "None", x + 10, t - 5, 9, F.r, C.faint); }
    t += 24;
    text(page, totalLabel, x + 10, t - 6, 9.5, F.b);
    text(page, fmtMoney(total).replace("GHS ", ""), x + halfW - 10, t - 6, 9.5, F.b, C.ink, "right");
    return t;
  };
  const endL = table(M, "EARNINGS", d.earnings, "Gross pay", d.gross);
  const endR = table(M + halfW + gap, "DEDUCTIONS", d.deductions, "Total deductions", d.totalDeductions);
  top = Math.max(endL, endR) + 18;

  // Net pay band.
  const bandH = 50;
  page.drawRectangle({ x: M, y: Y(top + bandH), width: W - 2 * M, height: bandH, color: C.teal });
  text(page, "NET PAY", M + 16, top + 22, 9, F.s, C.white);
  text(page, d.staff.payoutLabel ? `To ${d.staff.payoutLabel}` : "", M + 16, top + 37, 8.5, F.r, C.white);
  text(page, fmtMoney(d.net), W - M - 16, top + 32, 20, F.b, C.white, "right");
  top += bandH + 20;

  // Days and employer contributions.
  if (d.workingDays) {
    text(page, `Working days ${d.workingDays}${d.unpaidDays ? `, unpaid days ${d.unpaidDays}` : ""}`, M, top, 8.5, F.r, C.muted);
    top += 14;
  }
  if (d.employer.length) {
    text(page, "Paid by the church on top of your pay (not deducted): " + d.employer.map((e) => `${e.label} ${fmtMoney(e.amount)}`).join(", "), M, top, 8.5, F.r, C.muted);
    top += 20;
  }

  // Year to date.
  if (d.ytd) {
    top += 4;
    page.drawLine({ start: { x: M, y: Y(top) }, end: { x: W - M, y: Y(top) }, thickness: 0.8, color: C.line });
    top += 16;
    text(page, "YEAR TO DATE", M, top, 7.5, F.s, C.faint);
    const items: [string, number][] = [["Gross", d.ytd.gross], ["SSNIT", d.ytd.ssnit], ["PAYE", d.ytd.paye], ["Net", d.ytd.net]];
    const qw = (W - 2 * M) / 4;
    items.forEach(([l, v], i) => {
      text(page, l, M + i * qw, top + 16, 8.5, F.r, C.muted);
      text(page, fmtMoney(v), M + i * qw, top + 30, 10.5, F.s);
    });
    top += 44;
  }

  if (d.note) {
    const words = d.note.split(/\s+/);
    let line = "";
    top += 6;
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (width(next, F.r, 8.5) > W - 2 * M) { text(page, line, M, top, 8.5, F.r, C.muted); top += 12; line = w; }
      else line = next;
    }
    if (line) { text(page, line, M, top, 8.5, F.r, C.muted); top += 12; }
  }

  // Footer.
  page.drawLine({ start: { x: M, y: 54 }, end: { x: W - M, y: 54 }, thickness: 0.6, color: C.line });
  text(page, "This payslip is private. Questions about it go to the church office.", M, H - 40, 7.5, F.r, C.faint);
  text(page, `${d.title} - Made with WorshipHQ`, W - M, H - 40, 7.5, F.r, C.faint, "right");

  if (d.reversed) {
    page.drawText("REVERSED", { x: 120, y: 300, size: 96, font: F.b, color: C.red, opacity: 0.14, rotate: degrees(35) });
  }
  return doc.save();
}

/** Every payslip of a run in one zip. */
export async function renderPayslipsZip(slips: { fileName: string; data: PayslipData }[]): Promise<Uint8Array> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const s of slips) zip.file(s.fileName, await renderPayslip(s.data));
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
