import "server-only";
import { db } from "@/lib/db";
import { DEFAULT_AGE_CONFIG, ageOf, groupForAge, type AgeConfig, type StoredAgeGroup } from "@/lib/age";

/** A church's age bands (or the standard ones). */
export async function getAgeConfig(churchId: string): Promise<AgeConfig> {
  const c = await db.church.findUnique({
    where: { id: churchId },
    select: { ageChildMax: true, ageTeenMax: true, ageYouthOn: true, ageYouthMax: true, ageYouthLabel: true, ageAutoOn: true },
  });
  if (!c) return DEFAULT_AGE_CONFIG;
  return { childMax: c.ageChildMax, teenMax: c.ageTeenMax, youthOn: c.ageYouthOn, youthMax: c.ageYouthMax, youthLabel: c.ageYouthLabel, autoOn: c.ageAutoOn };
}

const ORDER: Record<StoredAgeGroup, number> = { child: 0, teen: 1, adult: 2 };

/** Children and teens who are now old enough for the next group (never moves anyone down). */
export async function ageMoves(churchId: string, cfg: AgeConfig, now = new Date()) {
  const people = await db.person.findMany({
    where: { churchId, dateOfBirth: { not: null }, ageGroup: { in: ["child", "teen"] } },
    select: { id: true, firstName: true, lastName: true, ageGroup: true, dateOfBirth: true },
  });
  const moves: { id: string; name: string; from: StoredAgeGroup; to: StoredAgeGroup; age: number }[] = [];
  for (const p of people) {
    const age = ageOf(p.dateOfBirth, now);
    if (age === null) continue;
    const to = groupForAge(age, cfg);
    const from = p.ageGroup as StoredAgeGroup;
    if (ORDER[to] > ORDER[from]) moves.push({ id: p.id, name: `${p.firstName} ${p.lastName}`.trim(), from, to, age });
  }
  return moves;
}

/** Move everyone who has passed an age band into the next group. Returns who moved. */
export async function applyAgeMoves(churchId: string, cfg?: AgeConfig) {
  const config = cfg ?? (await getAgeConfig(churchId));
  const moves = await ageMoves(churchId, config);
  for (const to of ["teen", "adult"] as const) {
    const ids = moves.filter((m) => m.to === to).map((m) => m.id);
    if (ids.length) await db.person.updateMany({ where: { id: { in: ids }, churchId }, data: { ageGroup: to === "adult" ? "adult" : "teen" } });
  }
  return moves;
}

/** Daily: for churches that switched on automatic age groups, move people up when they pass an age. */
export async function runAgeGroupSync() {
  const churches = await db.church.findMany({ where: { isDemo: false, ageAutoOn: true }, select: { id: true } });
  let moved = 0;
  for (const c of churches) moved += (await applyAgeMoves(c.id)).length;
  return { churches: churches.length, moved };
}
