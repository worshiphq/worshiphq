"use client";

import { useState } from "react";
import { Pencil, Phone, Mail, CalendarDays, UserRound, HeartPulse, KeyRound, Download, LogOut, Trash2, PauseCircle, PlayCircle, CalendarOff, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Label } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import { setStaffStatus, inviteStaffToPortal, revokeStaffPortal, deleteStaff, linkStaffLogin } from "@/app/actions/staff";
import { EMPLOYMENT_TYPES } from "@/lib/payroll/defaults";
import { StaffFormModal, type StaffFormValues } from "./staff-form";
import { PaySetupCard, type PayProfileView, type PayItemView } from "./pay-setup-card";
import { LoansCard, type LoanView } from "./loans-card";
import { DocumentsCard, type DocView } from "./documents-card";
import { BusyButton } from "./busy-button";
import { Initials, ghs, fmtDay, field } from "./ui";
import { cn } from "@/lib/utils";

const TYPE_LABEL = Object.fromEntries(EMPLOYMENT_TYPES.map((t) => [t.value, t.label]));

export interface StaffProfileProps {
  staff: StaffFormValues & { id: string; staffNo: string | null; status: string; endDate: string | null; endReason: string | null; departmentName: string | null; reportsToName: string | null; photoUrl: string | null; memberName: string | null; createdAt: string };
  login: { linked: boolean; name: string | null; portalOnly: boolean; pending: boolean } | null;
  canEditStaff: boolean;
  payroll: "view" | "manage" | null;
  statutory: boolean;
  pay: PayProfileView | null;
  payItems: PayItemView[];
  loans: LoanView[];
  payslips: { lineId: string; title: string; net: number; year: number; month: number }[];
  leave: { typeId: string; name: string; color: string; paid: boolean; entitlement: number; used: number; balance: number }[];
  docs: DocView[];
  departments: { id: string; name: string }[];
  team: { id: string; name: string }[];
  accounts: { id: string; name: string }[];
  defaultAccountId: string | null;
  portalOn: boolean;
}

export function StaffProfileClient(p: StaffProfileProps) {
  const s = p.staff;
  const [editing, setEditing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [linking, setLinking] = useState(false);
  const manage = p.payroll === "manage";
  const statusCls = s.status === "active" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : s.status === "suspended" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-surface-2 text-ink-faint";

  return (
    <div className="space-y-5">
      {/* Header */}
      <Card className="overflow-hidden p-0">
        <div className="h-16 bg-gradient-to-r from-primary/25 via-primary/10 to-transparent" />
        <div className="-mt-8 flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-end gap-4">
            <div className="rounded-full ring-4 ring-surface"><Initials name={`${s.firstName} ${s.lastName}`} photoUrl={s.photoUrl} size="lg" /></div>
            <div className="min-w-0 pb-1">
              <h1 className="truncate font-display text-2xl font-bold">{s.firstName} {s.lastName}</h1>
              <div className="flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
                <span>{s.jobTitle ?? TYPE_LABEL[s.employmentType ?? "full_time"]}</span>
                {s.departmentName && <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">{s.departmentName}</span>}
                <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-semibold capitalize", statusCls)}>{s.status}</span>
                {s.staffNo && <span className="text-xs text-ink-faint">{s.staffNo}</span>}
              </div>
            </div>
          </div>
          {p.canEditStaff && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}><Pencil className="size-4" /> Edit</Button>
              {s.status === "active" && <BusyButton size="sm" variant="ghost" pendingLabel="Saving…" run={() => setStaffStatus(s.id, "suspended", null, null)}><PauseCircle className="size-4" /> Suspend</BusyButton>}
              {s.status !== "active" && <BusyButton size="sm" variant="ghost" pendingLabel="Saving…" run={() => setStaffStatus(s.id, "active", null, null)}><PlayCircle className="size-4" /> Make active</BusyButton>}
              {s.status !== "left" && <Button size="sm" variant="ghost" onClick={() => setLeaving(true)}><LogOut className="size-4" /> Mark as left</Button>}
            </div>
          )}
        </div>
        {s.status === "left" && <div className="border-t border-line bg-surface-2/50 px-5 py-2 text-sm text-ink-muted">Left on {fmtDay(s.endDate)}{s.endReason ? `: ${s.endReason}` : ""}</div>}
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {p.payroll && <PaySetupCard staffId={s.id} pay={p.pay} items={p.payItems} canManage={manage} statutory={p.statutory} />}
          {p.payroll && <LoansCard staffId={s.id} loans={p.loans} accounts={p.accounts} canManage={manage} defaultAccountId={p.defaultAccountId} />}
          {p.payroll && (
            <Card className="p-5">
              <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold"><FileText className="size-5 text-primary" /> Payslips</h3>
              {p.payslips.length === 0 ? <p className="text-sm text-ink-muted">No paid payslips yet.</p> : (
                <ul className="divide-y divide-line-soft">
                  {p.payslips.map((ps) => (
                    <li key={ps.lineId} className="flex items-center justify-between gap-3 py-2">
                      <span className="text-sm">{ps.title}</span>
                      <span className="ml-auto text-sm font-semibold tabular-nums">{ghs(ps.net)}</span>
                      <a href={`/api/payroll/payslip/${ps.lineId}?download=1`} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10"><Download className="size-3.5" /> PDF</a>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          <DocumentsCard staffId={s.id} docs={p.docs} canUpload={p.canEditStaff} canPayrollOnly={manage} />
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <h3 className="mb-3 font-display text-lg font-semibold">Details</h3>
            <dl className="space-y-2.5 text-sm">
              {s.phone && <div className="flex items-center gap-2"><Phone className="size-4 text-ink-faint" /><a href={`tel:${s.phone}`} className="hover:text-primary">{s.phone}</a></div>}
              {s.email && <div className="flex items-center gap-2 break-all"><Mail className="size-4 shrink-0 text-ink-faint" />{s.email}</div>}
              <div className="flex items-center gap-2"><CalendarDays className="size-4 text-ink-faint" />{s.startDate ? `Started ${fmtDay(s.startDate)}` : "Start date not set"}</div>
              <div className="flex items-center gap-2"><UserRound className="size-4 text-ink-faint" />{TYPE_LABEL[s.employmentType ?? "full_time"]}{s.reportsToName ? `, reports to ${s.reportsToName}` : ""}</div>
              {s.memberName && <div className="text-xs text-ink-faint">Linked to the member record of {s.memberName}</div>}
            </dl>
          </Card>
          <Card className="p-5">
            <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold"><HeartPulse className="size-5 text-primary" /> Emergency contact</h3>
            {s.emergencyName ? (
              <div className="text-sm"><div className="font-medium">{s.emergencyName}{s.emergencyRelation ? ` (${s.emergencyRelation})` : ""}</div>{s.emergencyPhone && <a href={`tel:${s.emergencyPhone}`} className="text-ink-muted hover:text-primary">{s.emergencyPhone}</a>}</div>
            ) : <p className="text-sm text-ink-muted">Not added.</p>}
          </Card>
          <Card className="p-5">
            <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold"><CalendarOff className="size-5 text-primary" /> Leave this year</h3>
            {p.leave.length === 0 ? <p className="text-sm text-ink-muted">No leave types yet. Open Staff, Leave to set them up.</p> : (
              <ul className="space-y-3">
                {p.leave.map((l) => (
                  <li key={l.typeId}>
                    <div className="flex justify-between text-sm"><span>{l.name}</span><span className="font-semibold tabular-nums">{l.balance} left</span></div>
                    {l.entitlement > 0 && <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${Math.min(100, (l.used / l.entitlement) * 100)}%`, background: l.color }} /></div>}
                    <div className="mt-0.5 text-[11px] text-ink-faint">{l.used} of {l.entitlement} days used{l.paid ? "" : " (unpaid)"}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {p.payroll && (
            <Card className="p-5">
              <h3 className="mb-2 flex items-center gap-2 font-display text-lg font-semibold"><KeyRound className="size-5 text-primary" /> Login and My pay</h3>
              {p.login?.linked ? (
                <>
                  <p className="text-sm text-ink-muted">{p.login.portalOnly ? "Has a staff login (My pay only)." : `Linked to the team login of ${p.login.name}.`}{p.login.pending ? " The invite has not been accepted yet." : ""}</p>
                  {manage && <BusyButton size="sm" variant="ghost" className="mt-2 text-danger" pendingLabel="Removing…" confirm="Remove this login from the staff record?" run={() => revokeStaffPortal(s.id)}>{p.login.portalOnly ? "Remove staff login" : "Unlink login"}</BusyButton>}
                </>
              ) : (
                <>
                  <p className="text-sm text-ink-muted">Staff with a login see their payslips and request leave in My pay.</p>
                  {manage && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {p.portalOn && <BusyButton size="sm" pendingLabel="Sending invite…" run={() => inviteStaffToPortal(s.id)}>Give portal access</BusyButton>}
                      <Button size="sm" variant="ghost" onClick={() => setLinking(true)}>Link a team login</Button>
                    </div>
                  )}
                </>
              )}
            </Card>
          )}
          {manage && (
            <BusyButton variant="ghost" size="sm" className="text-danger" pendingLabel="Deleting…" confirm="Delete this staff record for good? Someone already paid through payroll can only be marked as left." run={() => deleteStaff(s.id)} onDone={(r) => { if (r.ok) window.location.assign("/app/staff"); }}>
              <Trash2 className="size-4" /> Delete staff record
            </BusyButton>
          )}
        </div>
      </div>

      {editing && <StaffFormModal open onClose={() => setEditing(false)} initial={s} departments={p.departments} team={p.team} />}
      {leaving && <LeaveDialog staffId={s.id} onClose={() => setLeaving(false)} />}
      {linking && <LinkDialog staffId={s.id} team={p.team} onClose={() => setLinking(false)} />}
    </div>
  );
}

function LeaveDialog({ staffId, onClose }: { staffId: string; onClose: () => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  return (
    <Modal open onClose={onClose} title="Mark as left" description="Their records stay. They are left out of future payrolls, and any staff login stops working.">
      <div className="space-y-4">
        <div><Label htmlFor="lv-d">Last day</Label><Input id="lv-d" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><Label htmlFor="lv-r">Reason (optional)</Label><Input id="lv-r" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Resigned" /></div>
        <BusyButton className="w-full" pendingLabel="Saving…" run={() => setStaffStatus(staffId, "left", date, reason)} onDone={(r) => r.ok && onClose()}>Mark as left</BusyButton>
      </div>
    </Modal>
  );
}

function LinkDialog({ staffId, team, onClose }: { staffId: string; team: { id: string; name: string }[]; onClose: () => void }) {
  const [userId, setUserId] = useState("");
  const router = useRouter();
  return (
    <Modal open onClose={onClose} title="Link a team login" description="For staff who already sign in to WorshipHQ. They get My pay next to what their role allows.">
      <div className="space-y-4">
        <select className={field} value={userId} onChange={(e) => setUserId(e.target.value)} aria-label="Team member"><option value="">Choose someone</option>{team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        <BusyButton className="w-full" disabled={!userId} pendingLabel="Linking…" run={() => linkStaffLogin(staffId, userId)} onDone={(r) => { if (r.ok) { onClose(); router.refresh(); } }}>Link login</BusyButton>
      </div>
    </Modal>
  );
}
