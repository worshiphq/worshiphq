import "server-only";
import { db } from "@/lib/db";
import { isTeachingChurch } from "@/config/teaching-churches";

/**
 * How many members a teaching church shows on each plan, so it looks like a real church of that size:
 * just under each plan's limit, and a big church on Max.
 */
export const TEACHING_SIZES: Record<string, number> = { free: 26, starter: 140, pro: 285, max: 700 };

const MALE = ["Kwame", "Kofi", "Yaw", "Kwabena", "Kwaku", "Kojo", "Kwesi", "Emmanuel", "Daniel", "Samuel", "Isaac", "Joseph", "Michael", "Prince", "Richard", "Eric", "Stephen", "Felix", "Ebenezer", "Benjamin", "Nana", "Francis", "George", "Collins"];
const FEMALE = ["Ama", "Akosua", "Abena", "Akua", "Yaa", "Afua", "Esi", "Adwoa", "Grace", "Mercy", "Gifty", "Comfort", "Patience", "Esther", "Joyce", "Priscilla", "Linda", "Vida", "Rita", "Doris", "Sandra", "Abigail", "Rebecca", "Felicia"];
const LAST = ["Mensah", "Boateng", "Owusu", "Asante", "Darko", "Appiah", "Osei", "Adjei", "Ofori", "Agyeman", "Amoah", "Badu", "Frimpong", "Kyei", "Opoku", "Sarpong", "Acheampong", "Antwi", "Gyamfi", "Nkrumah", "Addo", "Tetteh", "Quaye", "Ansah"];
const TOWNS = ["Bantama", "Asokwa", "Ahodwo", "Suame", "Tafo", "Santasi", "Kwadaso", "Ayigya", "Adum", "Ejisu"];
const JOBS = ["Teacher", "Nurse", "Trader", "Accountant", "Driver", "Engineer", "Student", "Seamstress", "Banker", "Farmer", "Civil servant", "Mechanic"];
const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)]!;

/**
 * Grow or shrink a teaching church's members to the size for `plan`. Only ever touches a church listed in
 * TEACHING_CHURCH_IDS. New members get sample 010 numbers (never texted) and recent attendance and giving, so the
 * dashboard numbers grow with them. Shrinking removes the newest members first, with their own attendance and
 * giving, so the totals stay believable. Each call does one short step (the host stops a request after about
 * 10 seconds); call again until `done`.
 */
export async function resizeTeachingChurch(churchId: string, plan: string, maxStep = 80): Promise<{ before: number; after: number; done: boolean } | null> {
  if (!isTeachingChurch(churchId)) return null;
  const target = TEACHING_SIZES[plan];
  if (!target) return null;
  const before = await db.person.count({ where: { churchId } });

  if (before > target) {
    const extra = await db.person.findMany({ where: { churchId }, orderBy: { memberId: "desc" }, take: Math.min(before - target, maxStep * 3), select: { id: true } });
    const ids = extra.map((p) => p.id);
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const where = { churchId, personId: { in: chunk } };
      await db.$transaction([
        db.attendanceRecord.deleteMany({ where }),
        db.gift.deleteMany({ where }),
        db.welfareDue.deleteMany({ where }),
        db.followUp.deleteMany({ where }),
        db.harvestContribution.deleteMany({ where }),
        db.pledge.deleteMany({ where }),
        db.volunteerSlot.deleteMany({ where }),
        db.person.deleteMany({ where: { churchId, id: { in: chunk } } }),
      ]);
    }
  } else if (before < target) {
    const adding = Math.min(target - before, maxStep);
    const church = await db.church.update({ where: { id: churchId }, data: { memberSeq: { increment: adding } }, select: { memberSeq: true, memberPrefix: true } });
    const prefix = church.memberPrefix || "WC";
    const firstSeq = church.memberSeq - adding + 1;
    const [branches, depts] = await Promise.all([
      db.branch.findMany({ where: { churchId }, select: { id: true, isHQ: true }, orderBy: { createdAt: "asc" } }),
      db.department.findMany({ where: { churchId }, select: { id: true } }),
    ]);
    const now = new Date();
    const rows = Array.from({ length: adding }, (_, k) => {
      const seq = firstSeq + k;
      const male = seq % 2 === 0;
      const r = Math.random();
      const ageGroup = r < 0.12 ? "child" : r < 0.22 ? "teen" : "adult";
      const age = ageGroup === "child" ? 5 + (seq % 7) : ageGroup === "teen" ? 13 + (seq % 5) : 20 + (seq % 48);
      const dob = new Date(now.getFullYear() - age, seq % 12, 1 + (seq % 28));
      const firstName = pick(male ? MALE : FEMALE);
      const lastName = pick(LAST);
      return {
        churchId, branchId: branches.length > 1 && seq % 8 === 0 ? branches[1]!.id : branches[0]?.id ?? null,
        memberId: `${prefix}-${String(seq).padStart(4, "0")}`, firstName, lastName, gender: male ? "Male" : "Female",
        phone: `010${String(10000 + seq).padStart(7, "0")}`, // sample number: never texted
        email: ageGroup === "adult" && seq % 3 === 0 ? `${firstName}.${lastName}${seq}`.toLowerCase() + "@example.com" : null,
        birthday: `${String(dob.getMonth() + 1).padStart(2, "0")}-${String(dob.getDate()).padStart(2, "0")}`, dateOfBirth: dob,
        ageGroup, location: pick(TOWNS), town: pick(TOWNS), region: "Ashanti", country: "Ghana",
        occupation: ageGroup === "adult" ? pick(JOBS) : "Student", maritalStatus: ageGroup === "adult" ? pick(["Married", "Single"]) : "Single",
        departmentId: ageGroup === "adult" && depts.length && seq % 3 === 0 ? pick(depts).id : null,
        joinedAt: new Date(now.getTime() - (20 + (seq % 700)) * 86_400_000),
      };
    });
    const made: { id: string; ageGroup: string | null }[] = [];
    for (let i = 0; i < rows.length; i += 300) made.push(...await db.person.createManyAndReturn({ data: rows.slice(i, i + 300), select: { id: true, ageGroup: true } }));

    // Recent attendance and giving for the new members, so the dashboard grows with the church.
    const sessions = await db.attendanceSession.findMany({ where: { churchId }, orderBy: { date: "desc" }, take: 8, select: { id: true, date: true, serviceName: true, branchId: true } });
    const att = [];
    const counts = sessions.map((s) => {
      const share = s.serviceName.startsWith("Sunday") ? 0.8 : 0.35;
      const present = made.filter(() => Math.random() < share);
      for (const p of present) att.push({ churchId, branchId: s.branchId, personId: p.id, sessionId: s.id, category: p.ageGroup ?? "adult", serviceName: s.serviceName, date: s.date, method: pick(["manual", "qr", "self"]) });
      const add = (g: string) => present.filter((p) => p.ageGroup === g).length;
      return db.attendanceSession.update({ where: { id: s.id }, data: { adults: { increment: add("adult") }, teens: { increment: add("teen") }, children: { increment: add("child") } } });
    });
    await Promise.all(counts);
    for (let i = 0; i < att.length; i += 1000) await db.attendanceRecord.createMany({ data: att.slice(i, i + 1000) });

    const tithe = await db.fund.findFirst({ where: { churchId, name: "Tithe" }, select: { id: true, accountId: true } });
    const sundays = sessions.filter((s) => s.serviceName.startsWith("Sunday"));
    if (tithe && sundays.length) {
      const gifts = made.filter((p) => p.ageGroup === "adult" && Math.random() < 0.4).map((p) => ({
        churchId, personId: p.id, fundId: tithe.id, accountId: tithe.accountId, amount: pick([50, 100, 150, 200, 300]),
        method: pick(["Cash", "MTN_MoMo", "Telecel_Cash"] as const), date: pick(sundays).date, receiptSent: true,
      }));
      for (let i = 0; i < gifts.length; i += 1000) await db.gift.createMany({ data: gifts.slice(i, i + 1000) });
    }
  }
  const after = await db.person.count({ where: { churchId } });
  return { before, after, done: after === target };
}
