/** One place for how SuperAdmin lists are paged, so every list behaves the same way. */
export const ADMIN_PAGE_SIZE = 25;

/** The page number from a ?page= value: a whole number, at least 1, and never garbage. */
export function readPage(raw: string | string[] | undefined): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/** Work out the page to show, keeping it inside the real range, and how many rows to skip. */
export function paging(total: number, requested: number, size = ADMIN_PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(1, requested), pages);
  return { page, pages, size, total, skip: (page - 1) * size };
}

/** The page numbers to show: 1 2 3 ... 12, with the current page in the middle. A null is a gap. */
export function pageWindow(page: number, pages: number): (number | null)[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: (number | null)[] = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(pages - 1, page + 1);
  if (from > 2) out.push(null);
  for (let p = from; p <= to; p++) out.push(p);
  if (to < pages - 1) out.push(null);
  out.push(pages);
  return out;
}
