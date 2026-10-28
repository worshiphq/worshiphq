/**
 * Draws a print-ready QR poster onto a canvas. One drawing routine feeds the on-screen preview,
 * the PNG, the PDF and the print dialog, so what the church sees is exactly what comes out.
 * Every part of the poster can be switched off, and the size is any paper size or a custom one.
 */

export type PosterStyle = "classic" | "bold" | "minimal";
export type PosterFont = "clean" | "serif";

/** Pixels per millimetre at the on-screen base resolution (150 dpi). Exports draw at 2x (300 dpi). */
export const PX_PER_MM = 150 / 25.4;

export type PaperKey = "a3" | "a4" | "a5" | "a6" | "square" | "story" | "custom";

export const PAPER: { key: PaperKey; label: string; wMm: number; hMm: number; turns: boolean }[] = [
  { key: "a3", label: "A3 poster", wMm: 297, hMm: 420, turns: true },
  { key: "a4", label: "A4 poster", wMm: 210, hMm: 297, turns: true },
  { key: "a5", label: "A5 flyer", wMm: 148, hMm: 210, turns: true },
  { key: "a6", label: "A6 card", wMm: 105, hMm: 148, turns: true },
  { key: "square", label: "Square (WhatsApp)", wMm: 200, hMm: 200, turns: false },
  { key: "story", label: "Story (phone screen)", wMm: 108, hMm: 192, turns: false },
  { key: "custom", label: "Custom size", wMm: 210, hMm: 297, turns: false },
];

export type PosterOptions = {
  wMm: number;
  hMm: number;
  style: PosterStyle;
  font: PosterFont;
  accent: string;
  /** Paper colour. Null uses the look's own. */
  bg: string | null;
  churchName: string;
  showName: boolean;
  /** Null when the logo is off or there is none. */
  logo: HTMLImageElement | null;
  showHeadline: boolean;
  headline: string;
  showMessage: boolean;
  subline: string;
  /** Scan steps; empty strings are skipped. An empty list shows none. */
  steps: string[];
  /** Extra lines the church added (service times, address, phone). */
  extras: string[];
  showUrl: boolean;
  url: string;
  showCredit: boolean;
  /** 0.4 to 1: how much of the available space the code takes. */
  qrScale: number;
  /** 0.7 to 1.4: every piece of text grows or shrinks together. */
  textScale: number;
  /** The QR code as an image (dark on white). */
  qr: HTMLImageElement;
  /** The app's own font, used for the "clean" font. */
  appFont: string;
};

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [13, 115, 119];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Text colour that stays readable on top of the given background. */
export function readableOn(bg: string) {
  return luminance(bg) > 0.4 ? "#14211f" : "#ffffff";
}

/** QR ink: the church colour when it is dark enough to scan reliably, otherwise near-black. */
export function qrInk(accent: string) {
  return luminance(accent) < 0.3 ? accent : "#111827";
}

function rgba(hex: string, a: number) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(""); continue; }
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const test = `${line} ${words[i]}`;
      if (ctx.measureText(test).width <= maxW) line = test;
      else { lines.push(line); line = words[i]; }
    }
    lines.push(line);
  }
  return lines;
}

/** Largest font size (from start down to min) at which the text fits in maxLines lines. */
function fit(ctx: CanvasRenderingContext2D, text: string, family: string, weight: number, maxW: number, maxLines: number, start: number, min: number) {
  let size = start;
  for (;;) {
    ctx.font = `${weight} ${size}px ${family}`;
    const lines = wrap(ctx, text, maxW);
    if (lines.length <= maxLines || size <= min) return { size, lines: lines.slice(0, maxLines) };
    size -= 2;
  }
}

function drawLogo(ctx: CanvasRenderingContext2D, logo: HTMLImageElement, cx: number, cy: number, d: number) {
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.clip();
  const box = d * 0.8;
  const k = Math.min(box / logo.width, box / logo.height);
  const w = logo.width * k;
  const h = logo.height * k;
  ctx.drawImage(logo, cx - w / 2, cy - h / 2, w, h);
  ctx.restore();
}

type Ink = { head: string; sub: string; soft: string; headerInk: string };

export function drawPoster(canvas: HTMLCanvasElement, o: PosterOptions, scale = 1) {
  const W = Math.max(120, Math.round(o.wMm * PX_PER_MM * scale));
  const H = Math.max(120, Math.round(o.hMm * PX_PER_MM * scale));
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const u = Math.min(W, H) / 1000; // one design unit: layouts are drawn in "per thousand of the short side"
  const landscape = W / H > 1.25;
  const fam = o.font === "serif" ? `Georgia, "Times New Roman", serif` : o.appFont;
  const accent = o.accent;
  let ts = o.textScale; // may shrink below the chosen size when the content would not fit

  // Colours for the chosen look
  const paper = o.bg ?? (o.style === "classic" ? "#faf8f4" : o.style === "bold" ? accent : "#ffffff");
  const onPaper = readableOn(paper);
  const ink: Ink = {
    head: o.style === "minimal" && luminance(accent) < 0.35 && luminance(paper) > 0.6 ? accent : onPaper,
    sub: rgba(onPaper === "#ffffff" ? "#ffffff" : "#374151", onPaper === "#ffffff" ? 0.85 : 0.9),
    soft: rgba(onPaper === "#ffffff" ? "#ffffff" : "#6b7280", onPaper === "#ffffff" ? 0.7 : 1),
    headerInk: onPaper,
  };
  const stepDot = o.style === "bold" ? readableOn(accent) : accent;
  const stepDotText = o.style === "bold" ? accent : readableOn(accent);

  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "alphabetic";

  const steps = o.steps.map((s) => s.trim()).filter(Boolean);
  const extras = o.extras.map((s) => s.trim()).filter(Boolean);
  const hasLogo = !!o.logo;
  const hasName = o.showName && o.churchName.trim().length > 0;
  const hasHeader = hasLogo || hasName;
  const pad = 36 * u;

  /** Logo and church name side by side, anchored at (x, cy). align says what x means. */
  function drawHeader(x: number, cy: number, maxW: number, align: "left" | "center", logoD: number, inkColor: string) {
    const nm = hasName ? fit(ctx!, o.churchName, fam, 700, maxW - (hasLogo ? logoD + 22 * u : 0), 2, 44 * u * ts, 24 * u) : null;
    if (nm) ctx!.font = `700 ${nm.size}px ${fam}`;
    const nameW = nm ? Math.max(...nm.lines.map((l) => ctx!.measureText(l).width)) : 0;
    const gap = hasLogo && nm ? 22 * u : 0;
    const groupW = (hasLogo ? logoD : 0) + gap + nameW;
    let gx = align === "center" ? x - groupW / 2 : x;
    if (hasLogo && o.logo) { drawLogo(ctx!, o.logo, gx + logoD / 2, cy, logoD); gx += logoD + gap; }
    if (nm) {
      ctx!.fillStyle = inkColor;
      ctx!.textAlign = "left";
      ctx!.font = `700 ${nm.size}px ${fam}`;
      const lh = nm.size * 1.12;
      const top = cy - (nm.lines.length * lh) / 2;
      nm.lines.forEach((l, i) => ctx!.fillText(l, gx, top + lh * (i + 0.82)));
    }
  }

  /** Draw wrapped text; returns the height used. */
  function drawText(text: string, x: number, y: number, maxW: number, weight: number, start: number, min: number, maxLines: number, color: string, align: "left" | "center", lineHeight = 1.14) {
    const f = fit(ctx!, text, fam, weight, maxW, maxLines, start, min);
    ctx!.font = `${weight} ${f.size}px ${fam}`;
    ctx!.fillStyle = color;
    ctx!.textAlign = align;
    const lh = f.size * lineHeight;
    f.lines.forEach((l, i) => ctx!.fillText(l, x, y + lh * (i + 0.85)));
    return f.lines.length * lh;
  }

  const stepK = () => Math.max(0.6, Math.min(ts, 1.15));
  function stepsHeight() { return steps.length ? steps.length * 58 * u * stepK() + 26 * u : 0; }

  /** Height a block of text would take, without drawing it. */
  function blockH(text: string, weight: number, start: number, min: number, maxLines: number, maxW: number, lineHeight: number) {
    const f = fit(ctx!, text, fam, weight, maxW, maxLines, start, min);
    return f.lines.length * f.size * lineHeight;
  }

  function extrasHeight(maxW: number) {
    let h = 0;
    for (const e of extras) {
      const f = fit(ctx!, e, fam, 600, maxW, 2, 30 * u * ts, 20 * u);
      h += f.lines.length * f.size * 1.3 + 12 * u;
    }
    return h;
  }

  function drawSteps(x: number, y: number, align: "left" | "center") {
    const k = stepK();
    const size = 32 * u * k;
    ctx!.font = `600 ${size}px ${fam}`;
    const textW = Math.max(...steps.map((s) => ctx!.measureText(s).width));
    const dia = 44 * u * k;
    const blockW = dia + 20 * u + textW;
    const bx = align === "center" ? x - blockW / 2 : x;
    steps.forEach((s, i) => {
      const ry = y + i * 58 * u * k + dia / 2;
      ctx!.fillStyle = stepDot;
      ctx!.beginPath();
      ctx!.arc(bx + dia / 2, ry, dia / 2, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.fillStyle = stepDotText;
      ctx!.font = `800 ${26 * u * k}px ${fam}`;
      ctx!.textAlign = "center";
      ctx!.fillText(String(i + 1), bx + dia / 2, ry + 9 * u * k);
      ctx!.fillStyle = ink.head;
      ctx!.font = `600 ${size}px ${fam}`;
      ctx!.textAlign = "left";
      ctx!.fillText(s, bx + dia + 20 * u, ry + size * 0.34);
    });
  }

  function drawExtras(x: number, y: number, maxW: number, align: "left" | "center") {
    let yy = y;
    for (const e of extras) yy += drawText(e, x, yy, maxW, 600, 30 * u * ts, 20 * u, 2, ink.sub, align, 1.3) + 12 * u;
    return yy - y;
  }

  function drawCard(x: number, y: number, qs: number) {
    const card = qs + 2 * pad;
    ctx!.save();
    if (o.style !== "bold") { ctx!.shadowColor = "rgba(0,0,0,0.14)"; ctx!.shadowBlur = 44 * u; ctx!.shadowOffsetY = 14 * u; }
    ctx!.fillStyle = "#ffffff";
    roundRectPath(ctx!, x, y, card, card, 34 * u);
    ctx!.fill();
    ctx!.restore();
    if (o.style !== "bold") {
      ctx!.lineWidth = 4 * u;
      ctx!.strokeStyle = o.style === "classic" ? accent : "#e5e7eb";
      roundRectPath(ctx!, x, y, card, card, 34 * u);
      ctx!.stroke();
    }
    ctx!.imageSmoothingEnabled = true;
    ctx!.drawImage(o.qr, x + pad, y + pad, qs, qs);
    return card;
  }

  function footerLines(x: number, bottomY: number, align: "left" | "center") {
    ctx!.textAlign = align;
    let fy = bottomY;
    if (o.showCredit) {
      ctx!.font = `500 ${24 * u}px ${o.appFont}`;
      ctx!.fillStyle = onPaper === "#ffffff" ? "rgba(255,255,255,0.75)" : "#9ca3af";
      ctx!.fillText("Made with WorshipHQ  |  worshiphq.app", x, fy);
      fy -= 56 * u;
    }
    if (o.showUrl) {
      const shown = o.url.replace(/^https?:\/\//, "");
      const f = fit(ctx!, shown, fam, 700, (landscape ? W * 0.5 : 880 * u) - 20 * u, 1, 34 * u * Math.min(ts, 1.2), 18 * u);
      ctx!.font = `700 ${f.size}px ${fam}`;
      ctx!.fillStyle = o.style === "bold" ? readableOn(accent) : o.style === "classic" ? accent : ink.soft;
      ctx!.fillText(f.lines[0], x, fy);
    }
  }
  const footH = 40 * u + (o.showCredit ? 44 * u : 0) + (o.showUrl ? 64 * u : 0);

  // ── Landscape: words on the left, code on the right ──
  if (landscape) {
    const margin = 60 * u;
    const leftW = W * 0.52 - margin;
    const rightX = W * 0.56;
    const leftNeeded = () => {
      let h = margin + (hasHeader ? 96 * u + 34 * u : 0);
      if (o.showHeadline && o.headline.trim()) h += blockH(o.headline, 800, 84 * u * ts, 40 * u, 3, leftW, 1.1) + 16 * u;
      if (o.showMessage && o.subline.trim()) h += blockH(o.subline, 500, 36 * u * ts, 22 * u, 4, leftW, 1.38) + 20 * u;
      return h + stepsHeight() + extrasHeight(leftW) + footH + 20 * u;
    };
    while (leftNeeded() > H && ts > 0.5) ts *= 0.93;
    if (o.style === "classic") {
      ctx.fillStyle = accent;
      ctx.fillRect(rightX - 20 * u, 0, W - rightX + 20 * u, H);
    } else if (o.style === "minimal") {
      ctx.fillStyle = accent;
      ctx.fillRect(0, 0, W, 14 * u);
    }
    let y = margin;
    if (hasHeader) {
      const d = 96 * u;
      drawHeader(margin, y + d / 2, leftW, "left", d, ink.headerInk);
      y += d + 34 * u;
    }
    if (o.showHeadline && o.headline.trim()) y += drawText(o.headline, margin, y, leftW, 800, 84 * u * ts, 40 * u, 3, ink.head, "left", 1.1) + 16 * u;
    if (o.showMessage && o.subline.trim()) y += drawText(o.subline, margin, y, leftW, 500, 36 * u * ts, 22 * u, 4, ink.sub, "left", 1.38) + 20 * u;
    if (steps.length) { drawSteps(margin, y, "left"); y += stepsHeight(); }
    if (extras.length) drawExtras(margin, y, leftW, "left");
    footerLines(margin, H - 40 * u, "left");
    const regionW = W - rightX - margin + 20 * u;
    const maxCard = Math.min(regionW, H - 2 * margin);
    const card = Math.max(260 * u, maxCard * Math.max(0.4, Math.min(1, o.qrScale)));
    const cx = rightX - 20 * u + (W - (rightX - 20 * u) - card) / 2;
    drawCard(cx, (H - card) / 2, card - 2 * pad);
    return;
  }

  // ── Stacked: header, words, code, steps, extras, footer ──
  const topBar = 14 * u;
  let headH = 0;
  if (hasHeader) headH = Math.min(0.2 * H, Math.max(0.12 * H, 150 * u));
  const stackMaxW = 860 * u;
  const stackStart = (hasHeader ? headH : topBar) + (H > W ? 0.05 : 0.035) * H;
  const stackRoom = () => {
    let yy = stackStart;
    if (o.showHeadline && o.headline.trim()) yy += blockH(o.headline, 800, (H > W * 1.15 ? 92 : 78) * u * ts, 40 * u, 3, stackMaxW, 1.1) + 0.016 * H;
    if (o.showMessage && o.subline.trim()) yy += blockH(o.subline, 500, (H > W * 1.15 ? 38 : 32) * u * ts, 22 * u, 3, 800 * u, 1.38) + 0.018 * H;
    return H - yy - (stepsHeight() + extrasHeight(stackMaxW) + footH + 0.03 * H) - 2 * pad;
  };
  while (stackRoom() < 280 * u && ts > 0.5) ts *= 0.93;
  if (hasHeader && o.style === "classic") {
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, W, headH);
  } else if (o.style !== "bold") {
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, W, topBar);
  }
  if (hasHeader) {
    const headInk = o.style === "classic" ? readableOn(accent) : ink.headerInk;
    drawHeader(W / 2, headH / 2 + (o.style === "minimal" ? 7 * u : 0), 860 * u, "center", Math.min(headH * 0.58, 130 * u), headInk);
  }

  const maxW = stackMaxW;
  let y = stackStart;
  if (o.showHeadline && o.headline.trim()) {
    y += drawText(o.headline, W / 2, y, maxW, 800, (H > W * 1.15 ? 92 : 78) * u * ts, 40 * u, 3, ink.head, "center", 1.1) + 0.016 * H;
  }
  if (o.showMessage && o.subline.trim()) {
    y += drawText(o.subline, W / 2, y, 800 * u, 500, (H > W * 1.15 ? 38 : 32) * u * ts, 22 * u, 3, ink.sub, "center", 1.38) + 0.018 * H;
  }

  const reserved = stepsHeight() + extrasHeight(maxW) + footH + 0.03 * H;
  const room = H - y - reserved - 2 * pad;
  const widest = 0.84 * W - 2 * pad;
  const avail = Math.max(200 * u, Math.min(room, widest));
  const qs = Math.max(160 * u, avail * Math.max(0.4, Math.min(1, o.qrScale)));
  const card = drawCard((W - (qs + 2 * pad)) / 2, y + Math.max(0, (avail - qs) / 2), qs);
  y += Math.max(card, avail + 2 * pad) + 0.02 * H;

  if (steps.length) { drawSteps(W / 2, y, "center"); y += stepsHeight(); }
  if (extras.length) drawExtras(W / 2, y, maxW, "center");
  footerLines(W / 2, H - 40 * u, "center");
}
