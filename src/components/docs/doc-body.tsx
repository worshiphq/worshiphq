import { Lightbulb, AlertTriangle } from "lucide-react";
import type { DocBlock } from "@/lib/docs/types";

/** Inline text: **bold** only. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-semibold text-evergreen-deep">{p.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

/** Renders one manual article's blocks. */
export function DocBody({ blocks }: { blocks: DocBlock[] }) {
  return (
    <div className="space-y-5 text-[15px] leading-[1.8] text-ink-muted">
      {blocks.map((b, i) => {
        if ("h" in b) {
          return (
            <h2 key={i} id={b.h.toLowerCase().replace(/[^a-z0-9]+/g, "-")} className="scroll-mt-28 pt-4 font-display text-xl font-bold text-evergreen-deep">
              {b.h}
            </h2>
          );
        }
        if ("p" in b) return <p key={i}><Inline text={b.p} /></p>;
        if ("steps" in b) {
          return (
            <ol key={i} className="space-y-3">
              {b.steps.map((s, j) => (
                <li key={j} className="flex gap-3">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center bg-evergreen text-[12px] font-bold text-white">{j + 1}</span>
                  <span><Inline text={s} /></span>
                </li>
              ))}
            </ol>
          );
        }
        if ("list" in b) {
          return (
            <ul key={i} className="list-disc space-y-1.5 pl-5 marker:text-evergreen">
              {b.list.map((s, j) => <li key={j}><Inline text={s} /></li>)}
            </ul>
          );
        }
        if ("tip" in b) {
          return (
            <div key={i} className="flex gap-3 border-l-2 border-evergreen bg-evergreen/5 px-4 py-3 text-[14px]">
              <Lightbulb className="mt-1 size-4 shrink-0 text-evergreen" />
              <span><Inline text={b.tip} /></span>
            </div>
          );
        }
        if ("note" in b) {
          return (
            <div key={i} className="flex gap-3 border-l-2 border-amber-600 bg-amber-50 px-4 py-3 text-[14px] text-amber-950">
              <AlertTriangle className="mt-1 size-4 shrink-0 text-amber-600" />
              <span><Inline text={b.note} /></span>
            </div>
          );
        }
        return (
          <div key={i} className="overflow-x-auto">
            <table className="w-full border-collapse text-[14px]">
              <thead>
                <tr>{b.table.head.map((h) => <th key={h} className="border-b-2 border-evergreen px-3 py-2 text-left font-semibold text-evergreen-deep">{h}</th>)}</tr>
              </thead>
              <tbody>
                {b.table.rows.map((r, j) => (
                  <tr key={j} className="border-b border-ink/10">
                    {r.map((c, k) => <td key={k} className="px-3 py-2 align-top"><Inline text={c} /></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

/** Plain text of an article, for search. */
export function blocksToText(blocks: DocBlock[]): string {
  return blocks
    .map((b) =>
      "h" in b ? b.h : "p" in b ? b.p : "steps" in b ? b.steps.join(" ") : "list" in b ? b.list.join(" ") : "tip" in b ? b.tip : "note" in b ? b.note : [...b.table.head, ...b.table.rows.flat()].join(" "),
    )
    .join(" ")
    .replace(/\*\*/g, "");
}
