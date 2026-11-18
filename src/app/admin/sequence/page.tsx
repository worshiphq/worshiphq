import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminShell, AdminCard } from "@/components/admin/admin-shell";
import { SequenceSettingsForm, SequenceStepCard } from "@/components/admin/sequence-client";
import { STEPS, type StepId } from "@/lib/lifecycle/steps";
import { buildEmail, dueEmails, getSequenceSettings, mergeData } from "@/lib/lifecycle/run";
import { SAMPLE } from "@/lib/lifecycle/sample";
import { paidPlan } from "@/lib/plan-gate";
import { ttlCached } from "@/lib/ttl-cache";

export const metadata = { title: "Email sequence" };

const DAY = 86_400_000;

export default async function AdminSequencePage() {
  const sa = await requireSuperAdmin();
  const settings = await getSequenceSettings();
  // Who would get an email if it ran right now (read-only), as if the sequence were on with every email allowed.
  const [{ list, live }, sends, optOuts] = await Promise.all([
    // Slow to work out, so kept for 10 minutes.
    ttlCached("sequence-due", 10 * 60_000, () => dueEmails(new Date(), { ...settings, steps: Object.fromEntries(STEPS.map((s) => [s.id, true])) })),
    db.lifecycleSend.findMany({ where: { status: { in: ["sent", "stubbed"] } }, select: { step: true, churchId: true, email: true, sentAt: true, status: true }, orderBy: { sentAt: "desc" } }),
    db.emailOptOut.count(),
  ]);

  // What happened after each email: the churches it went to, and what they have done since.
  const churchIds = [...new Set(sends.map((s) => s.churchId).filter((x): x is string => !!x))];
  const [withMembers, withAttendance, subs, signedUp] = await Promise.all([
    db.person.groupBy({ by: ["churchId"], where: { churchId: { in: churchIds } } }),
    db.attendanceRecord.groupBy({ by: ["churchId"], where: { churchId: { in: churchIds } } }),
    db.subscription.findMany({ where: { churchId: { in: churchIds } }, select: { churchId: true, plan: true, status: true, renewsAt: true } }),
    db.user.findMany({ where: { email: { in: sends.filter((s) => s.step === "finish-signup").map((s) => s.email) } }, select: { email: true } }),
  ]);
  const hasMembers = new Set(withMembers.map((r) => r.churchId));
  const tookAttendance = new Set(withAttendance.map((r) => r.churchId));
  const paid = new Set(subs.filter((s) => paidPlan(s) !== "free").map((s) => s.churchId));
  const finished = new Set(signedUp.map((u) => u.email));

  const since30 = Date.now() - 30 * DAY;
  const sample = mergeData(live, { ...SAMPLE, resume: "sample" });
  const rows = STEPS.map((s) => {
    const mine = sends.filter((x) => x.step === s.id);
    const ids = [...new Set(mine.map((x) => x.churchId).filter((x): x is string => !!x))];
    const count = (set: Set<string>) => ids.filter((id) => set.has(id)).length;
    const outcome = !mine.length ? null
      : s.id === "finish-signup" ? `${mine.filter((x) => finished.has(x.email)).length} of ${mine.length} have since created their church.`
      : s.id === "add-members" ? `${count(hasMembers)} of ${ids.length} have since added members.`
      : s.id === "ready-for-sunday" || s.id === "need-help" ? `${count(tookAttendance)} of ${ids.length} have since taken attendance.`
      : `${count(paid)} of ${ids.length} are now on a paid plan.`;
    return {
      id: s.id,
      label: s.label,
      when: s.when,
      subject: buildEmail(s.id as StepId, sample).subject,
      html: buildEmail(s.id as StepId, sample, "#", s.id === "finish-signup").html,
      sent30: mine.filter((x) => x.sentAt.getTime() >= since30).length,
      sentAll: mine.length,
      dueNow: list.filter((c) => (c.kind === "signup" ? "finish-signup" : c.step) === s.id).length,
      outcome,
    };
  });
  const today = sends.filter((s) => s.sentAt.getTime() >= new Date().setUTCHours(0, 0, 0, 0)).length;

  return (
    <AdminShell email={sa.email} isOwner={sa.role === "owner"}>
      <div className="mb-6">
        <h1 className="text-lg font-bold tracking-tight">Email sequence</h1>
        <p className="max-w-3xl text-sm text-slate-400">
          Automatic emails that take each church from sign-up to its first Sunday, then to a paid plan. Each email goes only while it still applies,
          at most one every 2 days per church, never on a Sunday, and each email only once. Numbers in the emails are the church&rsquo;s own, and prices and limits come from your live plan settings.
          Previews and tests use a made-up church.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminCard className="p-4"><div className="text-2xl font-bold">{list.length}</div><div className="text-xs text-slate-400">due right now</div></AdminCard>
        <AdminCard className="p-4"><div className="text-2xl font-bold">{today}</div><div className="text-xs text-slate-400">sent today (cap {settings.dailyCap})</div></AdminCard>
        <AdminCard className="p-4"><div className="text-2xl font-bold">{sends.length}</div><div className="text-xs text-slate-400">sent in total</div></AdminCard>
        <AdminCard className="p-4"><div className="text-2xl font-bold">{optOuts}</div><div className="text-xs text-slate-400">pressed &ldquo;Stop these emails&rdquo;</div></AdminCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[22rem_1fr]">
        <AdminCard className="h-fit p-5">
          <SequenceSettingsForm initial={settings} steps={rows} isOwner={sa.role === "owner"} />
        </AdminCard>
        <div className="space-y-3">
          {rows.map((r) => <SequenceStepCard key={r.id} step={r} />)}
        </div>
      </div>
    </AdminShell>
  );
}
