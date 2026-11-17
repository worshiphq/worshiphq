/**
 * Creates the hidden internal QA church from the command line (same result as the SuperAdmin "QA church" button),
 * or a second throwaway one for cross-church tests.
 *   npx tsx --env-file=.env scripts/qa/make-qa-church.ts            -> the permanent QA church (idempotent)
 *   npx tsx --env-file=.env scripts/qa/make-qa-church.ts extra      -> an extra internal church (zz-qa-extra-...)
 *   npx tsx --env-file=.env scripts/qa/make-qa-church.ts delete <slug> -> delete an internal church (refuses others)
 * The owner password is written to the file named by QA_PASSWORD_FILE, never printed.
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
const QA_OWNER_EMAIL = "qa-owner@example.test";

async function make(extra: boolean) {
  if (!extra) {
    const existing = await db.church.findFirst({ where: { isInternal: true, slug: { not: { startsWith: "zz-qa-extra-" } } }, orderBy: { createdAt: "asc" }, select: { slug: true } });
    if (existing) { console.log(`exists ${existing.slug}`); return; }
  }
  const password = randomBytes(24).toString("base64url");
  const passwordHash = await bcrypt.hash(password, 12);
  const slug = extra ? `zz-qa-extra-${randomBytes(4).toString("hex")}` : `zz-qa-${randomBytes(4).toString("hex")}`;
  const email = extra ? `qa-extra-${randomBytes(3).toString("hex")}@example.test` : QA_OWNER_EMAIL;
  await db.$transaction(async (tx) => {
    const c = await tx.church.create({
      data: {
        slug, name: extra ? "zz QA extra (internal)" : "zz QA (internal)", isInternal: true, country: "Ghana", smsCredits: 0,
        termsAcceptedAt: new Date(), autoBackup: false, smsWelcomeMember: false, smsWelcomeVisitor: false,
        notifySubmissions: false, birthdayWishOn: false, branches: { create: { name: "Main Branch", isHQ: true } },
      },
      select: { id: true },
    });
    await tx.subscription.create({ data: { churchId: c.id, plan: "max", interval: "yearly", status: "active", renewsAt: null, autoRenew: false } });
    await tx.user.create({ data: { churchId: c.id, email, name: "QA Owner", passwordHash, phone: null, role: "Owner", emailVerified: true } });
    await tx.user.create({ data: { churchId: c.id, email: `admin-${slug}@example.test`, name: "QA Admin", passwordHash, phone: null, role: "Admin", emailVerified: true } });
  });
  if (!extra && process.env.QA_PASSWORD_FILE) fs.writeFileSync(process.env.QA_PASSWORD_FILE, `QA church ${slug}\nOwner: ${email}\nAdmin: admin-${slug}@example.test\nPassword (both): ${password}\n`);
  console.log(`created ${slug}`);
}

async function remove(slug: string) {
  const c = await db.church.findFirst({ where: { slug }, select: { id: true, isInternal: true } });
  if (!c) { console.log("not found"); return; }
  if (!c.isInternal || !slug.startsWith("zz-qa-")) throw new Error("Refusing: not an internal zz-qa- church.");
  await db.church.delete({ where: { id: c.id } });
  console.log(`deleted ${slug}`);
}

(async () => {
  const [cmd, arg] = process.argv.slice(2);
  try {
    if (cmd === "delete") await remove(arg);
    else await make(cmd === "extra");
  } finally {
    await db.$disconnect();
  }
})();
