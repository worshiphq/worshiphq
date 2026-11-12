"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Crown, UserPlus, X, Loader2, Search, Shield, Lock, Pencil, Trash2, Send, Wallet, Check, ChevronLeft, ChevronRight,
  Eye, PenLine, Clock, Phone, Mail, Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { useFeedback } from "@/components/ui/feedback";
import { confirmBinDelete } from "@/lib/recycle-bin-events";
import { BIN_TOAST } from "@/lib/recycle-bin-config";
import { SECTION_GROUPS } from "@/lib/permissions";
import { roleLabel } from "@/lib/roles";
import { cn } from "@/lib/utils";
import {
  ROLE_BLURB, ROLE_TEMPLATES, AREAS, accessFor, accessSummary, builtinKeys, menuFor, type TeamRoleChoice,
} from "@/lib/team-access";
import {
  inviteTeammate, inviteBudgetLeader, changeUserRole, removeTeamMember, resendTeamInvite,
  createCustomRole, updateCustomRole, deleteCustomRole, updateRolePermissions, setBudgetDepartment, type ActionResult,
} from "@/app/actions/settings";
import type { Role } from "@/lib/demo/data";

export type TeamMember = {
  id: string; name: string; email: string | null; phone: string | null; photoUrl: string | null;
  role: string; customRole: { id: string; name: string } | null; budgetDepartment: { id: string; name: string } | null;
  pending: boolean; joinedAt: string;
};
export type TeamCustomRole = { id: string; name: string; sections: string[]; manageSections: string[]; canDelete: boolean };

const BUILT_INS: Role[] = ["Admin", "Pastor", "Finance", "Media", "Leader", "Volunteer"];

type Props = {
  me: { id: string; role: string; isDemo: boolean };
  members: TeamMember[];
  customRoles: TeamCustomRole[];
  departments: { id: string; name: string }[];
  rolePermissions: Record<string, string[]> | null;
  seats: { used: number; limit: number | null };
  customRolesLocked: boolean;
};

/** The role a member holds, as a choice the access helpers understand. */
function choiceOf(m: TeamMember, customRoles: TeamCustomRole[]): TeamRoleChoice {
  if (m.budgetDepartment) return { kind: "budget", departmentId: m.budgetDepartment.id, departmentName: m.budgetDepartment.name };
  const cr = m.customRole && customRoles.find((r) => r.id === m.customRole!.id);
  if (cr) return { kind: "custom", ...cr };
  return { kind: "builtin", role: m.role as Role };
}
const choiceName = (c: TeamRoleChoice) => c.kind === "budget" ? `${c.departmentName} budget leader` : c.kind === "custom" ? c.name : roleLabel(c.role);
const choiceValue = (c: TeamRoleChoice) => c.kind === "custom" ? `custom:${c.id}` : c.kind === "budget" ? `budget:${c.departmentId}` : c.role;

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
}
function Avatar({ m, size = "md" }: { m: Pick<TeamMember, "name" | "photoUrl">; size?: "md" | "lg" }) {
  const cls = size === "lg" ? "size-14 text-lg" : "size-11 text-sm";
  // eslint-disable-next-line @next/next/no-img-element
  if (m.photoUrl) return <img src={m.photoUrl} alt="" className={cn(cls, "shrink-0 rounded-full object-cover")} />;
  return <div className={cn(cls, "grid shrink-0 place-items-center rounded-full bg-primary/15 font-semibold text-primary-bright")}>{initials(m.name)}</div>;
}
/** Placeholder emails made from a phone number are not real addresses, so they are never shown. */
const realEmail = (e: string | null) => (e && !e.endsWith("@invite.worshiphq.app") ? e : null);

function Drawer({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-line bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-lg hover:bg-surface-2"><X className="size-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain p-5">{children}</div>
        {footer && <div className="border-t border-line px-5 py-4">{footer}</div>}
      </div>
    </>
  );
}

/** The menu someone would see, so nobody has to guess what a role means. */
function MenuPreview({ choice, rolePermissions }: { choice: TeamRoleChoice; rolePermissions: Record<string, string[]> | null }) {
  const a = accessFor(choice, rolePermissions);
  const groups = menuFor(a);
  return (
    <div className="rounded-xl border border-line bg-surface-2/40 p-3">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-semibold uppercase tracking-wide text-ink-faint">What they will see</span>
        <span className="flex items-center gap-3 text-ink-faint"><span className="flex items-center gap-1"><PenLine className="size-3" /> can edit</span><span className="flex items-center gap-1"><Eye className="size-3" /> view only</span></span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {groups.map((g) => (
          <div key={g.title}>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{g.title}</div>
            <ul className="space-y-0.5">
              {g.items.map((i) => (
                <li key={i.label} className="flex items-center gap-1.5 text-sm">
                  {i.edit ? <PenLine className="size-3 shrink-0 text-primary" /> : <Eye className="size-3 shrink-0 text-ink-faint" />}
                  <span className={i.edit ? "text-ink" : "text-ink-muted"}>{i.label}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Pick a role from cards that say what each one does. */
function RolePicker({ value, onChange, customRoles, departments, rolePermissions, allowAdmin, customRolesLocked }: {
  value: string; onChange: (c: TeamRoleChoice) => void; customRoles: TeamCustomRole[]; departments: { id: string; name: string }[];
  rolePermissions: Record<string, string[]> | null; allowAdmin: boolean; customRolesLocked: boolean;
}) {
  const [dept, setDept] = useState(value.startsWith("budget:") ? value.slice(7) : departments[0]?.id ?? "");
  const card = (key: string, active: boolean, title: React.ReactNode, blurb: string, onClick: () => void, disabled = false) => (
    <button key={key} type="button" disabled={disabled} onClick={onClick}
      className={cn("w-full rounded-xl border p-3 text-left transition-colors", active ? "border-primary/60 bg-primary/10" : "border-line hover:bg-surface-2", disabled && "cursor-not-allowed opacity-50")}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{title}</span>
        {active && <Check className="size-4 text-primary" />}
      </div>
      <p className="mt-0.5 text-xs text-ink-muted">{blurb}</p>
    </button>
  );
  return (
    <div className="space-y-2">
      {BUILT_INS.map((r) => card(r, value === r, roleLabel(r), `${ROLE_BLURB[r]}`, () => onChange({ kind: "builtin", role: r }), r === "Admin" && !allowAdmin))}
      {customRoles.length > 0 && <div className="pt-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Your church&rsquo;s roles</div>}
      {customRoles.map((r) => card(r.id, value === `custom:${r.id}`, r.name, accessSummary(accessFor({ kind: "custom", ...r }, rolePermissions)), () => onChange({ kind: "custom", ...r }), customRolesLocked))}
      <div className="pt-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Department budget</div>
      {departments.length === 0
        ? <p className="rounded-xl border border-dashed border-line p-3 text-xs text-ink-muted">Add a department first (Departments tab) to give someone only that department&rsquo;s budget.</p>
        : (
          <div className={cn("rounded-xl border p-3", value.startsWith("budget:") ? "border-primary/60 bg-primary/10" : "border-line")}>
            <button type="button" className="w-full text-left" onClick={() => { const d = departments.find((x) => x.id === dept) ?? departments[0]!; onChange({ kind: "budget", departmentId: d.id, departmentName: d.name }); }}>
              <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5 font-medium"><Wallet className="size-4" /> Budget leader</span>{value.startsWith("budget:") && <Check className="size-4 text-primary" />}</div>
              <p className="mt-0.5 text-xs text-ink-muted">Records income and expenses for one department and sees nothing else.</p>
            </button>
            <select value={dept} onChange={(e) => { setDept(e.target.value); const d = departments.find((x) => x.id === e.target.value)!; onChange({ kind: "budget", departmentId: d.id, departmentName: d.name }); }}
              className="mt-2 h-9 w-full rounded-lg border border-line bg-surface px-2 text-sm" aria-label="Department">
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        )}
    </div>
  );
}

/** None / View / Edit for every section, grouped like the menu. */
function AccessGrid({ view, manage, setView, setManage }: { view: Set<string>; manage: Set<string>; setView: (s: Set<string>) => void; setManage: (s: Set<string>) => void }) {
  const level = (k: string) => (manage.has(k) ? "edit" : view.has(k) ? "view" : "none");
  const setLevel = (keys: string[], l: "none" | "view" | "edit", manageable: (k: string) => boolean) => {
    const v = new Set(view), m = new Set(manage);
    for (const k of keys) {
      if (l === "none") { v.delete(k); m.delete(k); }
      else if (l === "view" || !manageable(k)) { v.add(k); m.delete(k); }
      else { v.add(k); m.add(k); }
    }
    setView(v); setManage(m);
  };
  const isManageable = (k: string) => !!SECTION_GROUPS.flatMap((g) => g.sections).find((s) => s.key === k)?.manageable;
  const Seg = ({ k, manageable }: { k: string; manageable: boolean }) => (
    <div className="inline-flex rounded-lg border border-line p-0.5 text-xs">
      {(["none", "view", "edit"] as const).map((l) => {
        if (l === "edit" && !manageable) return <span key={l} className="w-12 px-2 py-1 text-center text-ink-faint/40">-</span>;
        const on = level(k) === l;
        return (
          <button key={l} type="button" onClick={() => setLevel([k], l, isManageable)} aria-pressed={on}
            className={cn("w-12 rounded-md px-2 py-1 capitalize", on ? (l === "none" ? "bg-surface-2 text-ink" : "bg-primary/15 font-semibold text-primary-bright") : "text-ink-muted hover:text-ink")}>
            {l === "none" ? "Off" : l}
          </button>
        );
      })}
    </div>
  );
  return (
    <div className="space-y-4">
      {SECTION_GROUPS.map((g) => {
        const keys = g.sections.map((s) => s.key);
        return (
          <div key={g.category}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{g.category}</span>
              <span className="flex gap-2 text-[11px]">
                <button type="button" className="text-ink-faint hover:text-ink" onClick={() => setLevel(keys, "none", isManageable)}>All off</button>
                <button type="button" className="text-ink-faint hover:text-ink" onClick={() => setLevel(keys, "view", isManageable)}>All view</button>
                <button type="button" className="text-primary hover:underline" onClick={() => setLevel(keys, "edit", isManageable)}>All edit</button>
              </span>
            </div>
            <div className="divide-y divide-line-soft rounded-xl border border-line">
              {g.sections.map((s) => (
                <div key={s.key} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className={cn("text-sm", level(s.key) !== "none" ? "font-medium" : "text-ink-muted")}>{s.label}</span>
                  <Seg k={s.key} manageable={!!s.manageable} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TeamTab({ me, members, customRoles, departments, rolePermissions, seats, customRolesLocked }: Props) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "admins" | "pending">("all");
  const [open, setOpen] = useState<TeamMember | null>(null);
  const [inviting, setInviting] = useState(false);
  const [roleEditor, setRoleEditor] = useState<{ kind: "custom"; role: TeamCustomRole | null; template?: (typeof ROLE_TEMPLATES)[number] } | { kind: "builtin"; role: Role } | null>(null);

  const isOwner = me.role === "Owner";
  const canManageTeam = !me.isDemo && (isOwner || me.role === "Admin");
  const full = seats.limit != null && seats.used >= seats.limit;

  /** Run a server action, show what happened, and refresh. */
  const act = (key: string, fn: () => Promise<ActionResult>, ok: string, after?: () => void) => {
    setBusy(key);
    start(async () => {
      try {
        const r = await fn();
        if (r.ok) { toast(ok, "success"); after?.(); router.refresh(); }
        else toast(r.error, "error");
      } catch (e) {
        toast(e instanceof Error ? e.message : "Something went wrong.", "error");
      } finally { setBusy(null); }
    });
  };

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return members
      .filter((m) => filter === "all" || (filter === "admins" ? m.role === "Owner" || m.role === "Admin" : m.pending))
      .filter((m) => !t || `${m.name} ${m.email ?? ""} ${m.phone ?? ""} ${choiceName(choiceOf(m, customRoles))}`.toLowerCase().includes(t))
      .sort((a, b) => (a.role === "Owner" ? -1 : b.role === "Owner" ? 1 : 0));
  }, [members, q, filter, customRoles]);
  const pendingCount = members.filter((m) => m.pending).length;
  const canEditMember = (m: TeamMember) => canManageTeam && m.id !== me.id && m.role !== "Owner" && !(m.role === "Admin" && !isOwner);

  return (
    <div className="space-y-6">
      {/* ── People ── */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
          <div>
            <h3 className="font-display text-lg font-semibold">Your team</h3>
            <p className="text-sm text-ink-muted">
              {seats.limit == null ? `${seats.used} ${seats.used === 1 ? "person" : "people"} can sign in` : `${seats.used} of ${seats.limit} places used on your plan`}
              {pendingCount > 0 && ` · ${pendingCount} invite${pendingCount === 1 ? "" : "s"} waiting`}
            </p>
            {seats.limit != null && (
              <div className="mt-2 h-1.5 w-56 overflow-hidden rounded-full bg-surface-2">
                <div className={cn("h-full rounded-full", full ? "bg-amber-500" : "bg-primary")} style={{ width: `${Math.min(100, (seats.used / Math.max(1, seats.limit)) * 100)}%` }} />
              </div>
            )}
          </div>
          {canManageTeam && (
            full
              ? <a href="/app/settings?tab=billing" className="inline-flex h-10 items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 text-sm font-semibold text-amber-700 dark:text-amber-400"><Lock className="size-4" /> Team full. Upgrade for more</a>
              : <Button onClick={() => setInviting(true)}><UserPlus className="size-4" /> Invite someone</Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-5 py-3">
          {([["all", `Everyone (${members.length})`], ["admins", "Admins"], ["pending", `Waiting to join (${pendingCount})`]] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} className={cn("rounded-full border px-3 py-1 text-xs", filter === k ? "border-primary/50 bg-primary/10 font-semibold text-primary-bright" : "border-line text-ink-muted hover:bg-surface-2")}>{label}</button>
          ))}
          {members.length > 6 && (
            <div className="relative ml-auto">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find someone" aria-label="Find someone on the team" className="h-9 w-52 rounded-lg border border-line bg-surface pl-8 pr-3 text-sm" />
            </div>
          )}
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((m) => {
            const c = choiceOf(m, customRoles);
            const a = accessFor(c, rolePermissions);
            return (
              <button key={m.id} type="button" onClick={() => setOpen(m)}
                className="group flex flex-col rounded-2xl border border-line bg-surface p-4 text-left transition-colors hover:border-primary/40 hover:bg-surface-2/40">
                <div className="flex items-start gap-3">
                  <Avatar m={m} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 truncate font-medium">
                      {m.name}{m.id === me.id && <span className="text-xs font-normal text-ink-faint">(you)</span>}
                    </div>
                    <span className={cn("mt-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
                      m.role === "Owner" ? "bg-gold/15 text-[#a8742a] dark:text-gold" : m.role === "Admin" ? "bg-primary/15 text-primary-bright" : "bg-surface-2 text-ink-muted")}>
                      {m.role === "Owner" && <Crown className="size-3" />}{c.kind === "budget" && <Wallet className="size-3" />}{choiceName(c)}
                    </span>
                  </div>
                </div>
                <p className="mt-3 line-clamp-2 text-xs text-ink-muted"><span className="text-ink-faint">Can use: </span>{accessSummary(a)}</p>
                <div className="mt-3 flex items-center justify-between text-xs">
                  {m.pending
                    ? <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"><Clock className="size-3.5" /> Invite not accepted yet</span>
                    : <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><span className="size-1.5 rounded-full bg-emerald-500" /> Active</span>}
                  <span className="text-ink-faint group-hover:text-primary">{canEditMember(m) ? "Manage" : "View"} <ChevronRight className="inline size-3" /></span>
                </div>
              </button>
            );
          })}
          {rows.length === 0 && <p className="col-span-full py-8 text-center text-sm text-ink-muted">Nobody matches.</p>}
        </div>
      </Card>

      {/* ── Roles ── */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
          <div>
            <h3 className="flex items-center gap-2 font-display text-lg font-semibold"><Shield className="size-5 text-primary" /> Roles</h3>
            <p className="text-sm text-ink-muted">A role decides what someone sees in the menu and what they can change. Click a role to see or adjust it.</p>
          </div>
          {canManageTeam && (customRolesLocked
            ? <a href="/app/settings?tab=billing" className="inline-flex h-10 items-center gap-2 rounded-xl border border-line px-4 text-sm text-ink-muted hover:bg-surface-2"><Lock className="size-4" /> Your own roles come with Pro</a>
            : <Button variant="secondary" onClick={() => setRoleEditor({ kind: "custom", role: null })}><Sparkles className="size-4" /> Create a role</Button>)}
        </div>
        <div className="divide-y divide-line-soft">
          <RoleRow name="Main Admin" icon={<Crown className="size-4 text-gold" />} blurb={ROLE_BLURB.Owner} summary="Everything" count={members.filter((m) => m.role === "Owner").length} />
          {BUILT_INS.map((r) => {
            const a = accessFor({ kind: "builtin", role: r }, rolePermissions);
            const changed = !!rolePermissions?.[r];
            const canEdit = canManageTeam && !(r === "Admin" && !isOwner);
            return (
              <RoleRow key={r} name={r} blurb={ROLE_BLURB[r]!} summary={accessSummary(a, 6)} changed={changed}
                count={members.filter((m) => m.role === r && !m.customRole && !m.budgetDepartment).length}
                onEdit={canEdit ? () => setRoleEditor({ kind: "builtin", role: r }) : undefined} />
            );
          })}
          {customRoles.map((r) => (
            <RoleRow key={r.id} name={r.name} custom blurb={r.canDelete ? "Your church's role. Can also delete records." : "Your church's role. Cannot delete records."}
              summary={accessSummary(accessFor({ kind: "custom", ...r }, rolePermissions), 6)}
              count={members.filter((m) => m.customRole?.id === r.id).length}
              onEdit={canManageTeam && !customRolesLocked ? () => setRoleEditor({ kind: "custom", role: r }) : undefined} />
          ))}
          {canManageTeam && !customRolesLocked && customRoles.length === 0 && (
            <div className="p-5">
              <div className="text-sm font-medium">Start a role from a template</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {ROLE_TEMPLATES.map((t) => (
                  <button key={t.name} type="button" onClick={() => setRoleEditor({ kind: "custom", role: null, template: t })} title={t.blurb}
                    className="rounded-full border border-line px-3 py-1.5 text-xs hover:border-primary/40 hover:bg-primary/5">{t.name}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* ── Drawers ── */}
      {open && (
        <MemberDrawer key={open.id} m={open} me={me} isOwner={isOwner} canEdit={canEditMember(open)} customRoles={customRoles} departments={departments}
          rolePermissions={rolePermissions} customRolesLocked={customRolesLocked} busy={busy} pending={pending}
          onClose={() => setOpen(null)}
          onSaveRole={(c) => act("role", () => {
            if (c.kind === "budget") {
              const fd = new FormData(); fd.set("userId", open.id); fd.set("departmentId", c.departmentId);
              return setBudgetDepartment(fd);
            }
            const fd = new FormData(); fd.set("userId", open.id); fd.set("role", choiceValue(c));
            return changeUserRole(fd);
          }, `${open.name} is now ${choiceName(c)}`, () => setOpen(null))}
          onResend={() => act("resend", () => resendTeamInvite(open.id), `Invite sent again to ${open.name}`)}
          onRemove={() => {
            if (!confirmBinDelete(`Remove ${open.name} from your team? They will no longer be able to sign in.`)) return;
            const fd = new FormData(); fd.set("userId", open.id);
            act("remove", () => removeTeamMember(fd), BIN_TOAST, () => setOpen(null));
          }}
        />
      )}

      {inviting && (
        <InviteDrawer customRoles={customRoles} departments={departments} rolePermissions={rolePermissions} isOwner={isOwner}
          customRolesLocked={customRolesLocked} busy={busy === "invite"} onClose={() => setInviting(false)}
          onSend={(fd, c) => act("invite", () => (c.kind === "budget" ? inviteBudgetLeader(fd) : inviteTeammate(fd)), `Invite sent to ${fd.get("name")}`, () => setInviting(false))} />
      )}

      {roleEditor?.kind === "custom" && (
        <CustomRoleDrawer role={roleEditor.role} template={roleEditor.template} busy={busy} onClose={() => setRoleEditor(null)}
          onSave={(fd) => act("saverole", () => (roleEditor.role ? updateCustomRole(fd) : createCustomRole(fd)), roleEditor.role ? "Role updated" : "Role created", () => setRoleEditor(null))}
          onDelete={roleEditor.role ? () => {
            const r = roleEditor.role!;
            if (!confirmBinDelete(`Delete the "${r.name}" role? People on it go back to the Volunteer role.`)) return;
            act("delrole", () => deleteCustomRole(r.id), BIN_TOAST, () => setRoleEditor(null));
          } : undefined} />
      )}

      {roleEditor?.kind === "builtin" && (
        <BuiltinRoleDrawer role={roleEditor.role} current={builtinKeys(roleEditor.role, rolePermissions)} busy={busy === "builtin"} onClose={() => setRoleEditor(null)}
          onSave={(keys) => {
            const fd = new FormData(); fd.set("role", roleEditor.role); keys.forEach((k) => fd.append("sections", k));
            act("builtin", () => updateRolePermissions(fd), `${roleEditor.role} updated`, () => setRoleEditor(null));
          }} />
      )}
    </div>
  );
}


function RoleRow({ name, blurb, summary, count, onEdit, custom, changed, icon }: { name: string; blurb: string; summary: string; count: number; onEdit?: () => void; custom?: boolean; changed?: boolean; icon?: React.ReactNode }) {
  const body = (
    <div className="flex items-start justify-between gap-4 p-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 font-medium">
          {icon}{roleLabel(name)}
          {custom && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary-bright">Custom</span>}
          {changed && <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-ink-faint">Adjusted</span>}
          <span className="text-xs font-normal text-ink-faint">{count} {count === 1 ? "person" : "people"}</span>
        </div>
        <p className="mt-0.5 text-sm text-ink-muted">{blurb}</p>
        <p className="mt-1 text-xs text-ink-faint">Can use: {summary}</p>
      </div>
      {onEdit && <span className="inline-flex shrink-0 items-center gap-1 text-xs text-primary"><Pencil className="size-3.5" /> Adjust</span>}
    </div>
  );
  return onEdit ? <button type="button" onClick={onEdit} className="block w-full text-left hover:bg-surface-2/40">{body}</button> : body;
}

function MemberDrawer({ m, me, isOwner, canEdit, customRoles, departments, rolePermissions, customRolesLocked, busy, pending, onClose, onSaveRole, onResend, onRemove }: {
  m: TeamMember; me: { id: string }; isOwner: boolean; canEdit: boolean; customRoles: TeamCustomRole[]; departments: { id: string; name: string }[];
  rolePermissions: Record<string, string[]> | null; customRolesLocked: boolean; busy: string | null; pending: boolean;
  onClose: () => void; onSaveRole: (c: TeamRoleChoice) => void; onResend: () => void; onRemove: () => void;
}) {
  const start = choiceOf(m, customRoles);
  const [choice, setChoice] = useState<TeamRoleChoice>(start);
  const [changing, setChanging] = useState(false);
  const dirty = choiceValue(choice) !== choiceValue(start);
  const email = realEmail(m.email);
  return (
    <Drawer title={m.id === me.id ? "You" : m.name} onClose={onClose}
      footer={canEdit && changing ? (
        <div className="flex gap-2">
          <Button className="flex-1" disabled={!dirty || pending} onClick={() => onSaveRole(choice)}>{busy === "role" ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : `Make them ${choiceName(choice)}`}</Button>
          <Button variant="ghost" onClick={() => { setChoice(start); setChanging(false); }}>Cancel</Button>
        </div>
      ) : undefined}>
      <div className="flex items-center gap-4">
        <Avatar m={m} size="lg" />
        <div className="min-w-0">
          <div className="font-display text-lg font-semibold">{m.name}</div>
          <div className="text-sm text-ink-muted">{choiceName(start)}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-muted">
            {m.phone && <span className="inline-flex items-center gap-1"><Phone className="size-3" />{m.phone}</span>}
            {email && <span className="inline-flex items-center gap-1 break-all"><Mail className="size-3" />{email}</span>}
          </div>
        </div>
      </div>

      {m.pending && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          <span className="text-amber-700 dark:text-amber-300">They have not accepted the invite yet. Joined the team list {new Date(m.joinedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.</span>
          {canEdit && m.phone && <Button size="sm" variant="secondary" disabled={pending} onClick={onResend}>{busy === "resend" ? <><Loader2 className="size-4 animate-spin" /> Sending…</> : <><Send className="size-4" /> Text the invite again</>}</Button>}
        </div>
      )}

      {!changing ? (
        <>
          <div className="mt-5"><MenuPreview choice={start} rolePermissions={rolePermissions} /></div>
          {canEdit && (
            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setChanging(true)}><Shield className="size-4" /> Change role</Button>
              <Button variant="ghost" className="text-danger" disabled={pending} onClick={onRemove}>{busy === "remove" ? <><Loader2 className="size-4 animate-spin" /> Removing…</> : <><Trash2 className="size-4" /> Remove from team</>}</Button>
            </div>
          )}
          {!canEdit && m.role === "Owner" && m.id !== me.id && <p className="mt-4 text-xs text-ink-faint">The Main Admin&rsquo;s role can only be handed over by the Main Admin.</p>}
          {!canEdit && m.role === "Admin" && !isOwner && m.id !== me.id && <p className="mt-4 text-xs text-ink-faint">Only the Main Admin can change or remove an Admin.</p>}
        </>
      ) : (
        <div className="mt-5 space-y-4">
          <RolePicker value={choiceValue(choice)} onChange={setChoice} customRoles={customRoles} departments={departments} rolePermissions={rolePermissions} allowAdmin={isOwner} customRolesLocked={customRolesLocked} />
          <MenuPreview choice={choice} rolePermissions={rolePermissions} />
        </div>
      )}
    </Drawer>
  );
}

function InviteDrawer({ customRoles, departments, rolePermissions, isOwner, customRolesLocked, busy, onClose, onSend }: {
  customRoles: TeamCustomRole[]; departments: { id: string; name: string }[]; rolePermissions: Record<string, string[]> | null; isOwner: boolean;
  customRolesLocked: boolean; busy: boolean; onClose: () => void; onSend: (fd: FormData, c: TeamRoleChoice) => void;
}) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [alsoEmail, setAlsoEmail] = useState(false);
  const [choice, setChoice] = useState<TeamRoleChoice>({ kind: "builtin", role: "Leader" });
  const [temp, setTemp] = useState("");
  const [showTemp, setShowTemp] = useState(false);
  const okWho = name.trim().length > 1 && phone.replace(/\D/g, "").length >= 9;

  const send = () => {
    const fd = new FormData();
    fd.set("name", name.trim()); fd.set("phone", phone); if (email.trim()) fd.set("email", email.trim());
    if (alsoEmail && email.trim()) fd.set("alsoEmail", "on");
    if (choice.kind === "budget") fd.set("departmentId", choice.departmentId);
    else { fd.set("role", choiceValue(choice)); if (temp.trim()) fd.set("password", temp.trim()); }
    onSend(fd, choice);
  };

  const steps = ["Who", "Their role", "Send"];
  return (
    <Drawer title="Invite someone to the team" onClose={onClose}
      footer={(
        <div className="flex items-center justify-between gap-2">
          {step > 1 ? <Button variant="ghost" onClick={() => setStep(step - 1)}><ChevronLeft className="size-4" /> Back</Button> : <span />}
          {step < 3
            ? <Button disabled={step === 1 && !okWho} onClick={() => setStep(step + 1)}>Next <ChevronRight className="size-4" /></Button>
            : <Button disabled={busy || !okWho} onClick={send}>{busy ? <><Loader2 className="size-4 animate-spin" /> Sending invite…</> : <><Send className="size-4" /> Send the invite</>}</Button>}
        </div>
      )}>
      <ol className="mb-5 flex items-center gap-2 text-xs">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span className={cn("grid size-6 place-items-center rounded-full font-semibold", step > i + 1 ? "bg-primary text-white" : step === i + 1 ? "bg-primary/15 text-primary-bright" : "bg-surface-2 text-ink-faint")}>{step > i + 1 ? <Check className="size-3.5" /> : i + 1}</span>
            <span className={step === i + 1 ? "font-semibold" : "text-ink-muted"}>{s}</span>
            {i < steps.length - 1 && <span className="h-px w-6 bg-line" />}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <div className="space-y-4">
          <div><Label htmlFor="inv-name">Full name</Label><Input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Ama Mensah" /></div>
          <div><Label htmlFor="inv-phone">Mobile number</Label><PhoneInput id="inv-phone" value={phone} onChange={(v: string) => setPhone(v)} aria-label="Mobile number" /><p className="mt-1 text-xs text-ink-faint">The invite goes to this number by text.</p></div>
          <div>
            <Label htmlFor="inv-email">Email <span className="font-normal text-ink-faint">(optional)</span></Label>
            <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="They can also sign in with this" />
            {email.trim() && <label className="mt-2 flex items-center gap-2 text-xs text-ink-muted"><input type="checkbox" checked={alsoEmail} onChange={(e) => setAlsoEmail(e.target.checked)} className="size-3.5 accent-[var(--color-primary)]" /> Also email the invite</label>}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <RolePicker value={choiceValue(choice)} onChange={setChoice} customRoles={customRoles} departments={departments} rolePermissions={rolePermissions} allowAdmin={isOwner} customRolesLocked={customRolesLocked} />
          <MenuPreview choice={choice} rolePermissions={rolePermissions} />
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="rounded-xl border border-line p-4">
            <div className="text-xs uppercase tracking-wide text-ink-faint">You are inviting</div>
            <div className="mt-1 text-lg font-semibold">{name}</div>
            <div className="text-sm text-ink-muted">{phone}{email ? ` · ${email}` : ""}</div>
            <div className="mt-3 text-xs uppercase tracking-wide text-ink-faint">As</div>
            <div className="mt-1 font-medium">{choiceName(choice)}</div>
            <div className="text-sm text-ink-muted">{accessSummary(accessFor(choice, rolePermissions), 6)}</div>
          </div>
          <p className="text-sm text-ink-muted">They get a text with a link. They open it, confirm their number, choose a password and add a photo. Until then they show as &ldquo;Invite not accepted yet&rdquo;.</p>
          {choice.kind !== "budget" && (
            showTemp
              ? <div><Label htmlFor="inv-temp">Temporary password</Label><Input id="inv-temp" value={temp} onChange={(e) => setTemp(e.target.value)} placeholder="Only if you will tell them yourself" /></div>
              : <button type="button" className="text-xs text-ink-faint underline" onClick={() => setShowTemp(true)}>Also give them a temporary password</button>
          )}
        </div>
      )}
    </Drawer>
  );
}

function CustomRoleDrawer({ role, template, busy, onClose, onSave, onDelete }: {
  role: TeamCustomRole | null; template?: (typeof ROLE_TEMPLATES)[number]; busy: string | null; onClose: () => void; onSave: (fd: FormData) => void; onDelete?: () => void;
}) {
  const [name, setName] = useState(role?.name ?? template?.name ?? "");
  const [view, setView] = useState<Set<string>>(new Set(role?.sections ?? template?.view ?? ["calendar"]));
  const [manage, setManage] = useState<Set<string>>(new Set(role?.manageSections ?? template?.manage ?? []));
  const [canDelete, setCanDelete] = useState(role?.canDelete ?? false);
  const save = () => {
    const fd = new FormData();
    if (role) fd.set("id", role.id);
    fd.set("name", name.trim());
    view.forEach((k) => fd.append("sections", k));
    manage.forEach((k) => fd.append("manageSections", k));
    if (canDelete) fd.set("canDelete", "on");
    onSave(fd);
  };
  const choice: TeamRoleChoice = { kind: "custom", id: role?.id ?? "new", name, sections: [...view], manageSections: [...manage], canDelete };
  return (
    <Drawer title={role ? `Adjust "${role.name}"` : "Create a role"} onClose={onClose}
      footer={(
        <div className="flex items-center gap-2">
          <Button className="flex-1" disabled={!name.trim() || view.size === 0 || busy === "saverole"} onClick={save}>{busy === "saverole" ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : role ? "Save changes" : "Create role"}</Button>
          {onDelete && <Button variant="ghost" className="text-danger" disabled={busy === "delrole"} onClick={onDelete}>{busy === "delrole" ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}</Button>}
        </div>
      )}>
      <div className="space-y-5">
        {!role && !template && (
          <div>
            <div className="mb-1.5 text-xs text-ink-muted">Start from a template, or set it up below</div>
            <div className="flex flex-wrap gap-2">
              {ROLE_TEMPLATES.map((t) => (
                <button key={t.name} type="button" title={t.blurb} onClick={() => { setName(t.name); setView(new Set(t.view)); setManage(new Set(t.manage)); }}
                  className="rounded-full border border-line px-3 py-1 text-xs hover:border-primary/40 hover:bg-primary/5">{t.name}</button>
              ))}
            </div>
          </div>
        )}
        <div><Label htmlFor="cr-name">Role name</Label><Input id="cr-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Usher, Treasurer, Secretary" /></div>
        <div>
          <Label>What this role can use</Label>
          <p className="mb-3 text-xs text-ink-muted"><b>View</b> opens and reads. <b>Edit</b> can also add and change. <b>Off</b> hides it from their menu.</p>
          <AccessGrid view={view} manage={manage} setView={setView} setManage={setManage} />
        </div>
        <label className="flex items-start gap-2 rounded-xl border border-line p-3 text-sm">
          <input type="checkbox" checked={canDelete} onChange={(e) => setCanDelete(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-primary)]" />
          <span><span className="font-medium">Can delete records</span><span className="block text-xs text-ink-muted">Off means they can add and edit, but not delete. Deleted records go to the recycle bin either way.</span></span>
        </label>
        <MenuPreview choice={choice} rolePermissions={null} />
      </div>
    </Drawer>
  );
}

function BuiltinRoleDrawer({ role, current, busy, onClose, onSave }: { role: Role; current: string[]; busy: boolean; onClose: () => void; onSave: (keys: string[]) => void }) {
  const [keys, setKeys] = useState<Set<string>>(new Set(current));
  const toggle = (k: string) => setKeys((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  return (
    <Drawer title={`What ${role}s can use`} onClose={onClose}
      footer={(
        <div className="flex items-center gap-2">
          <Button className="flex-1" disabled={busy} onClick={() => onSave([...keys])}>{busy ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : "Save"}</Button>
          <Button variant="ghost" onClick={() => setKeys(new Set(builtinKeys(role, null)))}>Back to default</Button>
        </div>
      )}>
      <p className="mb-4 text-sm text-ink-muted">{ROLE_BLURB[role]} Switch whole areas on or off. Everyone on this role can view and edit what is switched on.</p>
      <div className="space-y-2">
        {AREAS.map((a) => {
          const on = keys.has(a.key);
          return (
            <button key={a.key} type="button" onClick={() => toggle(a.key)} aria-pressed={on}
              className={cn("flex w-full items-start justify-between gap-3 rounded-xl border p-3 text-left", on ? "border-primary/50 bg-primary/5" : "border-line hover:bg-surface-2")}>
              <span>
                <span className="font-medium">{a.label}</span>
                <span className="mt-0.5 block text-xs text-ink-muted">{a.includes.join(", ")}</span>
              </span>
              <span className={cn("relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors", on ? "bg-primary" : "border border-line bg-surface-2")}>
                <span className={cn("inline-block size-4 rounded-full bg-white shadow transition-transform", on ? "translate-x-6" : "translate-x-1")} />
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-5"><MenuPreview choice={{ kind: "builtin", role }} rolePermissions={{ [role]: [...keys] }} /></div>
    </Drawer>
  );
}
