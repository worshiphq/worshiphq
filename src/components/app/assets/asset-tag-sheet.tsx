"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

/**
 * An A4 sheet of 24 labels (3 x 8, 64 x 34 mm) for sticker paper. Black on white so any printer and any phone camera
 * reads the QR code. Same print approach as the ID card sheet: only the sheet is visible when printing.
 */
export function AssetTagSheet({ churchName, labels, untagged }: { churchName: string; labels: { id: string; name: string; tag: string; url: string }[]; untagged: number }) {
  return (
    <div>
      <style>{`
        .tg-sheet { display: grid; grid-template-columns: repeat(3, 64mm); grid-auto-rows: 34mm; gap: 0 2.5mm; justify-content: center; }
        .tg-label { box-sizing: border-box; width: 64mm; height: 34mm; border: 0.2mm dashed #c9c4b8; border-radius: 2mm; display: flex; align-items: center; gap: 2.5mm; padding: 2.5mm; background: #fff; color: #000; break-inside: avoid; page-break-inside: avoid; font-family: system-ui, sans-serif; }
        .tg-qr { flex: none; width: 27mm; height: 27mm; }
        .tg-info { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 1mm; }
        .tg-church { font-size: 2.3mm; text-transform: uppercase; letter-spacing: 0.25mm; color: #444; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
        .tg-name { font-size: 3.3mm; font-weight: 700; line-height: 1.15; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
        .tg-tag { font: 700 4mm ui-monospace, Menlo, Consolas, monospace; letter-spacing: 0.2mm; }
        @page { size: A4; margin: 10mm 8mm; }
        @media print {
          body * { visibility: hidden !important; }
          .tg-root, .tg-root * { visibility: visible !important; }
          .tg-root { position: absolute; left: 0; top: 0; width: 100%; }
          .tg-bar { display: none !important; }
          .tg-label { border-color: transparent; }
        }
      `}</style>
      <div className="tg-root">
        <div className="tg-bar mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
          <div>
            <Link href="/app/assets" className="mb-1 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"><ArrowLeft className="size-4" /> Back</Link>
            <p className="text-sm text-ink"><b>{labels.length}</b> label{labels.length === 1 ? "" : "s"} ready. 24 fit on each A4 sticker sheet (64 x 34 mm).</p>
            <p className="text-xs text-ink-faint">Print at 100% scale. Scanning a label with a phone opens the item in WorshipHQ.{untagged ? ` ${untagged} item${untagged === 1 ? " has" : "s have"} no tag yet; an admin can print to assign them.` : ""}</p>
          </div>
          <button type="button" onClick={() => window.print()} disabled={!labels.length} className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-50" style={{ background: "var(--color-primary)", color: "#fff" }}>
            <Printer className="size-4" /> Print tags
          </button>
        </div>
        <div className="tg-sheet">
          {labels.map((l) => (
            <div key={l.id} className="tg-label">
              <QRCodeSVG value={l.url} className="tg-qr" level="M" fgColor="#000000" bgColor="#ffffff" />
              <div className="tg-info">
                <span className="tg-church">{churchName}</span>
                <span className="tg-name">{l.name}</span>
                <span className="tg-tag">{l.tag}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
