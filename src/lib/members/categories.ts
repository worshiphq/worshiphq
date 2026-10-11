import "server-only";
import { db } from "@/lib/db";

/**
 * Member categories: church-defined groupings beyond departments, e.g. "Zone",
 * "Fellowship" or "Cell". A category is either single-choice (one zone per
 * member) or multi-choice (several fellowships).
 */

export type CategoryForForm = { id: string; name: string; allowMultiple: boolean; options: { id: string; name: string }[] };

export async function getCategoriesForForm(churchId: string, opts: { joinFormOnly?: boolean } = {}): Promise<CategoryForForm[]> {
  return db.memberCategory.findMany({
    where: { churchId, ...(opts.joinFormOnly ? { showOnJoinForm: true } : {}) },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true, name: true, allowMultiple: true,
      options: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } },
    },
  });
}

/** Form field name for a category's choice(s). */
export const categoryFieldName = (categoryId: string) => `cat_${categoryId}`;
/** Present on any form that rendered the category pickers, so a form without them never clears choices. */
export const CATEGORY_FORM_MARKER = "categoriesForm";

/**
 * Save a member's category choices from a submitted form. Only options that
 * belong to this church and category are kept; single-choice categories keep
 * the first. Does nothing if the form didn't include the pickers.
 */
export async function saveMemberCategoryChoices(
  churchId: string,
  personId: string,
  formData: FormData,
  opts: { joinFormOnly?: boolean } = {},
) {
  if (formData.get(CATEGORY_FORM_MARKER) !== "1") return;
  // On the public form only the categories the church chose to ask about can be set.
  const categories = await getCategoriesForForm(churchId, opts);
  if (categories.length === 0) return;
  const chosen: string[] = [];
  for (const c of categories) {
    const valid = new Set(c.options.map((o) => o.id));
    const picked = formData
      .getAll(categoryFieldName(c.id))
      .map(String)
      .filter((v, i, all) => valid.has(v) && all.indexOf(v) === i);
    chosen.push(...(c.allowMultiple ? picked : picked.slice(0, 1)));
  }
  await db.person.update({ where: { id: personId }, data: { categoryOptions: { set: chosen.map((id) => ({ id })) } } });
}
