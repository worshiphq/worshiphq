import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { CounselingClient } from "@/components/app/counseling-client";
import { createCounselingSession } from "@/app/actions/counseling";
import { PageHeader } from "@/components/app/page-header";
import { ActionDialog, Field } from "@/components/app/action-dialog";
import { Plus } from "lucide-react";

export const metadata = { title: "Counseling" };

export default async function CounselingPage() {
  const session = await requireModule("counseling");

  const [sessions, members] = await Promise.all([
    db.counselingSession.findMany({
      where: { churchId: session.churchId },
      orderBy: { date: "desc" },
      take: 200,
      include: {
        person: { select: { firstName: true, lastName: true } },
        counselor: { select: { name: true } },
      },
    }),
    db.person.findMany({
      where: { churchId: session.churchId },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);

  const memberOptions = members.map((m) => ({ label: `${m.firstName} ${m.lastName}`, value: m.id }));

  return (
    <div>
      <PageHeader
        title="Counseling & pastoral care"
        description="Confidential log of counseling sessions and follow-ups."
      >
        <ActionDialog
          triggerLabel="New session"
          triggerIcon={<Plus />}
          title="Log counseling session"
          description="Record a counseling or pastoral care session."
          submitLabel="Save"
          action={createCounselingSession}
          disabled={session.isDemo}
        >
          <Field label="Type" name="type" type="select" options={[
            { label: "General", value: "general" },
            { label: "Marriage", value: "marriage" },
            { label: "Grief", value: "grief" },
            { label: "Spiritual", value: "spiritual" },
            { label: "Family", value: "family" },
            { label: "Addiction", value: "addiction" },
            { label: "Other", value: "other" },
          ]} />
          <Field label="Member (optional)" name="personId" type="select" options={[{ label: "— None / not a member —", value: "" }, ...memberOptions]} />
          <Field label="Or type a name (for a visitor / non-member)" name="counseleeName" placeholder="e.g. Kofi Mensah" hint="Use this when the person isn't in your members list." />
          <Field label="Date" name="date" type="date" />
          <Field label="Follow-up date" name="followUpDate" type="date" />
          <Field label="Summary" name="summary" placeholder="Brief summary of the session..." required />
          <Field label="Notes (confidential)" name="notes" type="textarea" rows={5} placeholder="Detailed notes..." />
        </ActionDialog>
      </PageHeader>

      <CounselingClient
        sessions={sessions.map((s) => ({
          id: s.id,
          type: s.type,
          summary: s.summary,
          notes: s.notes,
          status: s.status,
          confidential: s.confidential,
          memberName: s.person ? `${s.person.firstName} ${s.person.lastName}` : null,
          counselorName: s.counselor?.name ?? null,
          date: s.date.toISOString(),
          followUpDate: s.followUpDate?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
