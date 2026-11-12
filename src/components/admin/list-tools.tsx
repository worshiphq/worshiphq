"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared SuperAdmin list tools, so every list searches and sorts the same way.
 *
 * LiveSearch: for lists the server pages (the URL carries ?q=). Results update as you type, a moment after you
 * stop, with no Enter needed. Other URL settings (sort, filters) are kept, and the list goes back to page 1.
 */
export function LiveSearch({ placeholder = "Search", param = "q", className }: { placeholder?: string; param?: string; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [value, setValue] = useState(sp.get(param) ?? "");
  const [pending, start] = useTransition();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => {
      const next = new URLSearchParams(sp.toString());
      const v = value.trim();
      if (v) next.set(param, v); else next.delete(param);
      next.delete("page");
      const qs = next.toString();
      start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    }, 300);
    return () => clearTimeout(t);
    // Only typing should trigger a search; the URL changing because of it must not loop back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className={cn("relative", className)}>
      {pending
        ? <Loader2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-teal-400" />
        : <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />}
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label={placeholder}
        placeholder={placeholder}
        className="h-9 w-64 max-w-full rounded-lg border border-white/10 bg-white/5 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-400/60 focus:outline-none"
      />
    </div>
  );
}

export type SortDir = "asc" | "desc";

/** A table heading you click to sort by. Clicking the active one flips the direction. Numbers start biggest first. */
export function SortTh({ label, k, sort, dir, onSort, numeric, className }: {
  label: string; k: string; sort: string; dir: SortDir; onSort: (k: string, dir: SortDir) => void; numeric?: boolean; className?: string;
}) {
  const active = sort === k;
  const Icon = !active ? ArrowUpDown : dir === "desc" ? ArrowDown : ArrowUp;
  return (
    <th className={cn("px-2 py-3", className)} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(k, active ? (dir === "desc" ? "asc" : "desc") : numeric ? "desc" : "asc")}
        className={cn("inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-200", active && "text-teal-300")}
      >
        {label} <Icon className="size-3" />
      </button>
    </th>
  );
}

/** SortTh for server-paged lists: the sort lives in the URL (?sort=&dir=) and the list goes back to page 1. */
export function UrlSortTh(props: { label: string; k: string; numeric?: boolean; className?: string; defaultSort?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const sort = sp.get("sort") ?? props.defaultSort ?? "";
  const dir = (sp.get("dir") as SortDir) ?? "desc";
  const onSort = (k: string, d: SortDir) => {
    const next = new URLSearchParams(sp.toString());
    next.set("sort", k); next.set("dir", d); next.delete("page");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  return <SortTh {...props} sort={sort} dir={dir} onSort={onSort} />;
}

/** A small dropdown filter kept in the URL (?{param}=). Empty value = no filter. */
export function UrlFilter({ param, options, label }: { param: string; options: { value: string; label: string }[]; label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return (
    <select
      aria-label={label}
      value={sp.get(param) ?? ""}
      onChange={(e) => {
        const next = new URLSearchParams(sp.toString());
        if (e.target.value) next.set(param, e.target.value); else next.delete(param);
        next.delete("page");
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
      }}
      className="h-9 rounded-lg border border-white/10 bg-white/5 px-2 text-sm text-slate-200 focus:border-teal-400/60 focus:outline-none"
    >
      {options.map((o) => <option key={o.value} value={o.value} className="bg-slate-900">{o.label}</option>)}
    </select>
  );
}
