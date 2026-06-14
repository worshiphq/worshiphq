import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trash2, Users } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { getAttendanceSession, getCheckInCandidates } from "@/lib/data/attendance";
import { deleteSession } from "@/app/actions/attendance";
import { MembershipDonut } from "@/components/app/charts";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { CheckInPanel } from "@/components/app/check-in-panel";

export const metadata = { title: "Service attendance" };

export default async function AttendanceSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const [data, candidates] = await Promise.all([
    getAttendanceSession(session.churchId, id),
    getCheckInCandidates(session.churchId, id),
  ]);
  if (!data) notFound();

  const checkInUrl = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/checkin/${data.id}`;
  const donutData = data.breakdown.filter((b) => b.count > 0).map((b) => ({ name: b.name, count: b.count }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/app/attendance" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
          <ArrowLeft className="size-4" /> All services
        </Link>
        {!session.isDemo && (
          <form action={deleteSession.bind(null, data.id)}>
            <SubmitButton variant="ghost" size="sm" overlay={false} pendingLabel="Deleting…" className="text-danger">
              <Trash2 className="size-4" /> Delete service
            </SubmitButton>
          </form>
        )}
      </div>

      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">{data.serviceName}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {new Date(data.date).toLocaleDateString("en-GH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          {data.branch ? ` · ${data.branch}` : ""}
        </p>
      </div>

      {/* Summary */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="flex flex-col items-center justify-center p-6 text-center">
          <div className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary-bright">
            <Users className="size-7" />
          </div>
          <div className="mt-3 font-display text-4xl font-bold tracking-tight">{data.total}</div>
          <div className="text-sm text-ink-muted">total present</div>
        </Card>

        <Card className="lg:col-span-2">
          <div className="border-b border-line p-5"><h3 className="font-display text-lg font-semibold">Who was here</h3><p className="text-sm text-ink-muted">Demographic breakdown</p></div>
          <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
            {data.breakdown.map((b) => (
              <div key={b.key} className="rounded-xl border border-line bg-base p-4 text-center">
                <div className="font-display text-2xl font-bold">{b.count}</div>
                <div className="text-xs text-ink-muted">{b.name}</div>
              </div>
            ))}
          </div>
          {donutData.length > 0 && (
            <div className="px-5 pb-5">
              <MembershipDonut data={donutData} />
            </div>
          )}
        </Card>
      </div>

      {/* Check-in */}
      <CheckInPanel
        sessionId={data.id}
        candidates={candidates}
        attendees={data.attendees}
        checkInUrl={checkInUrl}
        canWrite={!session.isDemo}
      />
    </div>
  );
}
