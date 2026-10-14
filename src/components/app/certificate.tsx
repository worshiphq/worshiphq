"use client";

import type { CSSProperties, ReactNode } from "react";
import type { CertField, CertSettings, TemplateRow } from "@/app/actions/baptisms";

/** Certificate designs for printing. Every design is drawn in vector (SVG and text) so it stays sharp at any size and prints cleanly. */

export type CertData = { name: string; date: string; place: string; officiant: string; certificateNo: string };
export type CertCtx = { churchName: string; logoUrl: string | null; settings: CertSettings };

export const BUILT_IN = [
  { id: "classic", name: "Classic", note: "Navy and gold, double border, script name" },
  { id: "heritage", name: "Heritage", note: "A deep blue frame with a water motif" },
  { id: "modern", name: "Modern", note: "A teal side band, clean and left aligned" },
  { id: "minimal", name: "Minimal", note: "Quiet, with a lot of white space" },
] as const;

export const FONT_LINK = "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Great+Vibes&family=Montserrat:wght@300;400;500;600&family=Playfair+Display:wght@400;500;600&family=Libre+Baskerville:ital@0;1&family=EB+Garamond:ital@0;1&family=Inter:wght@400;500;600&display=swap";

export const SAMPLE: CertData = { name: "Abena Serwaa Mensah", date: "14 October 2026", place: "Grace Chapel, Accra", officiant: "Pastor Daniel Owusu", certificateNo: "BC-2026-001" };

const NAVY = "#1b2a41", GOLD = "#a6842f", TEAL = "#0d7377", INK = "#1c1a16", MUTED = "#6b6560";

/** A name too long for the line is made a little smaller. */
const nameSize = (n: string, base: number) => (n.length > 34 ? base * 0.62 : n.length > 26 ? base * 0.78 : n.length > 20 ? base * 0.9 : base);

const Cross = ({ size = 18, color = GOLD }: { size?: number; color?: string }) => (
  <svg width={size} height={size * 1.3} viewBox="0 0 20 26" aria-hidden="true"><path d="M8.6 0h2.8v7.6H20v2.8h-8.6V26H8.6V10.4H0V7.6h8.6z" fill={color} /></svg>
);

/** A line with a small cross in the middle. */
const Divider = ({ width = 90, color = GOLD }: { width?: number; color?: string }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "3mm", width: `${width}mm`, margin: "0 auto" }}>
    <span style={{ flex: 1, height: "0.25mm", background: `linear-gradient(90deg, transparent, ${color})` }} />
    <Cross size={5} color={color} />
    <span style={{ flex: 1, height: "0.25mm", background: `linear-gradient(270deg, transparent, ${color})` }} />
  </div>
);

/** One corner of an ornamental border; it is rotated for the other three. */
const Corner = ({ pos, color = NAVY, accent = GOLD }: { pos: "tl" | "tr" | "bl" | "br"; color?: string; accent?: string }) => {
  const rot = { tl: 0, tr: 90, br: 180, bl: 270 }[pos];
  const place: CSSProperties = { position: "absolute", width: "26mm", height: "26mm", transform: `rotate(${rot}deg)`, ...(pos.includes("t") ? { top: "5mm" } : { bottom: "5mm" }), ...(pos.includes("l") ? { left: "5mm" } : { right: "5mm" }) };
  return (
    <svg style={place} viewBox="0 0 100 100" aria-hidden="true">
      <path d="M2 2 H60 M2 2 V60" stroke={color} strokeWidth="2.2" fill="none" />
      <path d="M9 9 H48 M9 9 V48" stroke={accent} strokeWidth="1" fill="none" />
      <path d="M2 2 C28 4 44 20 46 46 C20 44 4 28 2 2z" fill="none" stroke={color} strokeWidth="0.8" />
      <circle cx="15" cy="15" r="3.2" fill={accent} />
    </svg>
  );
};

const Logo = ({ ctx, h = 20 }: { ctx: CertCtx; h?: number }) =>
  ctx.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={ctx.logoUrl} alt="" style={{ height: `${h}mm`, maxWidth: "60mm", objectFit: "contain", display: "block", margin: "0 auto" }} />
  ) : (
    <div style={{ display: "grid", placeItems: "center", height: `${h}mm` }}><Cross size={h * 0.7} /></div>
  );

const SignLines = ({ ctx, color = INK, line = NAVY, align = "center" }: { ctx: CertCtx; color?: string; line?: string; align?: "center" | "left" }) => {
  const s = ctx.settings;
  const block = (label: string, name: string) => (
    <div style={{ width: "62mm", textAlign: align }}>
      <div style={{ height: "0.3mm", background: line, marginBottom: "1.6mm" }} />
      {name && <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "12.5pt", fontWeight: 600, color }}>{name}</div>}
      <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "6.8pt", letterSpacing: "0.22em", textTransform: "uppercase", color: MUTED }}>{label}</div>
    </div>
  );
  return (
    <div style={{ display: "flex", justifyContent: align === "left" ? "flex-start" : "space-between", gap: "20mm", width: "100%" }}>
      {s.signer1 && block(s.signer1, s.signer1Name)}
      {s.signer2 && block(s.signer2, s.signer2Name)}
    </div>
  );
};

const Details = ({ d, color = INK, label = MUTED, line = NAVY }: { d: CertData; color?: string; label?: string; line?: string }) => {
  const cell = (k: string, v: string) => (
    <div style={{ textAlign: "center", minWidth: "50mm" }}>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "15pt", fontWeight: 500, color, borderBottom: `0.25mm solid ${line}`, padding: "0 3mm 1mm" }}>{v || " "}</div>
      <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "6.5pt", letterSpacing: "0.22em", textTransform: "uppercase", color: label, marginTop: "1.4mm" }}>{k}</div>
    </div>
  );
  return <div style={{ display: "flex", justifyContent: "center", gap: "12mm" }}>{cell("Date", d.date)}{cell("Place", d.place)}</div>;
};

function Page({ children, bg = "#ffffff" }: { children: ReactNode; bg?: string }) {
  return <div className="cert-page" style={{ position: "relative", width: "297mm", height: "210mm", overflow: "hidden", background: bg, boxSizing: "border-box" }}>{children}</div>;
}

/* ───────────────────────── 1. Classic ───────────────────────── */
function Classic({ d, ctx }: { d: CertData; ctx: CertCtx }) {
  const s = ctx.settings;
  return (
    <Page>
      <div style={{ position: "absolute", inset: "7mm", border: `0.9mm solid ${NAVY}` }} />
      <div style={{ position: "absolute", inset: "10.5mm", border: `0.25mm solid ${GOLD}` }} />
      {(["tl", "tr", "bl", "br"] as const).map((p) => <Corner key={p} pos={p} />)}
      <div style={{ position: "absolute", inset: "17mm 30mm 15mm", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <Logo ctx={ctx} h={19} />
        <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "7pt", letterSpacing: "0.34em", textTransform: "uppercase", color: MUTED, marginTop: "2.5mm" }}>{ctx.churchName}</div>
        <h1 style={{ fontFamily: "'Cinzel', serif", fontWeight: 600, fontSize: "31pt", letterSpacing: "0.12em", color: NAVY, margin: "5mm 0 3mm", textTransform: "uppercase" }}>{s.heading}</h1>
        <Divider />
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "14pt", color: MUTED, marginTop: "6mm" }}>This is to certify that</div>
        <div style={{ fontFamily: "'Great Vibes', cursive", fontSize: `${nameSize(d.name, 50)}pt`, color: GOLD, lineHeight: 1.1, margin: "2mm 0 1mm", borderBottom: `0.3mm solid ${NAVY}`, padding: "0 12mm 1mm", minWidth: "150mm" }}>{d.name}</div>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "15pt", color: INK, maxWidth: "190mm", marginTop: "3mm", lineHeight: 1.35 }}>{s.statement}</div>
        <div style={{ marginTop: "7mm" }}><Details d={d} /></div>
        {s.scripture && <div style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "10.5pt", color: MUTED, maxWidth: "175mm", marginTop: "6mm", lineHeight: 1.35 }}>{s.scripture}</div>}
        <div style={{ marginTop: "auto", width: "100%" }}><SignLines ctx={ctx} /></div>
        {d.officiant && <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "9.5pt", color: MUTED, marginTop: "3mm" }}>Baptised by {d.officiant}</div>}
      </div>
      {d.certificateNo && <div style={{ position: "absolute", bottom: "12.5mm", right: "16mm", fontFamily: "'Montserrat', sans-serif", fontSize: "6.5pt", letterSpacing: "0.18em", color: MUTED }}>No. {d.certificateNo}</div>}
    </Page>
  );
}

/* ───────────────────────── 2. Heritage ───────────────────────── */
function Heritage({ d, ctx }: { d: CertData; ctx: CertCtx }) {
  const s = ctx.settings;
  const BLUE = "#12315a";
  return (
    <Page>
      <div style={{ position: "absolute", inset: 0, border: `10mm solid ${BLUE}`, boxSizing: "border-box" }} />
      <div style={{ position: "absolute", inset: "12.5mm", border: `0.35mm solid ${GOLD}` }} />
      <div style={{ position: "absolute", inset: "14.5mm", border: `0.2mm solid ${BLUE}` }} />
      {/* water waves along the bottom */}
      <svg style={{ position: "absolute", left: "16mm", right: "16mm", bottom: "16mm", width: "265mm", height: "17mm" }} viewBox="0 0 265 17" preserveAspectRatio="none" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <path key={i} d={`M0 ${5 + i * 4.5} ${Array.from({ length: 22 }, (_, k) => `q 3 ${k % 2 ? 3 : -3} 6 0`).join(" ")} t 6 0 t 6 0 t 6 0 t 6 0`} fill="none" stroke={i === 1 ? GOLD : BLUE} strokeWidth={i === 1 ? 0.5 : 0.35} opacity={i === 1 ? 1 : 0.55} />
        ))}
      </svg>
      <div style={{ position: "absolute", inset: "21mm 34mm 38mm", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <Logo ctx={ctx} h={17} />
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 500, fontSize: "30pt", color: BLUE, margin: "4mm 0 1mm" }}>{s.heading}</h1>
        <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "7pt", letterSpacing: "0.34em", textTransform: "uppercase", color: GOLD }}>{ctx.churchName}</div>
        <div style={{ marginTop: "5mm" }}><Divider color={GOLD} /></div>
        <div style={{ fontFamily: "'Libre Baskerville', serif", fontStyle: "italic", fontSize: "11.5pt", color: MUTED, marginTop: "5.5mm" }}>presented to</div>
        <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 500, fontSize: `${nameSize(d.name, 38)}pt`, color: BLUE, lineHeight: 1.15, margin: "2mm 0", minWidth: "140mm", borderBottom: `0.3mm solid ${GOLD}`, paddingBottom: "1.5mm" }}>{d.name}</div>
        <div style={{ fontFamily: "'Libre Baskerville', serif", fontSize: "11.5pt", color: INK, maxWidth: "180mm", marginTop: "3mm", lineHeight: 1.5 }}>{s.statement}</div>
        <div style={{ marginTop: "6mm" }}><Details d={d} line={GOLD} /></div>
        {s.scripture && <div style={{ fontFamily: "'Libre Baskerville', serif", fontStyle: "italic", fontSize: "8.5pt", color: MUTED, maxWidth: "170mm", marginTop: "5mm", lineHeight: 1.45 }}>{s.scripture}</div>}
        <div style={{ marginTop: "auto", width: "100%" }}><SignLines ctx={ctx} line={BLUE} /></div>
      </div>
      {d.certificateNo && <div style={{ position: "absolute", bottom: "17mm", left: "50%", transform: "translateX(-50%)", fontFamily: "'Montserrat', sans-serif", fontSize: "6.5pt", letterSpacing: "0.2em", color: MUTED, background: "#fff", padding: "0 3mm" }}>No. {d.certificateNo}</div>}
    </Page>
  );
}

/* ───────────────────────── 3. Modern ───────────────────────── */
function Modern({ d, ctx }: { d: CertData; ctx: CertCtx }) {
  const s = ctx.settings;
  return (
    <Page>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "62mm", background: TEAL }} />
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "62mm", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", padding: "20mm 8mm 18mm", color: "#fff", textAlign: "center" }}>
        <div style={{ background: "#fff", borderRadius: "50%", width: "36mm", height: "36mm", display: "grid", placeItems: "center", overflow: "hidden" }}>
          {ctx.logoUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={ctx.logoUrl} alt="" style={{ width: "28mm", height: "28mm", objectFit: "contain" }} /> : <Cross size={16} color={TEAL} />}
        </div>
        <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "9pt", letterSpacing: "0.22em", textTransform: "uppercase", lineHeight: 1.7, fontWeight: 500 }}>{ctx.churchName}</div>
        <svg width="26" height="40" viewBox="0 0 26 40" aria-hidden="true"><path d="M13 2 C13 2 3 16 3 26 a10 10 0 0 0 20 0 C23 16 13 2 13 2z" fill="none" stroke="#fff" strokeWidth="1.4" /></svg>
      </div>
      <div style={{ position: "absolute", left: "62mm", right: 0, top: 0, bottom: 0, padding: "24mm 28mm 18mm 26mm", display: "flex", flexDirection: "column" }}>
        <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "8pt", letterSpacing: "0.38em", textTransform: "uppercase", color: TEAL, fontWeight: 600 }}>{s.heading}</div>
        <div style={{ width: "18mm", height: "0.8mm", background: TEAL, margin: "4mm 0 10mm" }} />
        <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "9pt", color: MUTED, letterSpacing: "0.06em" }}>This certifies that</div>
        <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 500, fontSize: `${nameSize(d.name, 40)}pt`, color: INK, lineHeight: 1.12, margin: "3mm 0 5mm" }}>{d.name}</div>
        <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "10.5pt", color: INK, lineHeight: 1.65, maxWidth: "150mm", fontWeight: 300 }}>{s.statement}</div>
        <div style={{ display: "flex", gap: "16mm", marginTop: "10mm" }}>
          {[["Date", d.date], ["Place", d.place], ["Baptised by", d.officiant]].map(([k, v]) => v && (
            <div key={k}>
              <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "6.5pt", letterSpacing: "0.22em", textTransform: "uppercase", color: TEAL, fontWeight: 600 }}>{k}</div>
              <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "11pt", color: INK, marginTop: "1.5mm" }}>{v}</div>
            </div>
          ))}
        </div>
        {s.scripture && <div style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontSize: "9pt", color: MUTED, maxWidth: "150mm", marginTop: "9mm", lineHeight: 1.5 }}>{s.scripture}</div>}
        <div style={{ marginTop: "auto" }}><SignLines ctx={ctx} align="left" line={TEAL} /></div>
        {d.certificateNo && <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "6.5pt", letterSpacing: "0.18em", color: MUTED, marginTop: "5mm" }}>No. {d.certificateNo}</div>}
      </div>
    </Page>
  );
}

/* ───────────────────────── 4. Minimal ───────────────────────── */
function Minimal({ d, ctx }: { d: CertData; ctx: CertCtx }) {
  const s = ctx.settings;
  return (
    <Page>
      <div style={{ position: "absolute", inset: "11mm", border: `0.3mm solid ${INK}` }} />
      <div style={{ position: "absolute", inset: "18mm 36mm 20mm", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <Logo ctx={ctx} h={14} />
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: "20pt", letterSpacing: "0.3em", color: INK, margin: "9mm 0 3mm", textTransform: "uppercase" }}>{s.heading.replace(/^Certificate of /i, "")}</div>
        <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "7pt", letterSpacing: "0.5em", textTransform: "uppercase", color: MUTED }}>Certificate</div>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 500, fontSize: `${nameSize(d.name, 46)}pt`, color: INK, lineHeight: 1.1, margin: "16mm 0 4mm" }}>{d.name}</div>
        <div style={{ width: "30mm", height: "0.3mm", background: INK, margin: "0 auto 6mm" }} />
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "14pt", color: INK, maxWidth: "170mm", lineHeight: 1.45 }}>{s.statement}</div>
        {s.scripture && <div style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "10pt", color: MUTED, maxWidth: "160mm", marginTop: "8mm", lineHeight: 1.4 }}>{s.scripture}</div>}
        <div style={{ marginTop: "auto", width: "100%", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "10mm" }}>
          {[["Date", d.date], ["Place", d.place], ["Officiant", d.officiant]].map(([k, v]) => (
            <div key={k} style={{ flex: 1 }}>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "13pt", color: INK, borderBottom: `0.25mm solid ${INK}`, paddingBottom: "1mm" }}>{v || " "}</div>
              <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "6.2pt", letterSpacing: "0.26em", textTransform: "uppercase", color: MUTED, marginTop: "1.4mm" }}>{k}</div>
            </div>
          ))}
        </div>
        <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "6.2pt", letterSpacing: "0.2em", color: MUTED, marginTop: "7mm", width: "100%", display: "flex", justifyContent: "space-between" }}>
          <span>{ctx.churchName}</span><span>{d.certificateNo ? `No. ${d.certificateNo}` : ""}</span>
        </div>
      </div>
    </Page>
  );
}

/* ───────────────────────── The church's own design ───────────────────────── */
function Custom({ t, d, ctx }: { t: Pick<TemplateRow, "imageUrl" | "paper" | "fields">; d: CertData; ctx: CertCtx }) {
  const portrait = t.paper === "a4-portrait";
  const value = (key: string) => ({ name: d.name, date: d.date, place: d.place, officiant: d.officiant, certificateNo: d.certificateNo, church: ctx.churchName })[key] ?? "";
  return (
    <div className="cert-page" style={{ position: "relative", width: portrait ? "210mm" : "297mm", height: portrait ? "297mm" : "210mm", overflow: "hidden", background: "#fff" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={t.imageUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill" }} />
      {t.fields.map((f: CertField) => (
        <div
          key={f.key}
          style={{
            position: "absolute", left: `${f.x}%`, top: `${f.y}%`, width: `${f.w}%`, transform: "translateY(-50%)",
            textAlign: f.align, fontFamily: `'${f.font}', serif`, fontSize: `${f.key === "name" ? nameSize(d.name, f.size) : f.size}pt`, color: f.color, fontWeight: f.bold ? 600 : 400, lineHeight: 1.15, whiteSpace: "nowrap",
          }}
        >
          {value(f.key)}
        </div>
      ))}
    </div>
  );
}

/** Draws one certificate: one of the four built-in designs, or the church's own uploaded one. */
export function Certificate({ design, custom, data, ctx }: { design: string; custom?: Pick<TemplateRow, "imageUrl" | "paper" | "fields"> | null; data: CertData; ctx: CertCtx }) {
  if (custom) return <Custom t={custom} d={data} ctx={ctx} />;
  switch (design) {
    case "heritage": return <Heritage d={data} ctx={ctx} />;
    case "modern": return <Modern d={data} ctx={ctx} />;
    case "minimal": return <Minimal d={data} ctx={ctx} />;
    default: return <Classic d={data} ctx={ctx} />;
  }
}
