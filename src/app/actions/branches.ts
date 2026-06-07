"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertCanWrite } from "@/lib/auth";

export async function createBranch(formData: FormData) {
  const session = await requireSession();
  assertCanWrite(session);

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const existing = await db.branch.count({ where: { churchId: session.churchId } });

  await db.branch.create({
    data: {
      churchId: session.churchId,
      name,
      city: String(formData.get("city") ?? "").trim() || undefined,
      isHQ: existing === 0, // first branch becomes HQ
    },
  });

  revalidatePath("/app/branches");
}
