export type ExtraAnswer = { label: string; value: string };

/** Answers to the extra questions a church added to its public forms. */
export function ExtraAnswers({ items, className }: { items?: ExtraAnswer[] | null; className?: string }) {
  if (!items || items.length === 0) return null;
  return (
    <dl className={`rounded-lg bg-surface-2/60 px-3 py-2 text-xs ${className ?? ""}`}>
      {items.map((a, i) => (
        <div key={i} className="flex flex-wrap gap-x-2 py-0.5">
          <dt className="font-medium text-ink-muted">{a.label}:</dt>
          <dd className="text-ink">{a.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Coerce a stored JSON value into answers (anything unexpected becomes nothing). */
export function asExtra(v: unknown): ExtraAnswer[] | null {
  if (!Array.isArray(v)) return null;
  const out = v.filter((x): x is ExtraAnswer => !!x && typeof x.label === "string" && typeof x.value === "string");
  return out.length ? out : null;
}
