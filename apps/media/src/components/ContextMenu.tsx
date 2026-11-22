import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type MenuItem =
  | { label: string; icon?: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean; hint?: string }
  | { divider: true }
  | { heading: string };

interface MenuState { x: number; y: number; items: MenuItem[] }

/**
 * Right-click menus. Usage:
 *   const menu = useContextMenu();
 *   <div onContextMenu={menu.open(() => [...items])}>…</div>
 *   {menu.element}
 */
export function useContextMenu() {
  const [state, setState] = useState<MenuState | null>(null);
  const open = (build: () => MenuItem[]) => (e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setState({ x: e.clientX, y: e.clientY, items: build() });
  };
  const element = state ? <Menu state={state} onClose={() => setState(null)} /> : null;
  return { open, element, close: () => setState(null) };
}

function Menu({ state, onClose }: { state: MenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: state.x, y: state.y });

  // Keep the menu on screen.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.min(state.x, window.innerWidth - r.width - 8),
      y: Math.min(state.y, window.innerHeight - r.height - 8),
    });
  }, [state.x, state.y]);

  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("mousedown", close);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      className="fade-in fixed z-[100] min-w-[230px] rounded-xl border border-line-bright bg-surface-2 py-1.5 shadow-[0_10px_30px_rgba(15,23,42,0.18)]"
      style={{ left: pos.x, top: pos.y }}
    >
      {state.items.map((item, i) =>
        "divider" in item ? (
          <div key={i} className="my-1 h-px bg-line" />
        ) : "heading" in item ? (
          <div key={i} className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{item.heading}</div>
        ) : (
          <button
            key={i}
            role="menuitem"
            disabled={item.disabled}
            onClick={() => { onClose(); item.onClick(); }}
            className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[14px] disabled:opacity-40 ${
              item.danger ? "text-danger hover:bg-danger/10" : "text-ink hover:bg-primary-soft"
            }`}
          >
            <span className="grid size-4 shrink-0 place-items-center text-ink-muted">{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            {item.hint && <span className="text-[12px] text-ink-faint">{item.hint}</span>}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
