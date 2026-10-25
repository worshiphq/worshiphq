import { PDFDocument, rgb, type PDFFont, type PDFPage, type PDFImage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  FONT_REGULAR_B64, FONT_SEMIBOLD_B64, FONT_BOLD_B64, LOGO_WODONA_B64, LOGO_WORSHIPHQ_B64, LOGO_WODONA_SIZE, LOGO_WORSHIPHQ_SIZE,
} from "@/lib/receipts/assets.generated";
import { money, receiptStatus, round2, totalsOf, type ReceiptData } from "@/lib/receipts/types";

/** The receipt has more on it than one sheet can hold. Shown to the person making it. */
export class ReceiptOverflowError extends Error {}

const col = (r: number, g: number, b: number) => rgb(r / 255, g / 255, b / 255);
const C = {
  ink: col(25, 37, 47),
  muted: col(91, 103, 112),
  faint: col(138, 148, 155),
  line: col(223, 228, 230),
  tint: col(243, 246, 246),
  teal: col(1, 154, 159),
  tealDark: col(0, 103, 108),
  tealBg: col(232, 246, 246),
  white: col(255, 255, 255),
  parchment: col(246, 241, 230),
  parchmentLine: col(232, 222, 200),
  goldText: col(150, 105, 20),
  goldBg: col(251, 241, 220),
  amberText: col(180, 83, 9),
  amberBg: col(254, 243, 199),
  giftText: col(91, 54, 160),
  giftBg: col(240, 233, 252),
  red: col(180, 35, 24),
};

type Fonts = { r: PDFFont; s: PDFFont; b: PDFFont };

const b64 = (s: string) => Uint8Array.from(Buffer.from(s, "base64"));

/** Sizes for each sheet. A "half" is the top or bottom half of an A4 (A5 landscape), so a church can be given it on half a page. */
const SHEET = {
  a4: {
    W: 595.28, H: 841.89, M: 44, bar: 5,
    top: 34, wodonaH: 26, pillH: 30, pillLogoH: 20, receiptSize: 24, metaSize: 10, chipSize: 8.5,
    dividerGap: 18, label: 7.5, name: 12, text: 9.5, small: 8.5,
    rowPad: 10, headH: 22, itemSize: 10, detailSize: 8.5, totalSize: 15, bandH: 38,
    footerH: 62, footerSize: 8,
  },
  half: {
    W: 595.28, H: 420.94, M: 30, bar: 4,
    top: 20, wodonaH: 18, pillH: 22, pillLogoH: 14, receiptSize: 17, metaSize: 8.5, chipSize: 7,
    dividerGap: 10, label: 6.5, name: 10, text: 8.5, small: 7.5,
    rowPad: 5.5, headH: 16, itemSize: 8.5, detailSize: 7.5, totalSize: 12, bandH: 28,
    footerH: 34, footerSize: 7,
  },
} as const;

function dateText(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Accra" }).format(d);
}

export async function renderReceiptPdf(data: ReceiptData): Promise<Uint8Array> {
  const S = SHEET[data.sheet];
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fonts: Fonts = {
    r: await doc.embedFont(b64(FONT_REGULAR_B64), { subset: true }),
    s: await doc.embedFont(b64(FONT_SEMIBOLD_B64), { subset: true }),
    b: await doc.embedFont(b64(FONT_BOLD_B64), { subset: true }),
  };
  const logoWodona = await doc.embedPng(b64(LOGO_WODONA_B64));
  const logoWhq = await doc.embedPng(b64(LOGO_WORSHIPHQ_B64));
  // The issuer's signature is optional (until uploaded the receipt has a blank signing space). A bad image never blocks a receipt.
  const sigImg = await (async () => {
    const v = data.settings.signature;
    if (!v) return null;
    try { return await doc.embedPng(b64(v.slice(v.indexOf(",") + 1))); } catch { return null; }
  })();
  const page = doc.addPage([S.W, S.H]);
  const supported = new Set(fonts.r.getCharacterSet());

  const title = data.number ? `Receipt ${data.number}` : "Receipt (preview)";
  doc.setTitle(title);
  doc.setAuthor(data.settings.companyName || "WODONA");
  doc.setCreator("WODONA");
  doc.setProducer("WODONA receipts");
  doc.setCreationDate(data.issuedAt);

  // ── helpers ──
  const clean = (t: unknown): string =>
    [...String(t ?? "").replace(/\r\n?/g, "\n").replace(/\t/g, " ")].map((ch) => (ch === "\n" || supported.has(ch.codePointAt(0)!) ? ch : "?")).join("");
  const width = (t: string, font: PDFFont, size: number) => font.widthOfTextAtSize(t, size);
  const Y = (top: number) => S.H - top; // top-based baseline to PDF y

  const text = (t: string, x: number, baseline: number, size: number, font: PDFFont, color = C.ink, align: "left" | "right" | "center" = "left") => {
    const s = clean(t).replace(/\n/g, " ");
    const w = width(s, font, size);
    const px = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
    page.drawText(s, { x: px, y: Y(baseline), size, font, color });
    return w;
  };
  /** Capital letters spaced out a little: small labels and the big title. */
  const tracked = (t: string, x: number, baseline: number, size: number, font: PDFFont, color: ReturnType<typeof rgb>, track: number, align: "left" | "right" = "left") => {
    const s = clean(t).toUpperCase();
    const total = [...s].reduce((n, ch) => n + width(ch, font, size) + track, 0) - track;
    let px = align === "right" ? x - total : x;
    for (const ch of s) {
      page.drawText(ch, { x: px, y: Y(baseline), size, font, color });
      px += width(ch, font, size) + track;
    }
  };
  const label = (t: string, x: number, baseline: number, color = C.faint, align: "left" | "right" = "left") =>
    tracked(t, x, baseline, S.label, fonts.b, color, 0.7, align);
  const wrap = (t: string, font: PDFFont, size: number, max: number): string[] => {
    const out: string[] = [];
    for (const para of clean(t).split("\n")) {
      let line = "";
      for (const word of para.split(" ")) {
        // a word longer than the whole line is cut up
        let w = word;
        while (width(w, font, size) > max && w.length > 1) {
          let cut = w.length - 1;
          while (cut > 1 && width(w.slice(0, cut), font, size) > max) cut--;
          if (line) { out.push(line); line = ""; }
          out.push(w.slice(0, cut));
          w = w.slice(cut);
        }
        const tryLine = line ? `${line} ${w}` : w;
        if (width(tryLine, font, size) <= max) line = tryLine;
        else { if (line) out.push(line); line = w; }
      }
      out.push(line);
    }
    return out;
  };
  const rect = (x: number, top: number, w: number, h: number, fill: ReturnType<typeof rgb>, border?: ReturnType<typeof rgb>, radius = 0) => {
    if (radius > 0) {
      const r = Math.min(radius, w / 2, h / 2);
      const path = `M ${r},0 H ${w - r} A ${r},${r} 0 0 1 ${w},${r} V ${h - r} A ${r},${r} 0 0 1 ${w - r},${h} H ${r} A ${r},${r} 0 0 1 0,${h - r} V ${r} A ${r},${r} 0 0 1 ${r},0 Z`;
      page.drawSvgPath(path, { x, y: Y(top), color: fill, ...(border ? { borderColor: border, borderWidth: 0.8 } : {}) });
    } else {
      page.drawRectangle({ x, y: Y(top + h), width: w, height: h, color: fill, ...(border ? { borderColor: border, borderWidth: 0.8 } : {}) });
    }
  };
  const hline = (x1: number, x2: number, top: number, color = C.line, thickness = 0.7) =>
    page.drawLine({ start: { x: x1, y: Y(top) }, end: { x: x2, y: Y(top) }, thickness, color });
  const img = (im: PDFImage, x: number, top: number, h: number) => {
    const w = (im.width / im.height) * h;
    page.drawImage(im, { x, y: Y(top + h), width: w, height: h });
    return w;
  };

  const { W, M } = S;
  const right = W - M;
  const contentW = W - 2 * M;
  const t = totalsOf(data.items, data.discount, data.paid);
  const status = receiptStatus(data);
  const cur = data.currency || "GHS";
  const fmt = (n: number) => money(n, cur);
  const isFree = data.kind === "registration";
  const st = data.settings;

  // ── top accent bar ──
  rect(0, 0, W, S.bar, C.teal);

  // ── logos, left ──
  let headBottom = S.top + S.bar;
  const logoTop = S.top + S.bar + 4;
  if (data.brand === "wodona") {
    const lh = S.wodonaH + (data.sheet === "a4" ? 8 : 4);
    const lw = img(logoWodona, M, logoTop, lh);
    void lw;
    headBottom = logoTop + lh;
    if (st.tagline) { text(st.tagline, M, headBottom + 13, S.small, fonts.r, C.muted); headBottom += 16; }
  } else {
    img(logoWodona, M, logoTop, S.wodonaH);
    const pillTop = logoTop + S.wodonaH + (data.sheet === "a4" ? 10 : 6);
    const pillLogoW = (LOGO_WORSHIPHQ_SIZE.width / LOGO_WORSHIPHQ_SIZE.height) * S.pillLogoH;
    const pillW = pillLogoW + 20;
    rect(M, pillTop, pillW, S.pillH, C.parchment, C.parchmentLine, S.pillH / 2);
    img(logoWhq, M + 10, pillTop + (S.pillH - S.pillLogoH) / 2, S.pillLogoH);
    text("a WODONA product", M + pillW + 8, pillTop + S.pillH / 2 + S.small * 0.35, S.small, fonts.s, C.muted);
    headBottom = pillTop + S.pillH;
  }
  void LOGO_WODONA_SIZE;

  // ── title block, right ──
  const recBase = logoTop + S.receiptSize;
  tracked("Receipt", right, recBase, S.receiptSize, fonts.b, C.ink, data.sheet === "a4" ? 3 : 2, "right");
  const numBase = recBase + S.metaSize + (data.sheet === "a4" ? 12 : 8);
  text(data.number ? `No. ${data.number}` : "No. given when saved", right, numBase, S.metaSize + 1, fonts.s, C.ink, "right");
  const dateBase = numBase + S.metaSize + (data.sheet === "a4" ? 6 : 4);
  text(dateText(data.issuedAt), right, dateBase, S.metaSize, fonts.r, C.muted, "right");
  // status chip
  {
    const tone = status.tone === "paid" ? { fg: C.tealDark, bg: C.tealBg } : status.tone === "free" ? { fg: C.goldText, bg: C.goldBg } : status.tone === "gift" ? { fg: C.giftText, bg: C.giftBg } : { fg: C.amberText, bg: C.amberBg };
    const tw = [...status.label].reduce((n, ch) => n + width(ch, fonts.b, S.chipSize) + 0.8, 0) - 0.8;
    const cw = tw + 18, chH = S.chipSize + 9;
    const chTop = dateBase + (data.sheet === "a4" ? 10 : 6);
    rect(right - cw, chTop, cw, chH, tone.bg, undefined, chH / 2);
    let px = right - cw + 9;
    for (const ch of status.label) {
      page.drawText(ch, { x: px, y: Y(chTop + chH / 2 + S.chipSize * 0.35), size: S.chipSize, font: fonts.b, color: tone.fg });
      px += width(ch, fonts.b, S.chipSize) + 0.8;
    }
    headBottom = Math.max(headBottom, chTop + chH);
  }

  let y = headBottom + S.dividerGap;
  hline(M, right, y);
  y += S.dividerGap;

  // ── received from / payment details ──
  const colGap = 24;
  const leftW = contentW * 0.5 - colGap / 2;
  const rightX = M + leftW + colGap;
  const rightW = right - rightX;
  const small = S.text;
  const lh = small + (data.sheet === "a4" ? 4 : 3);

  label("Received from", M, y + S.label);
  let ly = y + S.label + (data.sheet === "a4" ? 17 : 13);
  text(data.toName || "-", M, ly, S.name, fonts.b);
  ly += S.name + 3;
  const leftLines: string[] = [];
  if (data.toOrg) leftLines.push(data.toOrg);
  if (data.toEmail) leftLines.push(data.toEmail);
  if (data.toPhone) leftLines.push(data.toPhone);
  if (data.toAddress) leftLines.push(...wrap(data.toAddress, fonts.r, small, leftW).slice(0, 3));
  for (const line of leftLines.flatMap((l) => wrap(l, fonts.r, small, leftW))) {
    text(line, M, ly + 2, small, fonts.r, C.muted);
    ly += lh;
  }

  label("Payment details", rightX, y + S.label);
  let ry = y + S.label + (data.sheet === "a4" ? 17 : 13);
  const detail = (k: string, v: string | null | undefined) => {
    if (!v) return;
    const valueX = rightX + (data.sheet === "a4" ? 78 : 62);
    text(k, rightX, ry, small, fonts.r, C.faint);
    const lines = wrap(v, fonts.s, small, rightW - (valueX - rightX));
    lines.slice(0, 2).forEach((ln, i) => text(ln, valueX, ry + i * lh, small, fonts.s, C.ink));
    ry += lh * Math.min(lines.length, 2);
  };
  detail("Method", isFree ? "No payment needed" : data.method);
  detail("Reference", data.reference);
  detail("Follows", data.followsNumber ? `Receipt ${data.followsNumber}` : null);
  detail("Issued by", data.kind === "manual" ? st.issuedBy : (data.brand === "wodona" ? st.companyName : "WorshipHQ, a WODONA product"));

  y = Math.max(ly, ry) + (data.sheet === "a4" ? 14 : 8);

  // ── items table ──
  rect(M, y, contentW, S.headH, C.tint, undefined, 4);
  const xAmount = right - 10;
  const xUnit = xAmount - (data.sheet === "a4" ? 96 : 84);
  const xQty = xUnit - (data.sheet === "a4" ? 84 : 72);
  const descW = xQty - 40 - (M + 10);
  const headBase = y + S.headH / 2 + S.label * 0.35;
  label("Description", M + 10, headBase);
  label("Qty", xQty, headBase, C.faint, "right");
  label("Unit price", xUnit, headBase, C.faint, "right");
  label("Amount", xAmount, headBase, C.faint, "right");
  y += S.headH;

  // Everything below the table has a known height, so we can tell if the rows will not fit.
  const welcomeBox = isFree && data.welcome && data.sheet === "a4" ? measureWelcome(data, fonts, S, contentW) : null;
  const notesLines = data.notes ? wrap(data.notes, fonts.r, small, contentW * 0.5 - 20).slice(0, data.sheet === "a4" ? 8 : 3) : [];
  const limit = S.H - S.footerH - 8;

  for (const [idx, it] of data.items.entries()) {
    const descLines = wrap(it.description, fonts.s, S.itemSize, descW);
    const detLines = it.detail ? wrap(it.detail, fonts.r, S.detailSize, descW) : [];
    const rowH = S.rowPad * 2 + descLines.length * (S.itemSize + 3) + (detLines.length ? detLines.length * (S.detailSize + 2.5) + 2 : 0);
    let base = y + S.rowPad + S.itemSize;
    descLines.forEach((ln, i) => text(ln, M + 10, base + i * (S.itemSize + 3), S.itemSize, fonts.s));
    const lineAmount = Math.round(it.qty * it.unit * 100) / 100;
    text(String(it.qty), xQty, base, S.itemSize, fonts.r, C.ink, "right");
    text(isFree && it.unit === 0 ? "Free" : fmt(it.unit), xUnit, base, S.itemSize, fonts.r, C.muted, "right");
    text(isFree && lineAmount === 0 ? "Free" : fmt(lineAmount), xAmount, base, S.itemSize, fonts.s, C.ink, "right");
    base += (descLines.length - 1) * (S.itemSize + 3);
    detLines.forEach((ln, i) => text(ln, M + 10, base + 4 + S.detailSize + i * (S.detailSize + 2.5), S.detailSize, fonts.r, C.muted));
    y += rowH;
    if (idx < data.items.length - 1) hline(M, right, y, C.line, 0.5);
  }
  hline(M, right, y, C.line, 0.9);
  y += data.sheet === "a4" ? 16 : 10;

  // ── signature: the issuer only (image, line, name and date). The person paying does not sign. ──
  const sigGeom = (a4s: boolean) => ({ imgH: a4s ? 44 : 26, lineW: a4s ? 190 : 160, gap: a4s ? 18 : 6 });
  const sigHeight = () => { const g = sigGeom(data.sheet === "a4"); return g.gap + g.imgH + (S.small + 5) * 2 + 4; };
  /** Draws the signature block with its top at `top` and returns where it ends. */
  const drawSignature = (top: number): number => {
    const { imgH, lineW, gap } = sigGeom(data.sheet === "a4");
    const sy = top + gap + imgH;
    if (sigImg) {
      const scale = Math.min(imgH / sigImg.height, (lineW - 10) / sigImg.width);
      page.drawImage(sigImg, { x: M + 4, y: Y(sy) + 3, width: sigImg.width * scale, height: sigImg.height * scale });
    }
    hline(M, M + lineW, sy, C.muted, 0.6);
    const who = st.issuedBy || (data.brand === "wodona" ? st.companyName : "WODONA");
    text(who, M, sy + S.small + 5, S.small + 0.5, fonts.s, C.ink);
    text(dateText(data.issuedAt), M, sy + (S.small + 5) * 2, S.small, fonts.r, C.muted);
    return sy + (S.small + 5) * 2 + 4;
  };

  // ── totals (right) and notes (left) ──
  const totalsX = right - (data.sheet === "a4" ? 240 : 220);
  let ty = y;
  const row = (k: string, v: string, bold = false, color = C.ink) => {
    text(k, totalsX, ty + small, small + (bold ? 1 : 0), bold ? fonts.s : fonts.r, bold ? C.ink : C.muted);
    text(v, right, ty + small, small + (bold ? 1 : 0), bold ? fonts.b : fonts.r, color, "right");
    ty += small + 8;
  };
  row("Subtotal", fmt(t.subtotal));
  if (t.discount > 0) row("Discount", `- ${fmt(t.discount)}`);
  hline(totalsX, right, ty - 3);
  ty += 3;
  row("Total", fmt(t.total), true);
  const before = Math.min(Math.max(data.paidBefore ?? 0, 0), data.paid);
  const follow = before > 0 && !isFree && data.kind !== "gift";
  if (follow) row("Paid earlier", `- ${fmt(before)}`);
  ty += 6;
  if (isFree) {
    rect(totalsX, ty, right - totalsX, S.bandH, C.tealBg, C.teal, 6);
    text("TOTAL TO PAY", totalsX + 14, ty + S.bandH / 2 + 3, S.small, fonts.b, C.tealDark);
    text(fmt(0), right - 14, ty + S.bandH / 2 + S.totalSize * 0.35, S.totalSize, fonts.b, C.tealDark, "right");
    ty += S.bandH + 14;
    text("Free forever. No card, no expiry.", right, ty, S.small, fonts.s, C.goldText, "right");
    ty += 4;
  } else {
    rect(totalsX, ty, right - totalsX, S.bandH, C.teal, undefined, 6);
    text(data.kind === "gift" ? "GIFTED" : follow ? "THIS PAYMENT" : "AMOUNT PAID", totalsX + 14, ty + S.bandH / 2 + 3, S.small, fonts.b, C.white);
    text(data.kind === "gift" ? "No charge" : fmt(follow ? round2(data.paid - before) : data.paid), right - 14, ty + S.bandH / 2 + S.totalSize * 0.35, S.totalSize, fonts.b, C.white, "right");
    ty += S.bandH;
    if (t.balance > 0) {
      ty += 16;
      text("Balance due", totalsX, ty, small + 1, fonts.s, C.red);
      text(fmt(t.balance), right, ty, small + 1, fonts.b, C.red, "right");
      ty += 6;
    } else if (follow) {
      ty += 16;
      text("Paid in full. Thank you.", right, ty, small + 1, fonts.s, C.tealDark, "right");
      ty += 6;
    }
  }

  if (notesLines.length) {
    label("Notes", M, y + S.label);
    notesLines.forEach((ln, i) => text(ln, M, y + S.label + 14 + i * (small + 3.5), small, fonts.r, C.muted));
  }
  const notesBottom = notesLines.length ? y + S.label + 14 + notesLines.length * (small + 3.5) : 0;
  if (data.sheet === "half") {
    // On a half sheet there is no room below the totals, so the signature sits to the left of them, level with their foot.
    const sigBottom = drawSignature(Math.max(ty - sigHeight(), notesBottom + 4));
    y = Math.max(ty, sigBottom) + 8;
  } else {
    y = Math.max(ty, notesBottom) + 20;
  }

  // ── welcome panel (free account) ──
  if (welcomeBox && data.welcome) {
    drawWelcome(y, data, fonts, S, contentW, welcomeBox, { rect, text, label, wrap });
    y += welcomeBox.height + 14;
  }

  if (data.sheet === "a4") y = drawSignature(y);

  if (y > limit) {
    throw new ReceiptOverflowError(
      data.sheet === "half"
        ? "That is too much for half an A4 sheet. Remove a line or shorten the notes, or switch to a full A4."
        : "That is too much for one A4 sheet. Remove a line or shorten the notes.",
    );
  }

  // ── footer ──
  const fTop = S.H - S.footerH;
  hline(M, right, fTop, C.line, 0.7);
  const co = data.brand === "wodona" ? st.companyName || "WODONA" : "WODONA";
  const bits = [
    st.address,
    st.phone,
    data.brand === "worshiphq" ? (st.whqEmail || st.email) : st.email,
    data.brand === "worshiphq" ? st.whqWebsite : st.website,
    st.registration ? `Reg. ${st.registration}` : "",
  ].filter(Boolean);
  const fl = fTop + (data.sheet === "a4" ? 16 : 11);
  const nameW = text(co, M, fl, S.footerSize + 0.5, fonts.b, C.ink);
  if (data.brand === "worshiphq") text("  |  WorshipHQ is a WODONA product", M + nameW, fl, S.footerSize, fonts.r, C.faint);
  const auto = data.kind !== "manual";
  const rightNote = data.sheet === "half" ? (auto ? "Generated electronically" : "Page 1 of 1") : "";
  const noteW = rightNote ? width(rightNote, fonts.r, S.footerSize) + 14 : 0;
  const numberW = data.number ? width(data.number, fonts.b, S.footerSize + 0.5) + 14 : 70;
  if (bits.length) {
    wrap(bits.join("  |  "), fonts.r, S.footerSize, contentW - Math.max(noteW, numberW) - 10).slice(0, 2).forEach((ln, i) => text(ln, M, fl + (S.footerSize + 4) * (i + 1), S.footerSize, fonts.r, C.muted));
  }
  text(data.number ?? "Preview", right, fl, S.footerSize + 0.5, fonts.b, C.ink, "right");
  if (rightNote) text(rightNote, right, fl + S.footerSize + 4, S.footerSize, fonts.r, C.faint, "right");
  if (data.sheet === "a4") {
    text(data.kind === "registration" ? "Welcome to the family." : "Thank you.", W / 2, fTop - (auto ? 30 : 16), S.text + 1, fonts.s, C.teal, "center");
    if (auto) text("Generated electronically.", W / 2, fTop - 14, S.small, fonts.r, C.faint, "center");
  }

  return doc.save();
}

/* ── the free-account welcome panel ── */

type WelcomeBox = { height: number; intro: string[]; features: string[]; steps: string[]; helpLine: string };
type Draw = {
  rect: (x: number, top: number, w: number, h: number, fill: ReturnType<typeof rgb>, border?: ReturnType<typeof rgb>, radius?: number) => void;
  text: (t: string, x: number, baseline: number, size: number, font: PDFFont, color?: ReturnType<typeof rgb>, align?: "left" | "right" | "center") => number;
  label: (t: string, x: number, baseline: number, color?: ReturnType<typeof rgb>, align?: "left" | "right") => void;
  wrap: (t: string, font: PDFFont, size: number, max: number) => string[];
};

function measureWelcome(data: ReceiptData, fonts: Fonts, S: (typeof SHEET)[keyof typeof SHEET], contentW: number): WelcomeBox {
  const w = data.welcome!;
  const size = S.text;
  const inner = contentW - 40;
  const wrapLocal = (t: string, font: PDFFont, sz: number, max: number) => {
    const out: string[] = [];
    let line = "";
    for (const word of t.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, sz) <= max) line = next;
      else { out.push(line); line = word; }
    }
    out.push(line);
    return out;
  };
  const intro = wrapLocal(
    "Your church's account is free, and it stays free. There is no trial, no card to add and no expiry date. Use it for as long as you like, and upgrade only if and when your church needs more.",
    fonts.r, size, inner,
  );
  const features = [...(w.members ? [`Up to ${w.members} members`] : []), ...w.features].slice(0, 6);
  const steps = [
    "Add your church logo and details in Settings.",
    "Share your member registration link (People page) so members sign themselves up.",
    "Open the manual at worshiphq.app/docs whenever you need help.",
  ];
  const helpLine = "Questions? Reply to the email this came with. We are glad to help.";
  const height = 22 + 20 + intro.length * (size + 3.5) + 16 + 16 + Math.ceil(features.length / 2) * (size + 5) + 14 + 16 + steps.length * (size + 5) + 14 + size + 16;
  return { height, intro, features, steps, helpLine };
}

function drawWelcome(top: number, data: ReceiptData, fonts: Fonts, S: (typeof SHEET)[keyof typeof SHEET], contentW: number, box: WelcomeBox, d: Draw) {
  const M = S.M;
  const size = S.text;
  d.rect(M, top, contentW, box.height, C.tealBg, C.teal, 8);
  let y = top + 22;
  d.text(`Welcome to WorshipHQ, ${data.welcome!.church}!`.slice(0, 80), M + 20, y + 4, 13, fonts.b, C.tealDark);
  y += 20;
  for (const ln of box.intro) { d.text(ln, M + 20, y + size, size, fonts.r, C.ink); y += size + 3.5; }
  y += 16;
  d.label("Included in your free account", M + 20, y + 4, C.tealDark);
  y += 16;
  const colW = (contentW - 40) / 2;
  box.features.forEach((f, i) => {
    const cx = M + 20 + (i % 2) * colW;
    const cy = y + Math.floor(i / 2) * (size + 5);
    d.rect(cx, cy + size * 0.35, 4, 4, C.teal, undefined, 2);
    d.text(f, cx + 11, cy + size, size, fonts.r, C.ink);
  });
  y += Math.ceil(box.features.length / 2) * (size + 5) + 14;
  d.label("Your first steps", M + 20, y + 4, C.tealDark);
  y += 16;
  box.steps.forEach((s, i) => {
    d.text(`${i + 1}.`, M + 20, y + size, size, fonts.b, C.teal);
    d.text(s, M + 34, y + size, size, fonts.r, C.ink);
    y += size + 5;
  });
  y += 14;
  d.text(box.helpLine, M + 20, y + size, size, fonts.s, C.tealDark);
}

export type { PDFPage };
