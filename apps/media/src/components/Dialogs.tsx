import { useEffect, useRef, useState } from "react";
import { create } from "zustand";

/** WorshipHQ's own pop-ups, in place of the browser's ("tauri.localhost says…"). */
interface Ask {
  kind: "tell" | "ask" | "text" | "pick";
  title?: string;
  text: string;
  yes: string;
  no?: string;
  danger?: boolean;
  value?: string;
  placeholder?: string;
  options?: { id: string; label: string; detail?: string }[];
  done: (answer: string | boolean | null) => void;
}
const useDialogs = create<{ list: Ask[] }>(() => ({ list: [] }));
const open = <T,>(a: Omit<Ask, "done">) => new Promise<T>((resolve) => {
  const item: Ask = { ...a, done: (v) => { useDialogs.setState((s) => ({ list: s.list.filter((x) => x !== item) })); resolve(v as T); } };
  useDialogs.setState((s) => ({ list: [...s.list, item] }));
});

/** Something to know. */
export const tell = (text: string, title?: string) => open<boolean>({ kind: "tell", text, title, yes: "OK" });
/** Yes or no. The button says what will happen. */
export const ask = (text: string, yes = "Yes", o: { title?: string; danger?: boolean; no?: string } = {}) => open<boolean>({ kind: "ask", text, yes, no: o.no ?? "Cancel", ...o });
/** A few words typed in (null = cancelled). */
export const askText = (text: string, value = "", o: { title?: string; yes?: string; placeholder?: string } = {}) => open<string | null>({ kind: "text", text, value, no: "Cancel", ...o, yes: o.yes ?? "OK" });
/** One of a list (null = cancelled). */
export const pickOne = (text: string, options: { id: string; label: string; detail?: string }[], title?: string) => open<string | null>({ kind: "pick", text, title, options, yes: "", no: "Cancel" });

export function DialogHost() {
  const d = useDialogs((s) => s.list[0]);
  return d ? <Box key={useDialogs.getState().list.length + d.text} d={d} /> : null;
}

function Box({ d }: { d: Ask }) {
  const [v, setV] = useState(d.value ?? "");
  const main = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const cancel = () => d.done(d.kind === "tell" ? true : d.kind === "ask" ? false : null);
  const ok = () => { if (d.kind === "text") { if (v.trim()) d.done(v.trim()); } else d.done(true); };
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    if (field.current) { field.current.focus(); field.current.select(); } else main.current?.focus();
    // Before any shortcut of the app sees it.
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); cancel(); }
      else if (e.key === "Enter" && d.kind !== "pick" && (e.target as HTMLElement)?.tagName !== "BUTTON") { e.preventDefault(); e.stopImmediatePropagation(); ok(); }
    };
    window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("keydown", key, true); before?.focus?.(); };
  });
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/45 p-4" onMouseDown={cancel}>
      <div role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl border border-line bg-surface-2 p-5 shadow-2xl">
        {d.title && <h3 className="mb-1.5 text-[17px] font-bold text-ink">{d.title}</h3>}
        <p className="max-h-[50vh] overflow-y-auto whitespace-pre-line text-[14px] leading-relaxed text-ink">{d.text}</p>
        {d.kind === "text" && <input ref={field} value={v} onChange={(e) => setV(e.target.value)} placeholder={d.placeholder} className="mt-3 h-11 w-full rounded-lg border border-line-bright bg-surface px-3 text-[15px] text-ink outline-none focus:border-primary" />}
        {d.kind === "pick" && (
          <div className="mt-3 max-h-[45vh] space-y-1 overflow-y-auto">
            {d.options!.map((o) => (
              <button key={o.id} onClick={() => d.done(o.id)} className="block w-full rounded-lg border border-line px-3 py-2 text-left hover:border-primary hover:bg-primary-soft">
                <span className="block text-[14px] font-semibold text-ink">{o.label}</span>
                {o.detail && <span className="block text-[12px] text-ink-muted">{o.detail}</span>}
              </button>
            ))}
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          {d.no && <button onClick={cancel} className="h-10 rounded-lg px-4 text-[14px] font-semibold text-ink-muted hover:bg-surface-4 hover:text-ink">{d.no}</button>}
          {d.yes && <button ref={main} onClick={ok} disabled={d.kind === "text" && !v.trim()} className={`h-10 rounded-lg px-5 text-[14px] font-bold text-white disabled:opacity-50 ${d.danger ? "bg-danger hover:bg-danger/90" : "bg-primary hover:bg-primary-bright"}`}>{d.yes}</button>}
        </div>
      </div>
    </div>
  );
}

/** A pop-up is up: Esc and the like belong to it. */
export const dialogOpen = () => useDialogs.getState().list.length > 0;
