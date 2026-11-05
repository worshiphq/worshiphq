import "server-only";
import { db } from "@/lib/db";
import { ownLeaderTitleRank } from "@/lib/leader-titles";

const CHURCH_TITLE_PRIORITY: Record<string, number> = {
  "Head Pastor": 0, "Senior Pastor": 1, "Lead Pastor": 2, "Associate Pastor": 3,
  "Pastor": 4, "Elder": 5, "Shepherd": 6, "Deacon": 7, "Deaconess": 8,
  "Minister": 9, "Evangelist": 10, "Prophet": 11, "Apostle": 12,
  "Bishop": 13, "Reverend": 14, "Director": 15, "Coordinator": 16,
};

const POSITION_PRIORITY: Record<string, number> = {
  "President": 0, "Vice President": 1, "Head": 2, "Assistant Head": 3,
  "Secretary": 4, "Treasurer": 5, "Coordinator": 6,
};

export async function getLeaders(churchId: string) {
  const [churchLeaders, departmentPositions, departments, churchTitles, groups] = await Promise.all([
    db.person.findMany({
      where: { churchId, featured: true, leaderTitle: { not: null } },
      select: {
        id: true, firstName: true, lastName: true, title: true,
        leaderTitle: true, photoUrl: true, phone: true, email: true,
        leaderSortOrder: true,
      },
    }),
    db.departmentPosition.findMany({
      where: { churchId },
      select: {
        id: true, position: true,
        person: { select: { id: true, firstName: true, lastName: true, title: true, photoUrl: true, phone: true, email: true } },
        department: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.department.findMany({
      where: { churchId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.church.findUnique({ where: { id: churchId }, select: { leaderTitles: true } }),
    // Groups belong on this page too: a group leader leads part of the church just as a department
    // head does. There is one Group.leaderId, so assigning here and assigning on the group itself
    // write the same field - the two sides can never disagree.
    db.group.findMany({
      where: { churchId, isActive: true },
      select: {
        id: true, name: true, type: true,
        leader: { select: { id: true, firstName: true, lastName: true, title: true, photoUrl: true, phone: true } },
        _count: { select: { members: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const sortedChurchLeaders = [...churchLeaders].sort((a, b) => {
    if (a.leaderSortOrder !== b.leaderSortOrder) return a.leaderSortOrder - b.leaderSortOrder;
    const pa = ownLeaderTitleRank(churchTitles?.leaderTitles, a.leaderTitle) ?? CHURCH_TITLE_PRIORITY[a.leaderTitle ?? ""] ?? 99;
    const pb = ownLeaderTitleRank(churchTitles?.leaderTitles, b.leaderTitle) ?? CHURCH_TITLE_PRIORITY[b.leaderTitle ?? ""] ?? 99;
    return pa - pb;
  });

  const deptMap = new Map<string, {
    id: string;
    name: string;
    members: { id: string; positionId: string; name: string; photoUrl: string | null; position: string; phone: string | null; email: string | null }[];
  }>();

  for (const dept of departments) {
    deptMap.set(dept.id, { id: dept.id, name: dept.name, members: [] });
  }

  for (const dp of departmentPositions) {
    const entry = deptMap.get(dp.department.id);
    if (!entry) continue;
    entry.members.push({
      id: dp.person.id,
      positionId: dp.id,
      name: `${dp.person.title ? dp.person.title + " " : ""}${dp.person.firstName} ${dp.person.lastName}`,
      photoUrl: dp.person.photoUrl,
      position: dp.position,
      phone: dp.person.phone,
      email: dp.person.email,
    });
  }

  for (const dept of deptMap.values()) {
    dept.members.sort((a, b) => {
      const pa = POSITION_PRIORITY[a.position] ?? 99;
      const pb = POSITION_PRIORITY[b.position] ?? 99;
      return pa - pb;
    });
  }

  const departmentLeaders = [...deptMap.values()].filter((d) => d.members.length > 0);

  const customPositions = [...new Set(
    departmentPositions
      .map((dp) => dp.position)
      .filter((p) => !["Head", "Assistant Head", "President", "Vice President", "Secretary", "Treasurer", "Coordinator"].includes(p)),
  )].sort();

  return {
    churchLeaders: sortedChurchLeaders.map((l) => ({
      id: l.id,
      name: `${l.title ? l.title + " " : ""}${l.firstName} ${l.lastName}`,
      leaderTitle: l.leaderTitle!,
      photoUrl: l.photoUrl,
      phone: l.phone,
      email: l.email,
    })),
    departmentLeaders,
    departments,
    customPositions,
    groupLeaders: groups.map((g) => ({
      id: g.id,
      name: g.name,
      type: g.type,
      memberCount: g._count.members,
      leader: g.leader
        ? {
          id: g.leader.id,
          name: `${g.leader.title ? g.leader.title + " " : ""}${g.leader.firstName} ${g.leader.lastName}`.trim(),
          photoUrl: g.leader.photoUrl,
          phone: g.leader.phone,
        }
        : null,
    })),
  };
}
