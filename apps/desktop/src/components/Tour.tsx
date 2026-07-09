import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { createPortal } from "react-dom";
import { HelpCircle, X, ArrowLeft, ArrowRight, Check } from "lucide-react";

export interface TipStep {
  target: string;
  title: string;
  body: string;
}

interface TourApi {
  register: (tourId: string, steps: TipStep[]) => void;
  startCurrent: () => void;
  hasTips: boolean;
}

const TourContext = createContext<TourApi | null>(null);

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within <TourProvider>");
  return ctx;
}

const seenKey = (id: string) => `whq_tour_${id}`;

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [steps, setSteps] = useState<TipStep[]>([]);
  const [tourId, setTourId] = useState<string | null>(null);
  const [tourPath, setTourPath] = useState<string | null>(null);
  const [index, setIndex] = useState(-1);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const location = useLocation();
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  const register = useCallback((id: string, s: TipStep[]) => {
    setTourId(id);
    setSteps(s);
    setTourPath(pathRef.current);
    setIndex(-1);
  }, []);

  const onThisPage = tourPath === location.pathname;

  const startCurrent = useCallback(() => {
    if (steps.length) setIndex(0);
  }, [steps]);

  useEffect(() => {
    if (!tourId || steps.length === 0) return;
    if (localStorage.getItem(seenKey(tourId))) return;
    localStorage.setItem(seenKey(tourId), "1");
    const t = setTimeout(() => setIndex(0), 600);
    return () => clearTimeout(t);
  }, [tourId, steps]);

  const running = onThisPage && index >= 0 && index < steps.length;
  const step = running ? steps[index] : null;

  useLayoutEffect(() => {
    if (!step) {
      setRect(null);
      return;
    }
    function locate() {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step!.target}"]`);
      if (!el) { setRect(null); return; }
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setRect(el.getBoundingClientRect());
    }
    locate();
    const t = setTimeout(locate, 350);
    window.addEventListener("resize", locate);
    window.addEventListener("scroll", locate, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", locate);
      window.removeEventListener("scroll", locate, true);
    };
  }, [step]);

  const close = useCallback(() => setIndex(-1), []);
  const next = useCallback(() => setIndex((i) => (i + 1 >= steps.length ? -1 : i + 1)), [steps.length]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  return (
    <TourContext.Provider value={{ register, startCurrent, hasTips: onThisPage && steps.length > 0 }}>
      {children}

      {onThisPage && steps.length > 0 && !running && createPortal(
        <button
          onClick={startCurrent}
          className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-transform hover:-translate-y-0.5"
        >
          <HelpCircle className="size-4" /> Tips
        </button>,
        document.body,
      )}

      {running && step && createPortal(
        <Coachmark step={step} rect={rect} index={index} total={steps.length}
          onNext={next} onBack={back} onClose={close} />,
        document.body,
      )}
    </TourContext.Provider>
  );
}

function Coachmark({ step, rect, index, total, onNext, onBack, onClose }: {
  step: TipStep; rect: DOMRect | null; index: number; total: number;
  onNext: () => void; onBack: () => void; onClose: () => void;
}) {
  const isLast = index === total - 1;
  const pad = 12;
  let popStyle: React.CSSProperties;
  if (rect) {
    const below = rect.bottom + 170 < window.innerHeight;
    const left = Math.min(Math.max(rect.left, 16), window.innerWidth - 320 - 16);
    popStyle = below ? { top: rect.bottom + pad, left } : { top: Math.max(16, rect.top - 160), left };
  } else {
    popStyle = { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  }

  return (
    <div className="fixed inset-0 z-[95]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      {rect && (
        <div className="pointer-events-none absolute rounded-xl ring-4 ring-primary-bright transition-all"
          style={{
            top: rect.top - 6, left: rect.left - 6,
            width: rect.width + 12, height: rect.height + 12,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
          }} />
      )}
      <div className="absolute w-[320px] max-w-[calc(100vw-32px)] rounded-2xl border border-line bg-surface p-4 shadow-2xl animate-fade-up"
        style={popStyle}>
        <button onClick={onClose} className="absolute right-3 top-3 text-ink-faint hover:text-ink">
          <X className="size-4" />
        </button>
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-primary-bright">
          Tip {index + 1} of {total}
        </div>
        <h4 className="text-base font-semibold text-ink">{step.title}</h4>
        <p className="mt-1 text-sm text-ink-muted">{step.body}</p>
        <div className="mt-4 flex items-center justify-between">
          <button onClick={onBack} disabled={index === 0}
            className="flex items-center gap-1 text-sm text-ink-muted disabled:opacity-40">
            <ArrowLeft className="size-4" /> Back
          </button>
          <button onClick={onNext}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-white">
            {isLast ? <><Check className="size-4" /> Done</> : <>Next <ArrowRight className="size-4" /></>}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PageTips({ tourId, steps }: { tourId: string; steps: TipStep[] }) {
  const { register } = useTour();
  useEffect(() => { register(tourId, steps); }, [tourId]);
  return null;
}
