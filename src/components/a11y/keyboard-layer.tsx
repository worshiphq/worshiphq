"use client";

import { useEffect } from "react";

/**
 * Keyboard support for every dialog, drawer and click-away menu in the site, in one place.
 *
 * The site has about thirty hand-built dialogs and drawers (a dark backdrop plus a panel). Rather than teach each one
 * the same four things, this layer watches for any full-screen fixed overlay and gives it:
 *   1. Escape closes the top one (by "clicking" its backdrop, exactly what a mouse user does).
 *   2. Focus moves inside when it opens, and goes back to the button that opened it when it closes.
 *   3. Tab and Shift+Tab stay inside a dimmed (modal) dialog instead of wandering onto the page behind it.
 *   4. The panel is announced as a dialog (role and name) to screen readers.
 * Anything that handles its own keys (a dropdown list, a menu) calls preventDefault on Escape, and is left alone.
 * Opt out with data-keyboard-ignore. The shared Modal marks itself data-esc="handled" because it closes itself on Escape.
 */

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

type Overlay = { el: HTMLElement; z: number; dim: boolean };
type Entry = { el: HTMLElement; opener: HTMLElement | null; modal: boolean; region: HTMLElement[] };

const visible = (el: HTMLElement) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
const focusables = (roots: HTMLElement[]) =>
  roots.flatMap((r) => [...r.querySelectorAll<HTMLElement>(FOCUSABLE)].concat(r.matches(FOCUSABLE) ? [r] : [])).filter((el) => visible(el) && !el.closest("[inert],[aria-hidden='true']"));

/** How opaque a computed CSS colour is, in any of the syntaxes a browser reports (rgb, rgba, color(), oklab()...). */
function alphaOf(color: string): number {
  if (!color || color === "transparent") return 0;
  const slash = /\/\s*([\d.]+)(%?)\s*\)/.exec(color);
  if (slash) return parseFloat(slash[1]) / (slash[2] ? 100 : 1);
  const comma = /^rgba\(([^)]+)\)$/.exec(color);
  if (comma) return parseFloat(comma[1].split(",")[3] ?? "1");
  return 1;
}

/** Every full-screen fixed layer that could be a backdrop or a dialog wrapper, lowest first. */
function findOverlays(): Overlay[] {
  const found: Overlay[] = [];
  document.querySelectorAll<HTMLElement>('[class*="inset-0"]').forEach((el) => {
    if (el.closest("[data-keyboard-ignore]")) return;
    const cs = getComputedStyle(el);
    if (cs.position !== "fixed" || cs.display === "none" || cs.visibility === "hidden" || cs.pointerEvents === "none") return;
    // Size is not checked: inside an element with a blur or transform, "fixed inset-0" is only as big as that element.
    if (el.getClientRects().length === 0) return;
    const z = parseInt(cs.zIndex, 10);
    if (!(z > 0)) return; // decorative full-screen layers sit behind the page, never above it
    const dim = alphaOf(cs.backgroundColor) > 0.05 || (!!cs.backdropFilter && cs.backdropFilter !== "none");
    found.push({ el, z, dim });
  });
  return found.sort((a, b) => a.z - b.z || (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
}

/** The panel(s) that belong to an overlay: itself if it holds controls (a wrapper), else the fixed siblings that follow it. */
function regionOf(el: HTMLElement): HTMLElement[] {
  if (el.querySelector(FOCUSABLE)) return [el];
  const panels: HTMLElement[] = [];
  for (let s = el.nextElementSibling as HTMLElement | null; s; s = s.nextElementSibling as HTMLElement | null) {
    if (getComputedStyle(s).position === "fixed") panels.push(s);
  }
  return panels;
}

function labelRegion(region: HTMLElement[]) {
  const root = region.find((r) => r.querySelector(FOCUSABLE)) ?? region[0];
  if (!root || root.dataset.dialogLabelled) return;
  root.dataset.dialogLabelled = "1";
  // The panel is the wrapper's first element child when the wrapper just centres it.
  const panel = root.children.length === 1 && root.firstElementChild instanceof HTMLElement && getComputedStyle(root).display.includes("grid") ? (root.firstElementChild as HTMLElement) : root;
  if (!panel.getAttribute("role")) panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  if (!panel.getAttribute("aria-label") && !panel.getAttribute("aria-labelledby")) {
    const h = panel.querySelector("h1, h2, h3, h4");
    if (h?.textContent?.trim()) panel.setAttribute("aria-label", h.textContent.trim().slice(0, 80));
  }
  if (!panel.hasAttribute("tabindex")) panel.setAttribute("tabindex", "-1");
}

/** Names for icon-only buttons that have neither text nor a label, by the icon they show. */
const ICON_NAMES: Record<string, string> = {
  "lucide-x": "Close", "lucide-trash-2": "Delete", "lucide-trash": "Delete", "lucide-pencil": "Edit", "lucide-square-pen": "Edit",
  "lucide-chevron-left": "Previous", "lucide-chevron-right": "Next", "lucide-plus": "Add", "lucide-search": "Search",
  "lucide-copy": "Copy", "lucide-refresh-cw": "Refresh", "lucide-ellipsis": "More options", "lucide-ellipsis-vertical": "More options",
  "lucide-more-horizontal": "More options", "lucide-printer": "Print", "lucide-download": "Download", "lucide-eye": "Show",
  "lucide-eye-off": "Hide", "lucide-menu": "Open menu", "lucide-send": "Send", "lucide-message-square": "Send a text",
  "lucide-mail": "Email", "lucide-phone": "Call", "lucide-history": "History", "lucide-arrow-left": "Back", "lucide-qr-code": "QR code",
};

/** Give every icon-only button a spoken name: its tooltip if it has one, else what its icon means. */
function nameIconButtons() {
  document.querySelectorAll<HTMLElement>("button:not([aria-label]):not([aria-labelledby]), a[href]:not([aria-label]):not([aria-labelledby])").forEach((b) => {
    if ((b.textContent ?? "").trim()) return;
    const title = b.getAttribute("title");
    if (title) { b.setAttribute("aria-label", title); return; }
    const svg = b.querySelector("svg");
    const cls = svg ? [...svg.classList].find((c) => ICON_NAMES[c]) : undefined;
    if (cls) b.setAttribute("aria-label", ICON_NAMES[cls]);
  });
}

export function KeyboardLayer() {
  useEffect(() => {
    const stack: Entry[] = [];
    const menus = new Set<HTMLElement>();
    let lastOutside: HTMLElement | null = null;
    let raf = 0;

    const inside = (n: Node | null) => !!n && stack.some((e) => e.region.some((r) => r.contains(n)));

    const onFocusIn = (e: FocusEvent) => {
      if (e.target instanceof HTMLElement && !inside(e.target)) lastOutside = e.target;
    };

    function moveFocusIn(entry: Entry) {
      const root = entry.region.find((r) => r.querySelector(FOCUSABLE)) ?? entry.region[0];
      if (!root || (document.activeElement && entry.region.some((r) => r.contains(document.activeElement)))) return;
      const first = focusables(entry.region).find((el) => el.matches("input:not([type=checkbox]):not([type=radio]), textarea, select, [data-autofocus]"));
      const panel = root.getAttribute("role") === "dialog" ? root : (root.querySelector<HTMLElement>('[role="dialog"]') ?? root);
      (first ?? (panel.hasAttribute("tabindex") ? panel : focusables(entry.region)[0] ?? panel)).focus({ preventScroll: true });
    }

    function sync() {
      raf = 0;
      nameIconButtons();
      const now = findOverlays();
      // Dialogs that closed: hand focus back to what opened them.
      for (let i = stack.length - 1; i >= 0; i--) {
        if (now.some((o) => o.el === stack[i].el) && stack[i].el.isConnected) continue;
        const [gone] = stack.splice(i, 1);
        const active = document.activeElement;
        const lost = !active || active === document.body || gone.region.some((r) => r.contains(active)) || !document.contains(active);
        if (lost && gone.opener && gone.opener.isConnected) gone.opener.focus({ preventScroll: true });
      }
      // Dialogs that opened.
      for (const o of now) {
        if (stack.some((s) => s.el === o.el)) continue;
        const entry: Entry = { el: o.el, opener: lastOutside ?? (document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null), modal: o.dim, region: regionOf(o.el) };
        stack.push(entry);
        if (entry.modal) {
          labelRegion(entry.region);
          // Wait a beat for the panel's entrance animation and any autofocus of its own.
          window.setTimeout(() => { if (stack.includes(entry)) moveFocusIn(entry); }, 60);
        }
      }
      // A panel that appears just after its backdrop (drawers) is picked up on the next pass.
      for (const e of stack) if (e.modal && e.region.length === 0) e.region = regionOf(e.el);
      // A menu that has just opened from the keyboard puts focus on its first item.
      const opener = document.activeElement as HTMLElement | null;
      if (opener?.getAttribute("aria-haspopup") === "menu" && opener.getAttribute("aria-expanded") === "true" && opener.matches(":focus-visible")) {
        const menu = opener.parentElement?.querySelector<HTMLElement>('[role="menu"]');
        if (menu && !menus.has(menu)) {
          menus.add(menu);
          menu.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
        }
      }
      for (const m of menus) if (!m.isConnected) menus.delete(m);
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(sync); };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
    document.addEventListener("focusin", onFocusIn);
    sync();

    /** Arrow keys inside a menu, a set of tabs or a group of choices: move to the next one (and pick it, for tabs and choices). */
    function arrows(e: KeyboardEvent): boolean {
      const target = e.target as HTMLElement | null;
      if (!target || e.altKey || e.ctrlKey || e.metaKey) return false;
      const groups: [string, string, boolean][] = [['[role="menu"]', '[role="menuitem"]', false], ['[role="tablist"]', '[role="tab"]', true], ['[role="radiogroup"]', '[role="radio"]', true]];
      for (const [groupSel, itemSel, select] of groups) {
        const group = target.closest<HTMLElement>(groupSel);
        if (!group) continue;
        const items = [...group.querySelectorAll<HTMLElement>(itemSel)].filter((el) => visible(el) && !el.hasAttribute("disabled") && el.closest(groupSel) === group);
        const at = items.indexOf(target.closest<HTMLElement>(itemSel) ?? target);
        if (items.length === 0) return false;
        const vertical = groupSel !== '[role="tablist"]' || group.getAttribute("aria-orientation") === "vertical";
        const next = vertical ? ["ArrowDown", "ArrowRight"] : ["ArrowRight", "ArrowDown"];
        const prev = vertical ? ["ArrowUp", "ArrowLeft"] : ["ArrowLeft", "ArrowUp"];
        let to = -1;
        if (next.includes(e.key)) to = at < 0 ? 0 : (at + 1) % items.length;
        else if (prev.includes(e.key)) to = at < 0 ? items.length - 1 : (at - 1 + items.length) % items.length;
        else if (e.key === "Home") to = 0;
        else if (e.key === "End") to = items.length - 1;
        if (to < 0) return false;
        e.preventDefault();
        items[to].focus();
        if (select && items[to].getAttribute("aria-selected") !== "true" && items[to].getAttribute("aria-checked") !== "true") items[to].click();
        return true;
      }
      // A search box with its results underneath (marked data-arrow-list): Up and Down move between them.
      const list = target.closest<HTMLElement>("[data-arrow-list]");
      if (list && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        const items = focusables([list]);
        const at = items.indexOf(target);
        const to = at < 0 ? -1 : e.key === "ArrowDown" ? Math.min(at + 1, items.length - 1) : Math.max(at - 1, 0);
        if (to >= 0 && to !== at) { e.preventDefault(); items[to].focus(); return true; }
      }
      // Down arrow on a button that opened a menu goes into the menu.
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && target.getAttribute("aria-haspopup") === "menu" && target.getAttribute("aria-expanded") === "true") {
        const menu = target.parentElement?.querySelector<HTMLElement>('[role="menu"]');
        const items = menu ? [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')].filter(visible) : [];
        if (items.length) { e.preventDefault(); (e.key === "ArrowDown" ? items[0] : items[items.length - 1]).focus(); return true; }
      }
      return false;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (!e.defaultPrevented && arrows(e)) return;
      if (e.key === "Escape") {
        if (e.defaultPrevented) return; // a dropdown or menu already used this Escape
        const top = findOverlays().pop();
        if (!top || top.el.dataset.esc === "handled") return;
        e.preventDefault();
        // What a mouse user does: press and click the backdrop. Handlers that check the click was on the backdrop itself still pass.
        for (const type of ["mousedown", "mouseup", "click"]) top.el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
        return;
      }
      if (e.key !== "Tab") return;
      const entry = [...stack].reverse().find((s) => s.modal);
      if (!entry) return;
      if (entry.region.length === 0) entry.region = regionOf(entry.el);
      const items = focusables(entry.region);
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const within = !!active && entry.region.some((r) => r.contains(active));
      if (!within) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
      else if (e.shiftKey && (active === first || active === entry.region.find((r) => r === active))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);

    return () => {
      observer.disconnect();
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("keydown", onKeyDown);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}
