/**
 * The public user manual (worshiphq.app/docs). Articles are plain data so every
 * page has the same structure, the whole manual is searchable, and nothing
 * needs a markdown library. Inline text supports **bold** only.
 */

export type DocBlock =
  | { h: string } // sub-heading inside an article
  | { p: string } // paragraph
  | { steps: string[] } // numbered how-to steps
  | { list: string[] } // bullet list
  | { tip: string } // helpful hint
  | { note: string } // important caution
  | { table: { head: string[]; rows: string[][] } };

export type DocArticle = {
  slug: string; // unique across the manual, used in the URL
  section: string; // DocSection id
  title: string;
  summary: string; // one line for cards, search and the page description
  /** Plan feature key (from lib/plan-gate) - shows "Available on X plan and above". */
  feature?: string;
  /** Who can do this, e.g. "Owners and Admins". */
  who?: string;
  /** Where it lives in the app, e.g. "/app/people" - shows an "Open in WorshipHQ" link. */
  appPath?: string;
  body: DocBlock[];
};

export type DocSection = { id: string; title: string; blurb: string };
