import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { db } from "@/lib/db";
import { CounselingClient } from "@/components/app/counseling-client";
import { PageHeader } from "@/components/app/page-header";
import { hmInTz, whenInTz, ymdInTz } from "@/lib/time/tz";
import { asExtra } from "@/components/app/extra-answers";

export const metadata = { title: "Counseling" };

export default async function CounselingPage() {
  const session = await requireModule("counseling");

  const [sessions, members, users, church] = await Promise.all([
    db.counselingSession.findMany({
      where: { churchId: session.churchId },
      orderBy: { date: "desc" },
      take: 1000,
      include: {
        person: { select: { firstName: true, lastName: true, phone: true } },
        counselor: { select: { name: true } },
        _count: { select: { messages: true } },
      },
    }),
    db.person.findMany({
      where: { churchId: session.churchId },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, phone: true },
    }),
    db.user.findMany({ where: { churchId: session.churchId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.church.findUnique({ where: { id: session.churchId }, select: { timezone: true } }),
  ]);
  const tz = church?.timezone ?? "Africa/Accra";

  return (
    <div>
      <PageHeader
        title="Counseling & pastoral care"
        description="Confidential log of counseling sessions, with appointment texts and reminders."
      />

      <CounselingClient
        canWrite={canEdit(session, "counseling")}
        me={session.userId}
        members={members.map((m) => ({ id: m.id, name: `${m.firstName} ${m.lastName}`.trim(), phone: m.phone }))}
        counselors={users}
        sessions={sessions.map((s) => ({
          id: s.id,
          type: s.type,
          summary: s.summary,
          notes: s.notes,
          status: s.status,
          confidential: s.confidential,
          personId: s.personId,
          memberName: s.person ? `${s.person.firstName} ${s.person.lastName}`.trim() : null,
          counseleeName: s.counseleeName,
          phone: s.person?.phone ?? s.counseleePhone ?? null,
          counseleePhone: s.counseleePhone,
          counselorId: s.counselorId,
          counselorName: s.counselor?.name ?? null,
          date: s.date.toISOString(),
          dateYmd: ymdInTz(s.date, tz),
          followUpDate: s.followUpDate?.toISOString() ?? null,
          followUpYmd: s.followUpDate ? ymdInTz(s.followUpDate, tz) : "",
          scheduledAt: s.scheduledAt?.toISOString() ?? null,
          scheduledYmd: s.scheduledAt ? ymdInTz(s.scheduledAt, tz) : "",
          scheduledHm: s.scheduledAt ? hmInTz(s.scheduledAt, tz) : "",
          scheduledLabel: s.scheduledAt ? whenInTz(s.scheduledAt, tz) : null,
          textUpdates: s.textUpdates,
          extra: asExtra(s.extra),
          reminderSent: !!s.reminderSentAt,
          messageCount: s._count.messages,
        }))}
      />
    </div>
  );
}
