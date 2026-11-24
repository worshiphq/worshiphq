import Link from "@/components/ui/app-link";
import { DismissibleNotice } from "@/components/app/dismissible-notice";
import type { PlanId } from "@/lib/plan-gate";
import { windowEnd, windowLive, withStepUp, type Promotions } from "@/lib/promotions";

const label = (p: string) => p.charAt(0).toUpperCase() + p.slice(1);

/**
 * The December gift notice: shown while the SuperAdmin plan step-up promotion runs. Says what this church gets
 * (the next plan up, and WorshipHQ Live free on paid plans) and that billing does not change. Closable.
 */
export function ChristmasBanner({ paid, promotions, canBuy }: { paid: PlanId; promotions: Promotions; canBuy: boolean }) {
  const stepUp = windowLive(promotions.stepUp);
  const liveFree = windowLive(promotions.mediaFree) && paid !== "free";
  if (!stepUp && !liveFree) return null;

  const lifted = withStepUp(paid, promotions);
  const end = windowEnd(stepUp ? promotions.stepUp : promotions.mediaFree);
  const until = end ? end.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }) : "the end of the month";
  const year = new Date().getUTCFullYear();

  const upgraded = stepUp && lifted !== paid;
  const headline = upgraded
    ? `Your church has been upgraded to ${label(lifted)}, free for all of December.`
    : liveFree
      ? "WorshipHQ Live is free for your church all of December."
      : "Thank you for being with WorshipHQ this year.";
  const second = upgraded && liveFree ? "Plus, WorshipHQ Live, our new church presentation app, is free for you too." : null;

  return (
    <DismissibleNotice id={`christmas-${year}`} className="mb-4">
      <div role="status" className="whq-xmas relative isolate overflow-hidden rounded-2xl text-white shadow-lg">
        <style>{CSS}</style>
        {/* Snow */}
        <div aria-hidden className="whq-snow pointer-events-none absolute inset-0 -z-10">
          {FLAKES.map((f, i) => (
            <span key={i} style={{ left: `${f.x}%`, width: f.s, height: f.s, animationDuration: `${f.d}s`, animationDelay: `-${f.o}s`, opacity: f.a }} />
          ))}
        </div>

        <div className="flex items-stretch gap-4">
          <div className="min-w-0 flex-1 py-5 pl-5 pr-2 sm:pl-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-200/90">Merry Christmas from WorshipHQ</p>
            <h2 className="mt-1 font-display text-xl font-bold leading-snug sm:text-2xl">
              {headline}
            </h2>
            {second && <p className="mt-1 text-[15px] font-semibold text-amber-100">{second}</p>}
            <p className="mt-2 max-w-2xl text-sm text-white/80">
              {!upgraded && liveFree && <>Our new church presentation app: songs, Bible verses and the voice assistant on your church screen. </>}
              Everything stays on until {until}.{" "}
              {paid !== "free"
                ? <>You keep paying for {label(paid)} as normal; nothing extra is charged.</>
                : <>Nothing to pay and nothing to switch on.</>}
              {stepUp && lifted !== paid && <> On {new Date(end ? end.getTime() + 86_400_000 : Date.now()).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })} your church goes back to {label(paid)}.</>}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {canBuy && stepUp && lifted !== paid && (
                <Link href="/app/settings?tab=billing" className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-emerald-900 shadow-sm hover:bg-amber-50">
                  Keep {label(lifted)} after December
                </Link>
              )}
              {liveFree && (
                <a href="/api/media/download" className="rounded-lg border border-white/30 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10">
                  Get WorshipHQ Live
                </a>
              )}
            </div>
          </div>
          <Tree />
        </div>
      </div>
    </DismissibleNotice>
  );
}

/** Snowflakes: fixed positions so the server and the browser draw the same thing. */
const FLAKES = Array.from({ length: 28 }, (_, i) => {
  const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
  return { x: Math.round(r(1) * 100), s: 2 + Math.round(r(2) * 3), d: 7 + Math.round(r(3) * 8), o: Math.round(r(4) * 12), a: 0.35 + r(5) * 0.5 };
});

const LIGHTS = [
  { x: 60, y: 44, c: "#fde68a" }, { x: 47, y: 58, c: "#fca5a5" }, { x: 72, y: 62, c: "#93c5fd" },
  { x: 40, y: 82, c: "#fde68a" }, { x: 58, y: 88, c: "#f9a8d4" }, { x: 80, y: 86, c: "#fde68a" },
  { x: 33, y: 108, c: "#93c5fd" }, { x: 52, y: 114, c: "#fde68a" }, { x: 70, y: 110, c: "#fca5a5" }, { x: 88, y: 112, c: "#93c5fd" },
];

function Tree() {
  return (
    <svg aria-hidden viewBox="0 0 150 150" className="mr-2 hidden h-[170px] w-[170px] shrink-0 self-end sm:block" role="img">
      <defs>
        <linearGradient id="xmas-leaf" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#34d399" />
          <stop offset="1" stopColor="#047857" />
        </linearGradient>
        <linearGradient id="xmas-leaf-dark" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#065f46" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#065f46" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="xmas-glow">
          <stop offset="0" stopColor="#fde68a" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fde68a" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Snow on the ground */}
      <ellipse cx="65" cy="143" rx="62" ry="7" fill="#fff" opacity="0.9" />
      {/* Trunk */}
      <rect x="58" y="122" width="14" height="16" rx="2" fill="#7c4a24" />
      {/* Three tiers, each with a shaded left side */}
      {[
        "M65 28 L90 64 L78 62 L100 92 L30 92 L52 62 L40 64 Z",
        "M65 52 L98 92 L84 90 L108 122 L22 122 L46 90 L32 92 Z",
      ].map((d, i) => (
        <g key={i}>
          <path d={d} fill="url(#xmas-leaf)" stroke="#065f46" strokeWidth="1.2" strokeLinejoin="round" />
          <path d={d} fill="url(#xmas-leaf-dark)" />
        </g>
      ))}
      <path d="M65 20 L84 46 L46 46 Z" fill="url(#xmas-leaf)" stroke="#065f46" strokeWidth="1.2" strokeLinejoin="round" />
      {/* Garlands */}
      <path d="M48 56 Q65 66 82 54" fill="none" stroke="#fef3c7" strokeWidth="1.4" strokeDasharray="2 3" opacity="0.9" />
      <path d="M38 84 Q66 98 94 82" fill="none" stroke="#fef3c7" strokeWidth="1.4" strokeDasharray="2 3" opacity="0.9" />
      <path d="M30 112 Q66 128 102 110" fill="none" stroke="#fef3c7" strokeWidth="1.4" strokeDasharray="2 3" opacity="0.9" />
      {/* Twinkling lights */}
      {LIGHTS.map((l, i) => (
        <circle key={i} className="whq-light" cx={l.x} cy={l.y} r="3.2" fill={l.c} style={{ animationDelay: `${(i * 0.37) % 2.4}s` }} />
      ))}
      {/* Star with glow */}
      <circle cx="65" cy="17" r="14" fill="url(#xmas-glow)" className="whq-glow" />
      <path d="M65 6 L68.2 13.6 L76.4 14.3 L70.2 19.6 L72.1 27.6 L65 23.4 L57.9 27.6 L59.8 19.6 L53.6 14.3 L61.8 13.6 Z" fill="#fcd34d" stroke="#f59e0b" strokeWidth="0.8" />
      {/* Presents */}
      <g>
        <rect x="88" y="124" width="20" height="16" rx="2" fill="#dc2626" />
        <rect x="96" y="124" width="4" height="16" fill="#fde68a" />
        <rect x="88" y="129" width="20" height="3.5" fill="#fde68a" />
        <path d="M98 124 q-6 -7 -9 -2 q3 3 9 2 q6 1 9 -2 q-3 -5 -9 2" fill="#fde68a" />
        <rect x="111" y="130" width="15" height="11" rx="2" fill="#2563eb" />
        <rect x="117" y="130" width="3" height="11" fill="#e0e7ff" />
        <rect x="24" y="129" width="17" height="12" rx="2" fill="#f59e0b" />
        <rect x="31" y="129" width="3" height="12" fill="#fff7ed" />
      </g>
    </svg>
  );
}

const CSS = `
.whq-xmas { background:
  radial-gradient(120% 140% at 100% 0%, rgba(253,230,138,.18), transparent 45%),
  radial-gradient(90% 120% at 0% 100%, rgba(220,38,38,.35), transparent 55%),
  linear-gradient(135deg, #064e3b 0%, #065f46 45%, #7f1d1d 130%); }
.whq-snow span { position:absolute; top:-8px; border-radius:9999px; background:#fff; animation-name: whq-fall; animation-timing-function: linear; animation-iteration-count: infinite; }
@keyframes whq-fall { from { transform: translate3d(0,-10px,0); } to { transform: translate3d(14px,220px,0); } }
.whq-light { animation: whq-twinkle 2.4s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
@keyframes whq-twinkle { 0%,100% { opacity:1; transform: scale(1); } 50% { opacity:.35; transform: scale(.75); } }
.whq-glow { animation: whq-pulse 3s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
@keyframes whq-pulse { 0%,100% { opacity:.9; transform: scale(1); } 50% { opacity:.5; transform: scale(1.18); } }
@media (prefers-reduced-motion: reduce) { .whq-snow span, .whq-light, .whq-glow { animation: none; } .whq-snow { display:none; } }
`;
