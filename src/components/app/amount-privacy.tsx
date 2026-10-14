"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

/** Pages that never hide amounts: settings and billing show the church's own plan prices and SMS credits. */
const EXCLUDED = ["/app/settings", "/app/account", "/app/messages", "/app/communications", "/app/docs"];

/** ₵150, GH₵1,200.50, GHS 300, $20, -₵45, ₵2.5k ... and "150 GHS". */
const MONEY = /-?(?:GH₵|GHS|GH¢|US\$|₵|\$)\s?\d[\d,]*(?:\.\d+)?(?:[kKmM]\b)?|-?\b\d[\d,]*(?:\.\d+)?\s?GHS\b/g;
const SKIP = new Set(["INPUT", "TEXTAREA", "SCRIPT", "STYLE", "SELECT", "OPTION"]);
const REVEAL_MS = 3 * 60 * 1000;
/** On the very first load the page arrives as server HTML that React is still hydrating; wait until it has settled. */
const FIRST_LOAD_WAIT_MS = 1200;
let booted = false;

const hasMoney = (v: string | null) => {
  if (!v) return false;
  MONEY.lastIndex = 0;
  const r = MONEY.test(v);
  MONEY.lastIndex = 0;
  return r;
};

/** React has finished hydrating an element once it has attached its internal fiber to it. */
function hydrated(el: Element | null): boolean {
  if (!el) return false;
  for (const k in el) if (k.startsWith("__reactFiber$")) return true;
  return false;
}

const skipped = (el: Element | null) => !el || SKIP.has(el.tagName) || !!el.closest("[data-no-mask]");

/** Put the real text back into every node we hid. */
function restoreNodes(map: Map<Text, string>) {
  for (const [node, text] of map) {
    if (node.isConnected) node.nodeValue = text;
  }
  map.clear();
}

/**
 * Money on screen shows as *** until someone taps the eye, so nobody can read it over a shoulder. It covers every
 * amount on the finance pages for everybody, owners included, and can be switched off in Settings. Amounts are
 * hidden in place and the real figures are put back when revealed, so every page works as before. A number is only
 * hidden after React has finished hydrating its element, so hiding never fights the page loading.
 */
export function AmountPrivacy({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const active = enabled && !EXCLUDED.some((p) => pathname === p || pathname.startsWith(p + "/"));
  // Revealing lasts for the current page only: moving to another page hides amounts again.
  const [revealedFor, setRevealedFor] = useState<string | null>(null);
  const revealed = revealedFor === pathname;
  const [found, setFound] = useState(0);
  const root = useRef<HTMLDivElement>(null);

  // Auto-hide again a few minutes after revealing.
  useEffect(() => {
    if (!revealed) return;
    const t = setTimeout(() => setRevealedFor(null), REVEAL_MS);
    return () => clearTimeout(t);
  }, [revealed]);

  // Hide (or show) amounts before the browser paints, and keep hiding anything that appears later.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const originals = new Map<Text, string>();
    const pending = new Set<Text>();
    let timer: ReturnType<typeof setInterval> | null = null;
    let giveUp: ReturnType<typeof setTimeout> | null = null;

    const settle = () => {
      if (pending.size === 0 && timer) { clearInterval(timer); timer = null; }
      if (pending.size === 0) el.dataset.amounts = "ready";
      setFound(originals.size);
    };
    const hide = (node: Text) => {
      const v = node.nodeValue ?? "";
      if (!hasMoney(v)) return;
      const parent = node.parentElement;
      if (skipped(parent)) return;
      if (!hydrated(parent)) { pending.add(node); return; }
      originals.set(node, v);
      node.nodeValue = v.replace(MONEY, "***");
    };
    const poll = () => {
      for (const n of [...pending]) {
        if (!n.isConnected) pending.delete(n);
        else if (hydrated(n.parentElement)) { pending.delete(n); hide(n); }
      }
      settle();
    };
    const ensurePolling = () => { if (pending.size > 0 && !timer) timer = setInterval(poll, 80); };
    const scan = (from: Node) => {
      if (from.nodeType === Node.TEXT_NODE) { hide(from as Text); return; }
      if (from.nodeType !== Node.ELEMENT_NODE) return;
      const walker = document.createTreeWalker(from, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = walker.nextNode())) hide(n as Text);
    };

    if (!active || revealed) {
      el.dataset.amounts = "ready";
      queueMicrotask(() => setFound(0));
      return;
    }

    let obs: MutationObserver | null = null;
    let starter: ReturnType<typeof setTimeout> | null = null;
    let go: (() => void) | null = null;
    const begin = () => {
      scan(el);
      ensurePolling();
      // If something never finishes hydrating, stop waiting after a while (the page stays usable).
      giveUp = setTimeout(() => { pending.clear(); settle(); }, 8000);
      settle();
      obs = new MutationObserver((records) => {
        for (const r of records) {
          if (r.type === "characterData") {
            const n = r.target as Text;
            // React rewrote a number we had hidden: remember the new real value and hide it again.
            if (hasMoney(n.nodeValue)) hide(n);
            else if (originals.has(n) && !(n.nodeValue ?? "").includes("***")) originals.delete(n);
          } else {
            r.addedNodes.forEach((added) => scan(added));
          }
        }
        ensurePolling();
        settle();
      });
      obs.observe(el, { subtree: true, childList: true, characterData: true });
    };

    // Later page changes are rendered in the browser, so they can be hidden straight away.
    if (booted) begin();
    else {
      go = () => { booted = true; starter = setTimeout(begin, FIRST_LOAD_WAIT_MS); };
      if (document.readyState === "complete") go();
      else window.addEventListener("load", go, { once: true });
    }
    return () => {
      if (go) window.removeEventListener("load", go);
      if (starter) clearTimeout(starter);
      obs?.disconnect();
      if (timer) clearInterval(timer);
      if (giveUp) clearTimeout(giveUp);
      restoreNodes(originals);
    };
  }, [active, revealed, pathname]);

  return (
    <>
      {/* Keep the page blank for a moment on first load, so the real numbers never flash before they are hidden. */}
      <style>{`[data-amounts="guard"]{visibility:hidden;animation:amounts-fallback 0s 6s forwards}@keyframes amounts-fallback{to{visibility:visible}}`}</style>
      <div ref={root} data-amounts={active ? "guard" : "ready"}>{children}</div>
      {active && (found > 0 || revealed) && (
        <button
          type="button"
          onClick={() => setRevealedFor((cur) => (cur === pathname ? null : pathname))}
          aria-pressed={revealed}
          title={revealed ? "Hide amounts" : "Show amounts"}
          className={cn(
            "fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold shadow-lg transition-colors",
            revealed ? "border-gold/40 bg-gold-soft text-gold" : "border-line bg-surface text-ink hover:border-primary/50 hover:text-primary",
          )}
        >
          {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          {revealed ? "Hide amounts" : "Amounts hidden. Show"}
        </button>
      )}
    </>
  );
}
