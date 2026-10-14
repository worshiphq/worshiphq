"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Certificate, FONT_LINK, type CertCtx, type CertData } from "@/components/app/certificate";
import type { TemplateRow } from "@/app/actions/baptisms";

/** Load the certificate fonts once. */
export function useCertFonts() {
  useEffect(() => {
    if (document.getElementById("cert-fonts")) return;
    const l = document.createElement("link");
    l.id = "cert-fonts";
    l.rel = "stylesheet";
    l.href = FONT_LINK;
    document.head.appendChild(l);
  }, []);
}

const PX_PER_MM = 96 / 25.4;

/** A certificate shrunk to fit its box (for choosing a design), still the real thing underneath. */
export function ScaledCert({ design, custom, data, ctx }: { design: string; custom?: Pick<TemplateRow, "imageUrl" | "paper" | "fields"> | null; data: CertData; ctx: CertCtx }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  const portrait = custom?.paper === "a4-portrait";
  const w = (portrait ? 210 : 297) * PX_PER_MM, h = (portrait ? 297 : 210) * PX_PER_MM;
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / w);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);
  return (
    <div ref={box} className="relative w-full overflow-hidden rounded-lg border border-line bg-white shadow-sm" style={{ height: h * scale }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        <Certificate design={design} custom={custom} data={data} ctx={ctx} />
      </div>
    </div>
  );
}

/**
 * Prints every certificate, one per page, on A4. The browser's print window opens; choose "Save as PDF" to keep a file.
 * Only the certificates are printed: the rest of the page is hidden while printing.
 */
export function PrintCertificates({ items, design, custom, ctx, onDone }: { items: CertData[]; design: string; custom?: Pick<TemplateRow, "imageUrl" | "paper" | "fields"> | null; ctx: CertCtx; onDone: () => void }) {
  // Only ever shown after a click, so the browser's document is always there.
  const host = typeof document !== "undefined" ? document.body : null;
  const portrait = custom?.paper === "a4-portrait";

  useEffect(() => {
    if (!host) return;
    let cancelled = false;
    const go = async () => {
      try { await document.fonts.ready; } catch { /* print anyway */ }
      // Pictures (the church logo, an uploaded design) must be loaded before the page is printed.
      await Promise.all([...document.querySelectorAll<HTMLImageElement>(".cert-print-root img")].map((i) => (i.complete ? Promise.resolve() : new Promise((r) => { i.onload = i.onerror = () => r(null); }))));
      await new Promise((r) => setTimeout(r, 350));
      if (cancelled) return;
      window.addEventListener("afterprint", onDone, { once: true });
      window.print();
    };
    void go();
    return () => { cancelled = true; };
  }, [host, onDone]);

  if (!host) return null;
  return createPortal(
    <div className="cert-print-root">
      <style>{`
        .cert-print-root { display: none; }
        @media print {
          body > *:not(.cert-print-root) { display: none !important; }
          .cert-print-root { display: block !important; }
          @page { size: ${portrait ? "A4 portrait" : "A4 landscape"}; margin: 0; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          .cert-print-root .cert-sheet { page-break-after: always; break-after: page; width: ${portrait ? "210mm" : "297mm"}; height: ${portrait ? "297mm" : "210mm"}; overflow: hidden; }
          .cert-print-root .cert-sheet:last-child { page-break-after: auto; break-after: auto; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
      {items.map((d, i) => (
        <div key={i} className="cert-sheet"><Certificate design={design} custom={custom} data={d} ctx={ctx} /></div>
      ))}
    </div>,
    host,
  );
}
