"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Download, FileText, Loader2, Lock, Plus, Printer, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useFeedback } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { drawPoster, PAPER, PX_PER_MM, qrInk, type PaperKey, type PosterFont, type PosterStyle } from "@/lib/poster/draw";

export type PosterKind =
  | "member" | "visitor" | "children" | "teens" | "pray" | "testify" | "counsel" | "give" | "book" | "checkin";

export type PosterBrand = {
  name: string;
  accent: string;
  logo: string;
  /** Starter plan and up: the poster maker. Free churches see an upgrade note instead. */
  canMake: boolean;
  /** Max plan: the small "Made with WorshipHQ" line can be taken off. */
  canRemoveCredit: boolean;
};

/** Shown to Free churches when they tap Poster. The plain QR code stays free. */
export function PosterUpgrade({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="Poster maker is on Starter">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary"><Lock className="size-5" /></div>
        <h3 className="font-display text-lg font-semibold">The poster maker is on Starter</h3>
        <p className="mt-2 text-sm text-ink-muted">
          Design a poster with your church logo and colours, then print it or save it as a PDF. Your plain QR code stays free on every plan.
        </p>
        <div className="mt-5 flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Not now</Button>
          <a href="/app/settings?tab=billing" className="flex-1"><Button type="button" className="w-full">See plans</Button></a>
        </div>
      </div>
    </div>
  );
}

/** Starting words for each link. The church can change, hide or add to all of it. */
const COPY: Record<PosterKind, { headline: string; subline: string; file: string }> = {
  visitor: { headline: "Welcome! Scan to say hello", subline: "First time with us? Scan the code and fill in a short form. We would love to know you.", file: "visitor" },
  member: { headline: "Scan to join our church family", subline: "Register your details in under a minute so we can serve you better.", file: "member-registration" },
  children: { headline: "Children's registration", subline: "Parents and guardians, scan the code to register your child.", file: "children-registration" },
  teens: { headline: "Teens registration", subline: "Scan the code to register and choose where you will serve.", file: "teens-registration" },
  pray: { headline: "Need prayer? Scan here", subline: "Send your prayer request and our team will pray with you.", file: "prayer-requests" },
  testify: { headline: "Share your testimony", subline: "What has God done for you? Scan the code and tell us.", file: "testimonies" },
  counsel: { headline: "Request counselling", subline: "Scan the code to ask for a private conversation with a pastor or counsellor.", file: "counselling" },
  give: { headline: "Scan to give", subline: "Give your tithes and offerings with Mobile Money or card.", file: "giving" },
  book: { headline: "Book our hall", subline: "Scan the code to request a room or hall for your event.", file: "facility-booking" },
  checkin: { headline: "Scan to check in", subline: "Open your phone camera, scan the code, find your name and tap check in.", file: "check-in" },
};

const STYLES: { key: PosterStyle; label: string }[] = [
  { key: "classic", label: "Classic" },
  { key: "bold", label: "Bold" },
  { key: "minimal", label: "Minimal" },
];

const MAX_EXTRAS = 5;

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image failed"));
    img.src = src;
  });
}

function saveBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function printImage(dataUrl: string, wMm: number, hMm: number) {
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) { frame.remove(); return; }
  doc.open();
  doc.write(
    `<!doctype html><html><head><title>Poster</title><style>@page{size:${Math.round(wMm)}mm ${Math.round(hMm)}mm;margin:0}html,body{margin:0;padding:0}img{display:block;width:100%;height:auto}</style></head><body><img src="${dataUrl}"></body></html>`,
  );
  doc.close();
  const img = doc.querySelector("img");
  const go = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 60000);
  };
  if (img && !img.complete) img.onload = go; else go();
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-b border-line pb-5 last:border-0 last:pb-0">
      <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">{title}</h4>
      {children}
    </section>
  );
}

function Check({ checked, onChange, children, disabled }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <label className={cn("flex items-center gap-2 text-sm", disabled && "opacity-70")}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-primary" />
      {children}
    </label>
  );
}

/**
 * Design a printable QR poster for any church link. Everything on it is optional and editable:
 * pick a look, any paper size or a custom one, change or hide the words, add your own lines,
 * then print it or download it as a PDF or picture.
 */
export function PosterMaker({
  url, kind, brand, note, onClose,
}: {
  url: string;
  kind: PosterKind;
  brand: PosterBrand;
  /** A heads-up shown above the preview, for example that a check-in code belongs to one service. */
  note?: string;
  onClose: () => void;
}) {
  const { toast } = useFeedback();
  const copy = COPY[kind];

  const [style, setStyle] = useState<PosterStyle>("classic");
  const [font, setFont] = useState<PosterFont>("clean");
  const [paper, setPaper] = useState<PaperKey>("a4");
  const [landscape, setLandscape] = useState(false);
  const [customW, setCustomW] = useState("21");
  const [customH, setCustomH] = useState("29.7");

  const [showHeadline, setShowHeadline] = useState(true);
  const [headline, setHeadline] = useState(copy.headline);
  const [showMessage, setShowMessage] = useState(true);
  const [subline, setSubline] = useState(copy.subline);
  const [showSteps, setShowSteps] = useState(true);
  const [steps, setSteps] = useState(["Open your phone camera", "Point it at the code", "Tap the link that appears"]);
  const [extras, setExtras] = useState<string[]>([]);

  const [showName, setShowName] = useState(true);
  const [showLogo, setShowLogo] = useState(!!brand.logo);
  const [showUrl, setShowUrl] = useState(true);
  const [showCredit, setShowCredit] = useState(true);

  const [accent, setAccent] = useState(brand.accent || "#0d7377");
  const [customBg, setCustomBg] = useState(false);
  const [bg, setBg] = useState("#faf8f4");
  const [qrScale, setQrScale] = useState(85);
  const [textScale, setTextScale] = useState(100);

  const [busy, setBusy] = useState<"pdf" | "png" | "print" | null>(null);
  const [ready, setReady] = useState(false);
  const preview = useRef<HTMLCanvasElement>(null);
  const qrHost = useRef<HTMLDivElement>(null);
  const ink = useMemo(() => qrInk(accent), [accent]);

  // The paper size in millimetres
  const spec = PAPER.find((p) => p.key === paper) ?? PAPER[1];
  let wMm = spec.wMm;
  let hMm = spec.hMm;
  if (paper === "custom") {
    wMm = clamp(parseFloat(customW) || 21, 5, 100) * 10;
    hMm = clamp(parseFloat(customH) || 29.7, 5, 100) * 10;
  } else if (spec.turns && landscape) {
    [wMm, hMm] = [hMm, wMm];
  }

  const creditLocked = !brand.canRemoveCredit;
  const creditOn = creditLocked ? true : showCredit;

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  /** Everything the drawing needs that has to load first: the QR picture, the logo and the app font. */
  async function assets(withLogo = true) {
    const svg = qrHost.current?.querySelector("svg");
    if (!svg) throw new Error("no qr");
    const xml = new XMLSerializer().serializeToString(svg);
    const qr = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`);
    let logo: HTMLImageElement | null = null;
    if (withLogo && showLogo && brand.logo) {
      // A logo kept in image storage is loaded through our own address: the storage host does not allow a browser to
      // save a picture that contains an image from it, which is what made downloads fail.
      const src = brand.logo.startsWith("data:") ? brand.logo : `/api/church-logo?v=${encodeURIComponent(brand.logo.slice(-24))}`;
      try { logo = await loadImage(src); } catch { logo = null; }
    }
    const appFont = getComputedStyle(document.body).fontFamily || "sans-serif";
    try { await document.fonts.load(`800 40px ${appFont}`); await document.fonts.load(`500 24px ${appFont}`); } catch { /* use whatever is available */ }
    return { qr, logo, appFont };
  }

  const options = {
    wMm, hMm, style, font, accent,
    bg: customBg ? bg : null,
    churchName: brand.name, showName,
    showHeadline, headline, showMessage, subline,
    steps: showSteps ? steps : [],
    extras,
    showUrl, url, showCredit: creditOn,
    qrScale: qrScale / 100,
    textScale: textScale / 100,
  };

  // Live preview
  useEffect(() => {
    let stale = false;
    const t = setTimeout(async () => {
      try {
        const a = await assets();
        if (stale || !preview.current) return;
        drawPoster(preview.current, { ...options, ...a }, 0.6);
        setReady(true);
      } catch { /* the QR may not be in the page yet; the next change redraws */ }
    }, 120);
    return () => { stale = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wMm, hMm, style, font, accent, customBg, bg, brand.name, showName, showLogo, showHeadline, headline, showMessage, subline, showSteps, steps, extras, showUrl, creditOn, qrScale, textScale, url, brand.logo]);

  async function fullSize(withLogo = true) {
    const a = await assets(withLogo);
    const canvas = document.createElement("canvas");
    // 300 dpi, unless that would be bigger than phones can draw (about 16 million pixels)
    const scale = Math.min(2, Math.sqrt(16_000_000 / (wMm * PX_PER_MM * hMm * PX_PER_MM)));
    drawPoster(canvas, { ...options, ...a }, scale);
    return canvas;
  }

  const fileName = (ext: string) =>
    `${(brand.name || "church").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${copy.file}-poster.${ext}`;

  async function run(kindOfOutput: "pdf" | "png" | "print") {
    setBusy(kindOfOutput);
    try {
      const build = async (withLogo: boolean) => {
        const canvas = await fullSize(withLogo);
        if (kindOfOutput === "print") return { dataUrl: canvas.toDataURL("image/png"), blob: null as Blob | null };
        const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("no blob"))), "image/png"));
        return { dataUrl: "", blob };
      };
      let made: { dataUrl: string; blob: Blob | null };
      try {
        made = await build(true);
      } catch (e) {
        // A logo the browser will not let us save from: make the poster without it rather than failing.
        if (e instanceof DOMException && e.name === "SecurityError" && showLogo && brand.logo) {
          made = await build(false);
          toast("Saved without your logo because the browser could not read it.", "info");
        } else throw e;
      }
      if (kindOfOutput === "print") {
        printImage(made.dataUrl, wMm, hMm);
      } else {
        const blob = made.blob as Blob;
        if (kindOfOutput === "png") {
          saveBlob(blob, fileName("png"));
          toast("Picture downloaded", "success");
        } else {
          const { PDFDocument } = await import("pdf-lib");
          const pdf = await PDFDocument.create();
          const pw = (wMm * 72) / 25.4;
          const ph = (hMm * 72) / 25.4;
          const page = pdf.addPage([pw, ph]);
          const png = await pdf.embedPng(await blob.arrayBuffer());
          page.drawImage(png, { x: 0, y: 0, width: pw, height: ph });
          pdf.setTitle(`${brand.name} - ${headline}`);
          const bytes = await pdf.save();
          saveBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), fileName("pdf"));
          toast("PDF downloaded. Print it at home or take it to a print shop.", "success");
        }
      }
    } catch {
      toast("Could not make the poster. Please try again.", "error");
    } finally {
      setBusy(null);
    }
  }

  const pill = (on: boolean) =>
    cn("h-10 rounded-xl border px-2 text-sm font-medium transition-colors", on ? "border-primary bg-primary/10 text-primary" : "border-line text-ink-muted hover:bg-surface-2");

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-3 sm:p-6" onClick={onClose} role="dialog" aria-modal="true" aria-label="Poster maker">
      <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div>
            <h3 className="font-display text-lg font-semibold">Make a poster</h3>
            <p className="text-xs text-ink-muted">Change anything, hide what you do not need, add your own lines. Then print it or save it.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-faint hover:bg-surface-2" aria-label="Close"><X className="size-5" /></button>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto md:grid-cols-[minmax(0,23rem)_minmax(0,1fr)] md:overflow-hidden">
          {/* Controls */}
          <div className="space-y-5 border-b border-line p-5 md:overflow-y-auto md:border-b-0 md:border-r">
            <Section title="Look">
              <div className="grid grid-cols-3 gap-2">
                {STYLES.map((s) => (
                  <button key={s.key} type="button" onClick={() => setStyle(s.key)} aria-pressed={style === s.key} className={pill(style === s.key)}>{s.label}</button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setFont("clean")} aria-pressed={font === "clean"} className={pill(font === "clean")}>Clean letters</button>
                <button type="button" onClick={() => setFont("serif")} aria-pressed={font === "serif"} className={cn(pill(font === "serif"), "font-serif")}>Classic letters</button>
              </div>
            </Section>

            <Section title="Size">
              <div className="grid grid-cols-2 gap-2">
                {PAPER.map((p) => (
                  <button key={p.key} type="button" onClick={() => setPaper(p.key)} aria-pressed={paper === p.key} className={cn(pill(paper === p.key), "text-xs")}>{p.label}</button>
                ))}
              </div>
              {spec.turns && (
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setLandscape(false)} aria-pressed={!landscape} className={pill(!landscape)}>Upright</button>
                  <button type="button" onClick={() => setLandscape(true)} aria-pressed={landscape} className={pill(landscape)}>Sideways</button>
                </div>
              )}
              {paper === "custom" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="pm-w">Width (cm)</Label>
                    <Input id="pm-w" type="number" min={5} max={100} step="0.1" value={customW} onChange={(e) => setCustomW(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="pm-h">Height (cm)</Label>
                    <Input id="pm-h" type="number" min={5} max={100} step="0.1" value={customH} onChange={(e) => setCustomH(e.target.value)} />
                  </div>
                </div>
              )}
              <p className="text-xs text-ink-faint">{(wMm / 10).toFixed(1)} x {(hMm / 10).toFixed(1)} cm</p>
            </Section>

            <Section title="Words">
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <Label htmlFor="pm-headline" className="mb-0">Headline</Label>
                  <Check checked={showHeadline} onChange={setShowHeadline}>Show</Check>
                </div>
                <Input id="pm-headline" value={headline} maxLength={80} disabled={!showHeadline} onChange={(e) => setHeadline(e.target.value)} />
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <Label htmlFor="pm-sub" className="mb-0">Message under it</Label>
                  <Check checked={showMessage} onChange={setShowMessage}>Show</Check>
                </div>
                <Textarea id="pm-sub" rows={3} value={subline} maxLength={220} disabled={!showMessage} onChange={(e) => setSubline(e.target.value)} />
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <Label className="mb-0">How to scan steps</Label>
                  <Check checked={showSteps} onChange={setShowSteps}>Show</Check>
                </div>
                <div className="space-y-2">
                  {steps.map((s, i) => (
                    <Input key={i} value={s} maxLength={44} disabled={!showSteps} aria-label={`Step ${i + 1}`} placeholder="Leave empty to remove this step" onChange={(e) => setSteps((all) => all.map((x, j) => (j === i ? e.target.value : x)))} />
                  ))}
                </div>
              </div>
              <div>
                <Label className="mb-1.5">Your own lines</Label>
                <p className="mb-2 text-xs text-ink-faint">Service times, address, phone number, anything you want on the poster.</p>
                <div className="space-y-2">
                  {extras.map((x, i) => (
                    <div key={i} className="flex gap-2">
                      <Input value={x} maxLength={90} aria-label={`Line ${i + 1}`} placeholder="Sundays 8am and 10am" onChange={(e) => setExtras((all) => all.map((y, j) => (j === i ? e.target.value : y)))} />
                      <Button type="button" variant="ghost" size="icon" aria-label="Remove this line" onClick={() => setExtras((all) => all.filter((_, j) => j !== i))}><Trash2 /></Button>
                    </div>
                  ))}
                </div>
                {extras.length < MAX_EXTRAS && (
                  <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={() => setExtras((all) => [...all, ""])}>
                    <Plus /> Add a line
                  </Button>
                )}
              </div>
            </Section>

            <Section title="Show or hide">
              <div className="space-y-2.5">
                <Check checked={showName} onChange={setShowName}>Church name</Check>
                {brand.logo && <Check checked={showLogo} onChange={setShowLogo}>Church logo</Check>}
                <Check checked={showUrl} onChange={setShowUrl}>Web address under the code</Check>
                <Check checked={creditOn} onChange={setShowCredit} disabled={creditLocked}>
                  <span className="flex items-center gap-1.5">
                    Small "Made with WorshipHQ" line
                    {creditLocked && <Lock className="size-3.5 text-ink-faint" aria-hidden />}
                  </span>
                </Check>
                {creditLocked && (
                  <p className="pl-6 text-xs text-ink-faint">You can take this line off with the Max plan.</p>
                )}
              </div>
            </Section>

            <Section title="Colours and sizes">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <input id="pm-color" type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-10 w-14 cursor-pointer rounded-lg border border-line bg-surface p-1" aria-label="Main colour" />
                  <Label htmlFor="pm-color" className="mb-0">Main colour</Label>
                </div>
                <button type="button" onClick={() => setAccent(brand.accent || "#0d7377")} className="text-xs font-medium text-primary hover:underline">Use my church colour</button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Check checked={customBg} onChange={setCustomBg}>Choose the paper colour</Check>
                {customBg && <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="h-9 w-12 cursor-pointer rounded-lg border border-line bg-surface p-1" aria-label="Paper colour" />}
              </div>
              <div>
                <div className="flex items-center justify-between text-sm"><Label htmlFor="pm-qr" className="mb-0">Code size</Label><span className="text-xs text-ink-faint">{qrScale}%</span></div>
                <input id="pm-qr" type="range" min={40} max={100} value={qrScale} onChange={(e) => setQrScale(Number(e.target.value))} className="mt-1 w-full accent-primary" />
              </div>
              <div>
                <div className="flex items-center justify-between text-sm"><Label htmlFor="pm-ts" className="mb-0">Text size</Label><span className="text-xs text-ink-faint">{textScale}%</span></div>
                <input id="pm-ts" type="range" min={70} max={140} value={textScale} onChange={(e) => setTextScale(Number(e.target.value))} className="mt-1 w-full accent-primary" />
              </div>
            </Section>
          </div>

          {/* Preview and actions */}
          <div className="flex min-h-[26rem] flex-col gap-4 bg-surface-2/40 p-5 md:overflow-y-auto">
            {note && <div className="rounded-xl border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-xs text-ink-muted">{note}</div>}
            <div className="relative grid flex-1 place-items-center">
              <canvas
                ref={preview}
                className={cn("h-auto max-h-[60vh] w-auto max-w-full rounded-lg shadow-lg ring-1 ring-black/10 transition-opacity", ready ? "opacity-100" : "opacity-0")}
                aria-label="Poster preview"
              />
              {!ready && <Loader2 className="absolute size-6 animate-spin text-ink-faint" />}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => run("pdf")} disabled={!!busy || !ready}>
                {busy === "pdf" ? <><Loader2 className="animate-spin" /> Preparing PDF…</> : <><FileText /> Download PDF</>}
              </Button>
              <Button type="button" variant="secondary" onClick={() => run("png")} disabled={!!busy || !ready}>
                {busy === "png" ? <><Loader2 className="animate-spin" /> Preparing…</> : <><Download /> Picture (PNG)</>}
              </Button>
              <Button type="button" variant="secondary" onClick={() => run("print")} disabled={!!busy || !ready}>
                {busy === "print" ? <><Loader2 className="animate-spin" /> Opening print…</> : <><Printer /> Print</>}
              </Button>
            </div>
          </div>
        </div>

        {/* The QR picture the poster is built from (kept off screen) */}
        <div ref={qrHost} className="hidden" aria-hidden>
          <QRCodeSVG value={url} size={900} level="M" marginSize={0} fgColor={ink} bgColor="#ffffff" />
        </div>
      </div>
    </div>
  );
}
