"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  getSession,
  startUserSession,
  startDemoSession,
  clearSession,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "church"
  );
}

async function uniqueSlug(base: string) {
  let slug = base;
  let n = 1;
  while (await db.church.findUnique({ where: { slug } })) slug = `${base}-${++n}`;
  return slug;
}

/** Create a brand-new church + Owner account, then sign in. */
export async function signUp(formData: FormData) {
  const churchName = String(formData.get("church") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const password = String(formData.get("password") ?? "");

  if (!churchName || !name || !email || password.length < 6) {
    redirect("/sign-up?error=invalid");
  }
  if (await db.user.findUnique({ where: { email } })) {
    redirect("/sign-up?error=exists");
  }

  const slug = await uniqueSlug(slugify(churchName));
  const church = await db.church.create({
    data: {
      slug,
      name: churchName,
      country: "Ghana",
      branches: { create: { name: "Main Branch", isHQ: true } },
    },
    include: { branches: true },
  });

  const user = await db.user.create({
    data: {
      churchId: church.id,
      branchId: church.branches[0]?.id,
      email,
      name,
      passwordHash: await hashPassword(password),
      role: "Owner",
    },
  });

  await startUserSession(user.id);
  redirect("/app");
}

/** Sign in an existing user. */
export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const password = String(formData.get("password") ?? "");

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    redirect("/sign-in?error=invalid");
  }
  await startUserSession(user.id);
  redirect("/app");
}

/** Enter the read-only demo church (no account needed). */
export async function enterDemo() {
  await startDemoSession();
  redirect("/app");
}

export async function signOut() {
  await clearSession();
  redirect("/sign-in");
}

/** Switch the signed-in user's active branch. */
export async function switchBranch(branchName: string) {
  const session = await getSession();
  if (!session || session.isDemo) return;
  const branch = await db.branch.findFirst({
    where: { churchId: session.churchId, name: branchName },
  });
  if (branch) {
    await db.user.update({ where: { id: session.userId }, data: { branchId: branch.id } });
    revalidatePath("/app", "layout");
  }
}
