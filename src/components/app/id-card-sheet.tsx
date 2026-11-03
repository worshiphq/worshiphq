"use client";

import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { hexToRgb } from "@/lib/color";

export type CardPerson = { id: string; name: string; memberId: string; photoUrl: string | null };

/** Black or white, whichever reads on the church's brand colour. (Never assume white on an unknown colour.) */
function inkOn(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#ffffff";
  const [r, g, b] = rgb;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? "#14120e" : "#ffffff";
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

/**
 * Printable member ID cards: credit-card size (85.6 x 54 mm), ten to an A4 page with cut gaps.
 *
 * The QR holds the member ID and nothing else, so it works with the check-in scanner the church already
 * has (which looks a person up by that ID). It is drawn black on white rather than in the brand colour,
 * because contrast is what makes a QR scan quickly on a cheap phone camera.
 *
 * The church logo is set ONCE as a CSS variable and every card reuses it. Putting the image into each card
 * would repeat a base64 logo hundreds of times and turn a 200-member print into a multi-megabyte page.
 */
export function IdCardSheet({
  church, people, backHref,
}: {
  church: { name: string; logoUrl: string | null; accent: string };
  people: CardPerson[];
  backHref: string;
}) {
  const ink = inkOn(church.accent);
  const logoVar = church.logoUrl ? { ["--logo" as string]: `url("${church.logoUrl.replace(/"/g, "%22")}")` } : {};

  return (
    <div className="id-root">
      <style>{`
        .id-sheet { display: grid; grid-template-columns: repeat(2, 85.6mm); gap: 6mm; justify-content: center; }
        .id-card { width: 85.6mm; height: 54mm; border-radius: 3.2mm; overflow: hidden; background: #fff; color: #14120e;
          border: 0.3mm solid #cfcabd; display: flex; flex-direction: column; break-inside: avoid; page-break-inside: avoid; font-family: system-ui, sans-serif; }
        .id-head { height: 11mm; display: flex; align-items: center; gap: 2.4mm; padding: 0 3.4mm; }
        .id-logo { width: 7.4mm; height: 7.4mm; border-radius: 1.4mm; background: #fff var(--logo) center / contain no-repeat; flex: none; }
        .id-church { font-size: 3.5mm; font-weight: 800; line-height: 1.1; letter-spacing: -0.1mm; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        .id-body { flex: 1; display: flex; align-items: center; gap: 3.2mm; padding: 0 3.4mm; }
        .id-photo { width: 21mm; height: 26mm; border-radius: 2mm; object-fit: cover; flex: none; background: #efe9dc; }
        .id-initials { width: 21mm; height: 26mm; border-radius: 2mm; flex: none; display: grid; place-items: center; font-size: 8mm; font-weight: 800; }
        .id-info { min-width: 0; flex: 1; }
        .id-name { font-size: 4.3mm; font-weight: 800; line-height: 1.12; letter-spacing: -0.15mm; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
        .id-no { margin-top: 1.6mm; font: 700 3.1mm ui-monospace, Menlo, Consolas, monospace; letter-spacing: 0.15mm; }
        .id-label { margin-top: 0.8mm; font-size: 2.2mm; text-transform: uppercase; letter-spacing: 0.35mm; color: #7a7466; }
        .id-qr { width: 20mm; height: 20mm; flex: none; }
        .id-foot { height: 2.2mm; flex: none; }
        @page { size: A4; margin: 10mm; }
        @media print {
          body * { visibility: hidden !important; }
          .id-root, .id-root * { visibility: visible !important; }
          .id-root { position: absolute; left: 0; top: 0; width: 100%; }
          .id-bar { display: none !important; }
          .id-card { border-color: #b9b3a3; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="id-bar mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
        <div>
          <Link href={backHref} className="mb-1 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
            <ArrowLeft className="size-4" /> Back
          </Link>
          <p className="text-sm text-ink">
            <b>{people.length}</b> card{people.length === 1 ? "" : "s"} ready. Ten fit on each A4 page, at real credit-card size.
          </p>
          <p className="text-xs text-ink-faint">In the print window, set &ldquo;Scale&rdquo; to 100% (not &ldquo;Fit to page&rdquo;) and turn on background graphics so the colours print.</p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:opacity-90"
          style={{ background: "var(--color-primary)", color: "#fff" }}
        >
          <Printer className="size-4" /> Print cards
        </button>
      </div>

      <div className="id-sheet" style={logoVar as React.CSSProperties}>
        {people.map((p) => (
          <div key={p.id} className="id-card">
            <div className="id-head" style={{ background: church.accent, color: ink }}>
              {church.logoUrl && <span className="id-logo" />}
              <span className="id-church">{church.name}</span>
            </div>
            <div className="id-body">
              {p.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="id-photo" src={p.photoUrl} alt="" />
              ) : (
                <span className="id-initials" style={{ background: church.accent, color: ink }}>{initials(p.name)}</span>
              )}
              <div className="id-info">
                <div className="id-name">{p.name}</div>
                <div className="id-no">{p.memberId}</div>
                <div className="id-label">Member</div>
              </div>
              <QRCodeSVG className="id-qr" value={p.memberId} level="M" fgColor="#000000" bgColor="#ffffff" marginSize={0} />
            </div>
            <div className="id-foot" style={{ background: church.accent }} />
          </div>
        ))}
      </div>
    </div>
  );
}
