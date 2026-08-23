import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export type SearchResult = {
  id: string;
  label: string;
  sublabel: string | null;
  type: "member" | "group" | "event" | "gift";
  href: string;
  photoUrl?: string | null;
  gender?: string | null;
};

/** Live global search across members, groups, events and recent gifts. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ results: [] }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const churchId = session.churchId;
  const contains = { contains: q, mode: "insensitive" as const };

  const [people, groups, events] = await Promise.all([
    db.person.findMany({
      where: {
        churchId,
        OR: [
          { firstName: contains },
          { lastName: contains },
          { phone: contains },
          { memberId: contains },
        ],
      },
      select: { id: true, firstName: true, lastName: true, phone: true, memberId: true, photoUrl: true, gender: true, status: true },
      orderBy: [{ firstName: "asc" }],
      take: 6,
    }),
    db.group.findMany({
      where: { churchId, name: contains },
      select: { id: true, name: true, type: true, _count: { select: { members: true } } },
      take: 4,
    }),
    db.event.findMany({
      where: { churchId, title: contains },
      select: { id: true, title: true, startsAt: true, location: true },
      orderBy: { startsAt: "desc" },
      take: 4,
    }),
  ]);

  const results: SearchResult[] = [];

  for (const p of people) {
    results.push({
      id: p.id,
      label: `${p.firstName} ${p.lastName}`.trim(),
      sublabel: p.status === "visitor" ? "Visitor" : p.memberId || p.phone || "Member",
      type: "member",
      href: `/app/people?q=${encodeURIComponent(`${p.firstName} ${p.lastName}`.trim())}`,
      photoUrl: p.photoUrl,
      gender: p.gender,
    });
  }
  for (const g of groups) {
    results.push({
      id: g.id,
      label: g.name,
      sublabel: `Group · ${g._count.members} member${g._count.members === 1 ? "" : "s"}`,
      type: "group",
      href: `/app/groups/${g.id}`,
    });
  }
  for (const e of events) {
    results.push({
      id: e.id,
      label: e.title,
      sublabel: `Event · ${new Date(e.startsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`,
      type: "event",
      href: `/app/events`,
    });
  }

  return NextResponse.json({ results });
}
