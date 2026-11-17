import "server-only";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { FONT_REGULAR_B64, FONT_SEMIBOLD_B64, FONT_BOLD_B64 } from "@/lib/receipts/assets.generated";
import { longDate } from "@/lib/levies/periods";
import type { StatementData } from "@/lib/levies/exports";

const col = (r: number, g: number, b: number) => rgb(r / 255, g / 255, b / 255);
const C = { ink: col(25, 37, 47), muted: col(91, 103, 112), faint: col(138, 148, 155), line: col(223, 228, 230), tint: col(243, 246, 246), teal: col(1, 154, 159), tealBg: col(232, 246, 246), red: col(180, 35, 24) };
const W = 595.28, H = 841.89, M = 44;
const b64 = (s: string) => Uint8Array.from(Buffer.from(s, "base64"));
const money = (n: number) => `GH₵${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Split text into lines that fit a width. */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
      else { out.push(line); line = word; }
    }
    out.push(line);
  }
  return out;
}

/** The remittance statement a treasurer hands to head office: every period, how it was worked out, what was paid and what is left. */
export async function renderStatementPdf(data: StatementData, logo: { buffer: Buffer } | null): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const r = await doc.embedFont(b64(FONT_REGULAR_B64), { subset: true });
  const s = await doc.embedFont(b64(FONT_SEMIBOLD_B64), { subset: true });
  const b = await doc.embedFont(b64(FONT_BOLD_B64), { subset: true });
  const logoImg = logo ? await doc.embedPng(logo.buffer).catch(() => null) : null;
  doc.setTitle(`Remittance statement ${data.rangeLabel}`);
  doc.setCreator("WorshipHQ");

  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;
  const text = (t: string, x: number, yy: number, font: PDFFont, size: number, color = C.ink) => page.drawText(t, { x, y: yy, font, size, color });
  const right = (t: string, xr: number, yy: number, font: PDFFont, size: number, color = C.ink) => text(t, xr - font.widthOfTextAtSize(t, size), yy, font, size, color);
  const need = (h: number) => {
    if (y - h < M + 40) {
      page = doc.addPage([W, H]);
      y = H - M;
      text(`${data.churchName}, remittance statement, ${data.rangeLabel} (continued)`, M, y, r, 8.5, C.faint);
      y -= 22;
    }
  };

  // Header band
  page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: C.teal });
  let tx = M;
  if (logoImg) {
    const h = 46, w = (logoImg.width / logoImg.height) * h;
    page.drawImage(logoImg, { x: M, y: y - h + 6, width: Math.min(w, 120), height: h });
    tx = M + Math.min(w, 120) + 14;
  }
  text(data.churchName, tx, y - 10, b, 16);
  text(`Remittance statement${data.payee ? ` to ${data.payee}` : ""}`, tx, y - 30, s, 11.5, C.teal);
  text(data.rangeLabel, tx, y - 46, r, 10, C.muted);
  y -= 74;

  // Totals band
  page.drawRectangle({ x: M, y: y - 44, width: W - 2 * M, height: 50, color: C.tealBg });
  const third = (W - 2 * M) / 3;
  [["Due", data.totals.due], ["Paid", data.totals.paid], ["Still to pay", data.totals.left]].forEach(([l, v], i) => {
    text(String(l), M + 14 + i * third, y - 12, r, 8.5, C.muted);
    text(money(Number(v)), M + 14 + i * third, y - 32, b, 14, i === 2 && Number(v) > 0 ? C.red : C.ink);
  });
  y -= 66;

  if (!data.groups.length) {
    text("No levy periods in these months.", M, y, r, 10, C.muted);
    y -= 20;
  }

  const xDue = W - M - 150, xPaid = W - M - 75, xLeft = W - M;
  for (const g of data.groups) {
    need(60);
    text(g.ruleName, M, y, b, 12);
    text(`Paid to ${g.payee}`, M, y - 14, r, 9, C.muted);
    y -= 32;
    page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: 18, color: C.tint });
    text("Period and how it was worked out", M + 6, y + 1, s, 8.5, C.muted);
    right("Due", xDue, y + 1, s, 8.5, C.muted);
    right("Paid", xPaid, y + 1, s, 8.5, C.muted);
    right("Left", xLeft - 6, y + 1, s, 8.5, C.muted);
    y -= 20;
    for (const p of g.periods) {
      const lines = p.lines.flatMap((l) => wrap(l, r, 8.5, xDue - M - 70));
      const payLines = p.payments.map((x) => `Paid ${money(x.amount)} on ${longDate(x.date)} by ${x.method}${x.reference ? `, ref ${x.reference}` : ""}`);
      need(18 + lines.length * 11 + payLines.length * 11);
      text(p.label, M + 6, y, s, 10);
      text(p.status, M + 6 + s.widthOfTextAtSize(p.label, 10) + 8, y, r, 8.5, p.status.startsWith("Overdue") || p.status.includes("overdue") ? C.red : C.faint);
      right(money(p.due), xDue, y, r, 9.5);
      right(money(p.paid), xPaid, y, r, 9.5);
      right(money(p.left), xLeft - 6, y, s, 9.5, p.left > 0 ? C.red : C.ink);
      y -= 13;
      for (const l of lines) { text(l, M + 14, y, r, 8.5, C.muted); y -= 11; }
      for (const l of payLines) { text(l, M + 14, y, r, 8.5, C.teal); y -= 11; }
      page.drawLine({ start: { x: M, y: y + 3 }, end: { x: W - M, y: y + 3 }, thickness: 0.5, color: C.line });
      y -= 8;
    }
    need(20);
    text(`Total for ${g.ruleName}`, M + 6, y, s, 9.5);
    right(money(g.due), xDue, y, s, 9.5);
    right(money(g.paid), xPaid, y, s, 9.5);
    right(money(g.left), xLeft - 6, y, b, 9.5, g.left > 0 ? C.red : C.ink);
    y -= 28;
  }

  // Signatures
  need(90);
  y -= 30;
  const sw = (W - 2 * M - 40) / 2;
  for (const [i, label] of ["Treasurer", "Pastor"].entries()) {
    const x = M + i * (sw + 40);
    page.drawLine({ start: { x, y }, end: { x: x + sw, y }, thickness: 0.8, color: C.muted });
    text(label, x, y - 13, s, 9, C.muted);
    text("Name, signature and date", x, y - 25, r, 8, C.faint);
  }

  // Footer on every page
  const pages = doc.getPages();
  pages.forEach((pg, i) => {
    pg.drawText(`Prepared with WorshipHQ on ${longDate(data.preparedOn)}`, { x: M, y: 24, size: 8, font: r, color: C.faint });
    const t = `Page ${i + 1} of ${pages.length}`;
    pg.drawText(t, { x: W - M - r.widthOfTextAtSize(t, 8), y: 24, size: 8, font: r, color: C.faint });
  });
  return doc.save();
}
