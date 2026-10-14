"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { moveToBin } from "@/lib/recycle-bin";
import { requireSession, assertCanWrite } from "@/lib/auth";
import { canManage } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { getFormDefinition, GROUPS_FIELD_ID } from "@/lib/forms/registration";

type Result = { ok: true; warning?: string } | { ok: false; error: string };

async function requirePeopleManager() {
  const session = await requireSession();
  assertCanWrite(session);
  if (!canManage(session, "people")) throw new Error("Only people who manage members can change categories.");
  return session;
}

const clean = (s: string, max = 60) => s.trim().replace(/\s+/g, " ").slice(0, max);
const refresh = () => {
  revalidatePath("/app/people");
  revalidatePath("/app/settings");
  revalidatePath("/app/attendance");
};

export type CategoryAdminRow = {
  id: string;
  name: string;
  allowMultiple: boolean;
  showOnJoinForm: boolean;
  options: { id: string; name: string; members: number }[];
};

export async function getMemberCategoriesAdmin(): Promise<CategoryAdminRow[]> {
  const session = await requireSession();
  const rows = await db.memberCategory.findMany({
    where: { churchId: session.churchId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true, name: true, allowMultiple: true, showOnJoinForm: true,
      options: {
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, _count: { select: { members: true } } },
      },
    },
  });
  return rows.map((c) => ({ ...c, options: c.options.map((o) => ({ id: o.id, name: o.name, members: o._count.members })) }));
}

export async function createMemberCategory(input: { name: string; allowMultiple: boolean; showOnJoinForm?: boolean; options?: string[] }): Promise<Result> {
  const session = await requirePeopleManager();
  const name = clean(input.name);
  if (!name) return { ok: false, error: "Give the category a name, e.g. Zone or Fellowship." };
  if (await db.memberCategory.findFirst({ where: { churchId: session.churchId, name: { equals: name, mode: "insensitive" } } })) {
    return { ok: false, error: `You already have a category called "${name}".` };
  }
  const count = await db.memberCategory.count({ where: { churchId: session.churchId } });
  const seen = new Set<string>();
  const options = (input.options ?? []).map((o) => clean(o)).filter((o) => {
    const k = o.toLowerCase();
    if (!o || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  await db.memberCategory.create({
    data: {
      churchId: session.churchId,
      name,
      allowMultiple: input.allowMultiple,
      showOnJoinForm: input.showOnJoinForm ?? true,
      sortOrder: count,
      options: { create: options.map((o, i) => ({ churchId: session.churchId, name: o, sortOrder: i })) },
    },
  });
  await audit(session, "create", "settings", `Member category "${name}"`);
  refresh();
  return { ok: true };
}

export async function updateMemberCategory(id: string, input: { name: string; allowMultiple: boolean; showOnJoinForm?: boolean }): Promise<Result> {
  const session = await requirePeopleManager();
  const cat = await db.memberCategory.findFirst({ where: { id, churchId: session.churchId } });
  if (!cat) return { ok: false, error: "Category not found." };
  const name = clean(input.name);
  if (!name) return { ok: false, error: "The name can't be empty." };
  const clash = await db.memberCategory.findFirst({ where: { churchId: session.churchId, id: { not: id }, name: { equals: name, mode: "insensitive" } } });
  if (clash) return { ok: false, error: `You already have a category called "${name}".` };
  await db.memberCategory.update({
    where: { id },
    data: { name, allowMultiple: input.allowMultiple, ...(input.showOnJoinForm !== undefined ? { showOnJoinForm: input.showOnJoinForm } : {}) },
  });
  revalidatePath("/join", "layout");

  // Switching to one-only: nothing is deleted, but members with several will
  // keep only their first the next time their profile is saved.
  let warning: string | undefined;
  if (cat.allowMultiple && !input.allowMultiple) {
    const people = await db.person.findMany({
      where: { churchId: session.churchId, categoryOptions: { some: { categoryId: id } } },
      select: { _count: { select: { categoryOptions: { where: { categoryId: id } } } } },
    });
    const several = people.filter((p) => p._count.categoryOptions > 1).length;
    if (several) warning = `${several} member${several === 1 ? " has" : "s have"} more than one ${name}. They keep them until their profile is next saved, then only the first stays.`;
  }
  await audit(session, "update", "settings", `Member category "${name}"`);
  refresh();
  return { ok: true, warning };
}

export async function deleteMemberCategory(id: string): Promise<Result> {
  const session = await requirePeopleManager();
  const cat = await db.memberCategory.findFirst({ where: { id, churchId: session.churchId }, select: { name: true } });
  if (!cat) return { ok: false, error: "Category not found." };
  await moveToBin(session, "memberCategory", "MemberCategory", id);
  await db.memberCategory.delete({ where: { id } });
  await audit(session, "delete", "settings", `Member category "${cat.name}"`);
  refresh();
  return { ok: true };
}

export async function addCategoryOption(categoryId: string, rawName: string): Promise<Result> {
  const session = await requirePeopleManager();
  const cat = await db.memberCategory.findFirst({ where: { id: categoryId, churchId: session.churchId }, select: { id: true } });
  if (!cat) return { ok: false, error: "Category not found." };
  const seen = new Set<string>();
  const names = rawName.split(/[\n,]+/).map((n) => clean(n)).filter((n) => {
    const k = n.toLowerCase();
    if (!n || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (!names.length) return { ok: false, error: "Type a name to add." };
  const existing = await db.memberCategoryOption.findMany({ where: { categoryId }, select: { name: true } });
  const taken = new Set(existing.map((e) => e.name.toLowerCase()));
  const fresh = names.filter((n) => !taken.has(n.toLowerCase()));
  if (!fresh.length) return { ok: false, error: "Those are already in the list." };
  await db.memberCategoryOption.createMany({
    data: fresh.map((n, i) => ({ churchId: session.churchId, categoryId, name: n, sortOrder: existing.length + i })),
  });
  refresh();
  return { ok: true };
}

export async function renameCategoryOption(id: string, rawName: string): Promise<Result> {
  const session = await requirePeopleManager();
  const opt = await db.memberCategoryOption.findFirst({ where: { id, churchId: session.churchId } });
  if (!opt) return { ok: false, error: "Not found." };
  const name = clean(rawName);
  if (!name) return { ok: false, error: "The name can't be empty." };
  const clash = await db.memberCategoryOption.findFirst({ where: { categoryId: opt.categoryId, id: { not: id }, name: { equals: name, mode: "insensitive" } } });
  if (clash) return { ok: false, error: `"${name}" is already in the list.` };
  await db.memberCategoryOption.update({ where: { id }, data: { name } });
  refresh();
  return { ok: true };
}

export async function deleteCategoryOption(id: string): Promise<Result> {
  const session = await requirePeopleManager();
  const opt = await db.memberCategoryOption.findFirst({ where: { id, churchId: session.churchId }, select: { name: true } });
  if (!opt) return { ok: false, error: "Not found." };
  await moveToBin(session, "categoryOption", "MemberCategoryOption", id);
  await db.memberCategoryOption.delete({ where: { id } });
  await audit(session, "delete", "settings", `Removed "${opt.name}" from a member category`);
  refresh();
  return { ok: true };
}

export type ConvertResult =
  | { ok: true; groups: number; reused: number; people: number; removed: number; formUpdated: boolean }
  | { ok: false; error: string };

/**
 * Turn every zone, fellowship or other category option into a group, with the same
 * people in it. Each option becomes a group of that category's type (for example a
 * "Zone" group called "Asokwa"). Safe to run again: groups that already exist are
 * reused and only missing people are added. Optionally puts the old categories in the
 * recycle bin afterwards, and adds the Groups question to the join form when a
 * category used to be asked there.
 */
export async function convertCategoriesToGroups(opts: { removeOld: boolean }): Promise<ConvertResult> {
  const session = await requirePeopleManager();
  if (!canManage(session, "groups")) return { ok: false, error: "You also need permission to manage Groups to do this." };
  if (session.isDemo) return { ok: false, error: "Read-only demo." };

  const cats = await db.memberCategory.findMany({
    where: { churchId: session.churchId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true, name: true, showOnJoinForm: true,
      options: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, members: { select: { id: true } } } },
    },
  });
  const usable = cats.filter((c) => c.options.length > 0);
  if (usable.length === 0) return { ok: false, error: "There are no zones, fellowships or categories with options to convert." };

  let created = 0, reused = 0;
  const linked = new Set<string>();
  let anyOnForm = false;

  for (const cat of usable) {
    for (const opt of cat.options) {
      const existing = await db.group.findFirst({
        where: { churchId: session.churchId, name: { equals: opt.name, mode: "insensitive" }, type: { equals: cat.name, mode: "insensitive" } },
        select: { id: true },
      });
      let groupId: string;
      if (existing) { groupId = existing.id; reused++; }
      else {
        const g = await db.group.create({ data: { churchId: session.churchId, name: opt.name, type: cat.name, onForms: cat.showOnJoinForm } });
        groupId = g.id;
        created++;
      }
      if (cat.showOnJoinForm) anyOnForm = true;
      if (opt.members.length > 0) {
        await db.group.update({ where: { id: groupId }, data: { members: { connect: opt.members.map((m) => ({ id: m.id })) } } });
        for (const m of opt.members) linked.add(m.id);
      }
    }
  }

  // Ask for groups on the join form wherever the old categories were asked.
  let formUpdated = false;
  if (anyOnForm) {
    const church = await db.church.findUnique({ where: { id: session.churchId }, select: { registrationFields: true } });
    const fields = getFormDefinition(church?.registrationFields ?? null);
    if (!fields.some((f) => f.id === GROUPS_FIELD_ID)) {
      await db.church.update({
        where: { id: session.churchId },
        data: { registrationFields: [...fields, { id: GROUPS_FIELD_ID, label: "Groups you would like to join", type: "select", system: true }] as object },
      });
      formUpdated = true;
    }
  }

  let removed = 0;
  if (opts.removeOld) {
    for (const cat of usable) {
      await moveToBin(session, "memberCategory", "MemberCategory", cat.id);
      await db.memberCategory.delete({ where: { id: cat.id } });
      removed++;
    }
  }

  await audit(session, "update", "settings", `Converted ${usable.length} categor${usable.length === 1 ? "y" : "ies"} into groups (${created} new)${opts.removeOld ? ", old categories removed" : ""}`);
  refresh();
  revalidatePath("/app/groups");
  revalidatePath("/app/directory");
  return { ok: true, groups: created, reused, people: linked.size, removed, formUpdated };
}
