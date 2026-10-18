import { PrismaClient, Stage, ScaleKind } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

// ⚠ Placeholder bands. Confirm against the school's / GES / NaCCA guidance before go-live;
// every school can edit these in Settings → Grading.
const JHS_BANDS = [
  ["1", "Highest", 80, 100], ["2", "Higher", 70, 79], ["3", "High", 60, 69], ["4", "High Average", 55, 59],
  ["5", "Average", 50, 54], ["6", "Low Average", 45, 49], ["7", "Low", 40, 44], ["8", "Lower", 35, 39], ["9", "Lowest", 0, 34],
] as const;
const PRIMARY_BANDS = [
  ["HP", "Highly Proficient", 80, 100], ["P", "Proficient", 68, 79], ["AP", "Approaching Proficiency", 54, 67],
  ["D", "Developing", 40, 53], ["B", "Beginning", 0, 39],
] as const;
const KG_RATINGS = [["E", "Exceeding"], ["M", "Meeting"], ["A", "Approaching"], ["B", "Beginning"]] as const;

const LEVELS: [string, Stage][] = [
  ["Nursery 1", "NURSERY"], ["Nursery 2", "NURSERY"], ["KG 1", "KG"], ["KG 2", "KG"],
  ...[1, 2, 3, 4, 5, 6].map((n) => [`Primary ${n}`, "PRIMARY"] as [string, Stage]),
  ...[1, 2, 3].map((n) => [`JHS ${n}`, "JHS"] as [string, Stage]),
];

async function main() {
  const plan = await db.plan.upsert({
    where: { name: "Standard" },
    update: {},
    create: { name: "Standard", pricePerStudent: 5, minimumPerTerm: 300, smsCreditsPerTerm: 200 },
  });

  const school = await db.school.upsert({
    where: { slug: "demo" },
    update: {},
    create: {
      name: "Bright Future Academy", slug: "demo", town: "Kumasi", region: "Ashanti", status: "ACTIVE",
      settings: { withholdReportsIfOwing: false },
      subscription: { create: { planId: plan.id, status: "TRIAL", trialEndsAt: new Date(Date.now() + 30 * 864e5) } },
    },
  });

  const mkScale = async (name: string, kind: ScaleKind, bands: readonly (readonly [string, string, number?, number?])[]) =>
    db.gradingScale.upsert({
      where: { schoolId_name: { schoolId: school.id, name } },
      update: {},
      create: {
        schoolId: school.id, name, kind,
        bands: { create: bands.map(([grade, label, minScore, maxScore], order) => ({ grade, label, minScore, maxScore, order, isPass: true })) },
      },
    });
  const jhs = await mkScale("JHS (1–9)", "SCORE_BAND", JHS_BANDS);
  const primary = await mkScale("Primary", "SCORE_BAND", PRIMARY_BANDS);
  const kg = await mkScale("Nursery / KG ratings", "RATING", KG_RATINGS);

  for (const [i, [name, stage]] of LEVELS.entries()) {
    const level = await db.level.upsert({
      where: { schoolId_name: { schoolId: school.id, name } },
      update: {},
      create: { schoolId: school.id, name, stage, order: i + 1 },
    });
    const scaleId = stage === "JHS" ? jhs.id : stage === "PRIMARY" ? primary.id : kg.id;
    const components =
      stage === "NURSERY" || stage === "KG"
        ? [{ name: "Termly assessment", maxScore: 100, weight: 100, order: 1 }]
        : [{ name: "Class score (SBA)", maxScore: 50, weight: 50, order: 1 }, { name: "End-of-term exam", maxScore: 100, weight: 50, order: 2 }];
    await db.assessmentScheme.upsert({
      where: { levelId: level.id },
      update: {},
      create: { schoolId: school.id, levelId: level.id, scaleId, name: `${stage} scheme`, components: { create: components } },
    });
  }

  const admin = await db.user.upsert({
    where: { email: "admin@demo.test" },
    update: {},
    create: { name: "Demo Admin", email: "admin@demo.test", passwordHash: await bcrypt.hash("change-me-now", 10) },
  });
  await db.membership.upsert({
    where: { userId_schoolId_role: { userId: admin.id, schoolId: school.id, role: "SCHOOL_ADMIN" } },
    update: {},
    create: { userId: admin.id, schoolId: school.id, role: "SCHOOL_ADMIN" },
  });
}

main().finally(() => db.$disconnect());
