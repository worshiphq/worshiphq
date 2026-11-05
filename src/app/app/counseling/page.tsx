import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { db } from "@/lib/db";
import { CounselingClient } from "@/components/app/counseling-client";
import { PageHeader } from "@/components/app/page-header";
import { queryCounseling, counselingMeta } from "@/lib/data/lists-b";

export const metadata = { title: "Counseling" };

export default async function CounselingPage() {
  const session = await requireModule("counseling");

  const [first, meta, users] = await Promise.all([
    queryCounseling(session.churchId, "", { status: "all", type: "", counselorId: "", sinceMs: null, quick: "" }, 1),
    counselingMeta(session.churchId),
    db.user.findMany({ where: { churchId: session.churchId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Counseling & pastoral care"
        description="Confidential log of counseling sessions, with appointment texts and reminders."
      />

      <CounselingClient
        canWrite={canEdit(session, "counseling")}
        me={session.userId}
        counselors={users}
        initial={first}
        meta={meta}
      />
    </div>
  );
}
