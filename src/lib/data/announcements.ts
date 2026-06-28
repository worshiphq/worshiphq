import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";

export interface ActiveAnnouncement {
  id: string;
  title: string;
  body: string;
  level: string;
}

/** Announcements currently live (active + within their time window). */
async function _getActiveAnnouncements(): Promise<ActiveAnnouncement[]> {
  const now = new Date();
  try {
    const rows = await db.announcement.findMany({
      where: {
        active: true,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
      },
      orderBy: { startsAt: "desc" },
      select: { id: true, title: true, body: true, level: true },
    });
    return rows;
  } catch {
    return [];
  }
}

export const getActiveAnnouncements = cache(_getActiveAnnouncements);

/** All announcements, for the admin composer. */
export async function getAllAnnouncements() {
  return db.announcement.findMany({ orderBy: { createdAt: "desc" } });
}
