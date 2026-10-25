import "server-only";
import ExcelJS from "exceljs";

/**
 * One place that turns a table into a report-quality Excel sheet, so every
 * export in the app looks the same: church name and report title on top, the
 * period and who made it, a coloured header, banded rows, borders, proper
 * number and date formats, frozen header, filters, and print settings.
 */

export interface SheetSpec {
  /** Tab name (Excel caps this at 31 characters). */
  name: string;
  /** Big title at the top of the sheet, e.g. "Members register". */
  title: string;
  /** Smaller line under the title: period, filters, counts. */
  subtitle?: string;
  headers: string[];
  /** A blank row marks the start of a footer (totals) block, which is styled as totals. */
  rows: unknown[][];
}

export interface LogoImage { buffer: Buffer; width: number; height: number }

function isOurStorage(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    const ours = [process.env.R2_PUBLIC_URL, process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL]
      .filter(Boolean)
      .map((u) => { try { return new URL(String(u)).hostname; } catch { return ""; } });
    return url.startsWith("https://") && ours.includes(host);
  } catch {
    return false;
  }
}

/** PNG, JPEG, GIF or WebP, judged by the file's own first bytes rather than its name. */
function isRaster(b: Buffer): boolean {
  const hex = b.subarray(0, 4).toString("hex");
  return hex === "89504e47" || hex.startsWith("ffd8ff") || hex.startsWith("47494638")
    || (b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP");
}

/** Fetch the church logo (data URL or our own storage) and shrink it to a small PNG. Null if anything fails. */
export async function loadLogo(logoUrl?: string | null): Promise<LogoImage | null> {
  if (!logoUrl) return null;
  try {
    let raw: Buffer;
    if (logoUrl.startsWith("data:")) {
      raw = Buffer.from(logoUrl.slice(logoUrl.indexOf(",") + 1), "base64");
    } else if (isOurStorage(logoUrl)) {
      // Only our own image storage is fetched: a logo address can't make the server call anywhere else.
      const res = await fetch(logoUrl, { signal: AbortSignal.timeout(4000), redirect: "error" });
      if (!res.ok) return null;
      raw = Buffer.from(await res.arrayBuffer());
    } else return null;
    // Only plain raster images are decoded (never SVG or other formats), and never a huge one.
    if (raw.length > 5_000_000 || !isRaster(raw)) return null;
    const sharp = (await import("sharp")).default;
    const out = await sharp(raw, { limitInputPixels: 16_000_000 }).resize({ width: 320, height: 320, fit: "inside" }).png().toBuffer({ resolveWithObject: true });
    return { buffer: out.data, width: out.info.width, height: out.info.height };
  } catch {
    return null;
  }
}

export interface WorkbookSpec {
  churchName: string;
  /** The church logo, shown at the left of the title block. */
  logo?: LogoImage | null;
  /** Church brand colour (#rrggbb). Falls back to the WorshipHQ teal. */
  color?: string | null;
  /** Shown in the footer line, e.g. the signed-in user. */
  preparedBy?: string;
  sheets: SheetSpec[];
  /** Add a first "Contents" sheet listing every sheet (useful for bundles). */
  contents?: boolean;
}

const FALLBACK = "0D7377";

function hex(color?: string | null): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((color ?? "").trim());
  return (m ? m[1] : FALLBACK).toUpperCase();
}

/** Black or white text, whichever reads better on `bg`. */
function textOn(bg: string): string {
  const r = parseInt(bg.slice(0, 2), 16), g = parseInt(bg.slice(2, 4), 16), b = parseInt(bg.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? "FF1C1A16" : "FFFFFFFF";
}

/** A very pale tint of the brand colour for banding and the totals block. */
function tint(bg: string, amount: number): string {
  const mix = (i: number) => Math.round(parseInt(bg.slice(i, i + 2), 16) * (1 - amount) + 255 * amount).toString(16).padStart(2, "0");
  return `FF${mix(0)}${mix(2)}${mix(4)}`.toUpperCase();
}

const MONEY_HEADER = /\b(amount|income|expense|balance|total|paid|owed|owing|outstanding|cost|price|rate|fee|pledged|given|credit|debit|ghs|budget|spent|collected|disbursed)\b/i;
const NOT_MONEY = /\b(count|number|no\.|#|reports|members|phone|id|ref|reference|receipt|sent|year|month|day|age|segments|messages)\b/i;
const DATE_HEADER = /\b(date|birthday|joined|due|completed|created|expires|renewal|since|from|to)\b/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const NUMERIC = /^-?\d{1,3}(,\d{3})*(\.\d+)?$|^-?\d+(\.\d+)?$/;

function isMoneyHeader(h: string) {
  return MONEY_HEADER.test(h) && !NOT_MONEY.test(h.replace(/\([^)]*\)/g, ""));
}

function cleanSheetName(name: string, taken: Set<string>): string {
  let base = name.replace(/[\\/*?:[\]]/g, "").trim().slice(0, 31) || "Sheet";
  let n = 2;
  while (taken.has(base.toLowerCase())) base = `${base.slice(0, 28)} ${n++}`;
  taken.add(base.toLowerCase());
  return base;
}

const thin = (argb: string): Partial<ExcelJS.Borders> => ({
  top: { style: "thin", color: { argb } },
  left: { style: "thin", color: { argb } },
  bottom: { style: "thin", color: { argb } },
  right: { style: "thin", color: { argb } },
});

function addSheet(wb: ExcelJS.Workbook, spec: WorkbookSpec, sheet: SheetSpec, taken: Set<string>, color: string, generated: Date, logoId: number | null) {
  const cols = Math.max(sheet.headers.length, 1);
  const ws = wb.addWorksheet(cleanSheetName(sheet.name, taken), {
    properties: { tabColor: { argb: `FF${color}` } },
    views: [{ showGridLines: false }],
  });
  const brand = `FF${color}`;
  const onBrand = textOn(color);
  const band = tint(color, 0.93);
  const footFill = tint(color, 0.85);
  const line = "FFD9D4CA";

  const mergeAcross = (row: number) => { if (cols > 1) ws.mergeCells(row, 1, row, cols); };

  // ── Title block ──
  ws.addRow([spec.churchName]);
  mergeAcross(1);
  const r1 = ws.getRow(1);
  r1.height = 30;
  r1.getCell(1).font = { name: "Calibri", size: 18, bold: true, color: { argb: brand } };
  r1.getCell(1).alignment = { vertical: "middle", horizontal: "center" };

  ws.addRow([sheet.title]);
  mergeAcross(2);
  ws.getRow(2).height = 24;
  ws.getRow(2).getCell(1).font = { name: "Calibri", size: 14, bold: true, color: { argb: "FF1C1A16" } };
  ws.getRow(2).getCell(1).alignment = { vertical: "middle", horizontal: "center" };

  const stamp = generated.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const sub = [sheet.subtitle, `Generated ${stamp}`, spec.preparedBy ? `by ${spec.preparedBy}` : ""].filter(Boolean).join("  |  ");
  ws.addRow([sub]);
  mergeAcross(3);
  ws.getRow(3).height = 20;
  ws.getRow(3).getCell(1).font = { name: "Calibri", size: 10, color: { argb: "FF6B6456" } };
  ws.getRow(3).getCell(1).alignment = { vertical: "middle", horizontal: "center" };
  if (logoId !== null && spec.logo) {
    const h = 62;
    const w = Math.max(20, Math.round((spec.logo.width / spec.logo.height) * h));
    ws.addImage(logoId, { tl: { col: 0.12, row: 0.1 }, ext: { width: w, height: h }, editAs: "oneCell" });
  }

  // Brand rule under the title block.
  ws.addRow([]);
  ws.getRow(4).height = 6;
  for (let c = 1; c <= cols; c++) ws.getRow(4).getCell(c).border = { top: { style: "medium", color: { argb: brand } } };

  // ── Header ──
  const HEAD = 5;
  ws.addRow(sheet.headers);
  const head = ws.getRow(HEAD);
  head.height = 24;
  head.eachCell((cell) => {
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: onBrand } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: brand } };
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    cell.border = thin(brand);
  });

  // ── Column kinds ──
  const sample = (i: number) => sheet.rows.map((r) => r[i]).filter((v) => v !== "" && v !== null && v !== undefined);
  const kinds = sheet.headers.map((h, i) => {
    const vals = sample(i);
    if (vals.length === 0) return "text" as const;
    if (DATE_HEADER.test(h) && vals.every((v) => v instanceof Date || (typeof v === "string" && ISO_DATE.test(v)) )) return "date" as const;
    if (isMoneyHeader(h) && vals.every((v) => typeof v === "number" || (typeof v === "string" && NUMERIC.test(v)))) return "money" as const;
    if (vals.every((v) => typeof v === "number")) return "number" as const;
    return "text" as const;
  });

  // ── Body ──
  const blankAt = sheet.rows.findIndex((r) => r.length === 0 || r.every((v) => v === "" || v === null || v === undefined));
  const widths = sheet.headers.map((h) => Math.min(60, Math.max(10, h.length + 3)));
  let body = 0;

  sheet.rows.forEach((raw, idx) => {
    const isBlank = raw.length === 0 || raw.every((v) => v === "" || v === null || v === undefined);
    if (isBlank) {
      // A spacer between the data and its totals.
      const spacer = ws.addRow([]);
      spacer.height = 8;
      return;
    }
    const footer = blankAt !== -1 && idx > blankAt;

    const values = sheet.headers.map((_, i) => {
      const v = raw[i];
      if (v === null || v === undefined || v === "") return null;
      if (kinds[i] === "date" && typeof v === "string" && ISO_DATE.test(v)) return new Date(`${v}T12:00:00Z`);
      if (kinds[i] === "money" && typeof v === "string" && NUMERIC.test(v)) return Number(v.replace(/,/g, ""));
      // A totals row mixes labels and figures in the money column: keep figures numeric.
      if (footer && isMoneyHeader(sheet.headers[i]) && typeof v === "string" && NUMERIC.test(v)) return Number(v.replace(/,/g, ""));
      return v;
    });
    const row = ws.addRow(values);

    row.eachCell({ includeEmpty: true }, (cell, c) => {
      const i = c - 1;
      if (i >= cols) return;
      const kind = kinds[i];
      cell.font = { name: "Calibri", size: 10.5, bold: footer, color: { argb: "FF1C1A16" } };
      cell.border = thin(line);
      cell.alignment = { vertical: "top", wrapText: kind === "text", horizontal: kind === "money" || kind === "number" ? "right" : kind === "date" ? "center" : "left" };
      if (kind === "money" || (footer && typeof cell.value === "number" && isMoneyHeader(sheet.headers[i]))) cell.numFmt = '#,##0.00;[Red]-#,##0.00';
      else if (kind === "date") cell.numFmt = "dd mmm yyyy";
      else if (kind === "number") cell.numFmt = "#,##0";
      if (footer) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: footFill } };
      else if (body % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: band } };
    });
    if (footer) { row.getCell(1).border = { ...thin(line), top: { style: "medium", color: { argb: brand } } }; }
    else body++;

    values.forEach((v, i) => {
      const len = v instanceof Date ? 11 : String(v ?? "").length;
      widths[i] = Math.min(60, Math.max(widths[i], len + 2));
    });
  });

  sheet.headers.forEach((_, i) => { ws.getColumn(i + 1).width = widths[i]; });

  if (sheet.rows.length === 0) {
    const empty = ws.addRow(["Nothing to show for this selection."]);
    if (cols > 1) ws.mergeCells(empty.number, 1, empty.number, cols);
    empty.getCell(1).font = { name: "Calibri", size: 11, italic: true, color: { argb: "FF6B6456" } };
    empty.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    empty.height = 28;
  }

  // ── Usability and print ──
  ws.views = [{ state: "frozen", ySplit: HEAD, showGridLines: false }];
  if (sheet.rows.length > 0) {
    const lastData = blankAt === -1 ? sheet.rows.length : blankAt;
    ws.autoFilter = { from: { row: HEAD, column: 1 }, to: { row: HEAD + Math.max(lastData, 1), column: cols } };
  }
  ws.pageSetup = {
    paperSize: 9,
    orientation: cols > 7 ? "landscape" : "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.7, header: 0.3, footer: 0.3 },
    printTitlesRow: `${HEAD}:${HEAD}`,
    horizontalCentered: true,
  };
  ws.headerFooter = {
    oddFooter: `&L&8${spec.churchName.replace(/&/g, "&&")} | ${sheet.title.replace(/&/g, "&&")}&R&8Page &P of &N`,
  };
}

/** Build a styled workbook and return the .xlsx bytes. */
export async function buildWorkbook(spec: WorkbookSpec): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "WorshipHQ";
  wb.company = spec.churchName;
  wb.title = spec.sheets.length === 1 ? `${spec.churchName}: ${spec.sheets[0].title}` : `${spec.churchName}: data export`;
  wb.created = new Date();
  const generated = new Date();
  const color = hex(spec.color);
  const taken = new Set<string>();
  const logoId = spec.logo ? wb.addImage({ buffer: spec.logo.buffer as unknown as ExcelJS.Buffer, extension: "png" }) : null;

  if (spec.contents && spec.sheets.length > 1) {
    const rows = spec.sheets.map((s) => [s.title, s.rows.filter((r) => r.length > 0 && !r.every((v) => v === "" || v == null)).length]);
    addSheet(wb, spec, {
      name: "Contents",
      title: "Contents",
      subtitle: `${spec.sheets.length} sheets in this workbook`,
      headers: ["Sheet", "Rows"],
      rows,
    }, taken, color, generated, logoId);
  }
  for (const sheet of spec.sheets) addSheet(wb, spec, sheet, taken, color, generated, logoId);

  if (wb.worksheets.length === 0) {
    addSheet(wb, spec, { name: "Export", title: "Export", headers: ["Info"], rows: [] }, taken, color, generated, logoId);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
