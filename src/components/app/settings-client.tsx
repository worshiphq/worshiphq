"use client";

import { useState } from "react";
import {
  Building, Palette, Users2, CreditCard, Plug, Check, Pencil, CircleDot,
  Sparkles, UserPlus, Link2, Layers, Trash2, ChevronDown, Shield, MessageSquare,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import type { Session } from "@/lib/permissions";
import { ROLE_PERMISSIONS } from "@/lib/permissions";
import {
  updateChurch, inviteTeammate,
  changeUserRole, removeTeamMember,
  createCustomRole, deleteCustomRole, requestSenderId,
  updateRolePermissions,
} from "@/app/actions/settings";
import { ALL_MODULES } from "@/lib/permissions";
import { BrandingForm } from "@/components/app/branding-form";
import { FormBuilder } from "@/components/app/form-builder";
import { getFormDefinition } from "@/lib/forms/registration";
import { createDepartment, deleteDepartment } from "@/app/actions/departments";
import { plans } from "@/config/pricing";
import { formatCurrency } from "@/config/brand";
import { cn } from "@/lib/utils";

type FeatureMap = Record<string, boolean>;
type Church = {
  name: string;
  denomination: string;
  city: string;
  country: string;
  address: string;
  accentColor: string;
  logoUrl: string;
  slug: string;
  registrationFields: unknown;

  smsSenderId?: string | null;
  smsSenderIdStatus?: string | null;
  smsSenderIdRequestedAt?: Date | null;
  rolePermissions?: Record<string, string[]> | null;
} | null;
type TeamUser = { id: string; name: string; email: string; role: string; customRole?: { id: string; name: string } | null };
type Dept = { id: string; name: string };
type CustomRoleRow = { id: string; name: string; sections: string[]; canDelete: boolean };
type SubscriptionData = { plan: string; status: string; interval: string; renewsAt: Date | null } | null;

const MODULE_LABELS: Record<string, string> = {
  people: "People", attendance: "Attendance", events: "Events", volunteers: "Volunteers",
  giving: "Giving", accounting: "Accounting", communications: "Communications",
  reminders: "Reminders", branches: "Branches", settings: "Settings",
};

const tabs = [
  { key: "church", label: "Church profile", icon: Building },
  { key: "branding", label: "Branding", icon: Palette },
  { key: "team", label: "Users & roles", icon: Users2 },
  { key: "departments", label: "Departments", icon: Layers },
  { key: "registration", label: "Join link", icon: Link2 },
  { key: "billing", label: "Billing", icon: CreditCard },
  { key: "sms", label: "SMS Settings", icon: MessageSquare },
] as const;

const integrationList = [
  { key: "payments", name: "Paystack", desc: "Mobile Money & card giving (GHS)" },
  { key: "sms", name: "SMS (Arkesel / Hubtel)", desc: "SMS broadcasts & reminders" },
  { key: "email", name: "Email (Resend)", desc: "Email broadcasts & receipts" },
  { key: "push", name: "Web Push", desc: "Push notifications" },
  { key: "storage", name: "Cloud storage", desc: "Member photos & files" },
  { key: "maps", name: "Maps", desc: "Member location map" },
  { key: "ai", name: "AI assist", desc: "Care copilot & smart lists" },
  { key: "database", name: "Database", desc: "PostgreSQL persistence" },
];

const ALL_ROLES = ["Admin", "Pastor", "Finance", "Media", "Leader", "Volunteer"];

export function SettingsClient({
  session,
  features,
  church,
  users,
  departments,
  customRoles,
  subscription,
}: {
  session: Session;
  features: FeatureMap;
  church: Church;
  users: TeamUser[];
  departments: Dept[];
  customRoles: CustomRoleRow[];
  subscription: SubscriptionData;
}) {
  const [tab, setTab] = useState<(typeof tabs)[number]["key"]>("church");
  const ro = session.isDemo;
  const isAdmin = session.role === "Owner" || session.role === "Admin";

  const joinUrl = church?.slug
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/join/${church.slug}`
    : "";

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <nav className="flex gap-1 overflow-x-auto lg:flex-col">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              tab === t.key ? "bg-primary/15 text-primary-bright" : "text-ink-muted hover:bg-surface-2 hover:text-ink",
            )}
          >
            <t.icon className="size-4" /> {t.label}
          </button>
        ))}
      </nav>

      <div>
        {ro && (
          <div className="mb-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
            You&rsquo;re viewing the read-only demo. Create a free account to edit your church.
          </div>
        )}

        {/* ── Church profile ── */}
        {tab === "church" && (
          <Card className="p-6">
            <h3 className="font-display text-lg font-semibold">Church profile</h3>
            <p className="text-sm text-ink-muted">Basic information about your church.</p>
            <form action={updateChurch} className="mt-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label>Church name</Label><Input name="name" defaultValue={church?.name ?? ""} required disabled={ro} /></div>
                <div><Label>Denomination</Label><Input name="denomination" defaultValue={church?.denomination ?? ""} disabled={ro} /></div>
                <div><Label>City</Label><Input name="city" defaultValue={church?.city ?? ""} disabled={ro} /></div>
                <div><Label>Country</Label><Input name="country" defaultValue={church?.country ?? "Ghana"} disabled={ro} /></div>
                <div className="sm:col-span-2"><Label>Address</Label><Input name="address" defaultValue={church?.address ?? ""} disabled={ro} /></div>
              </div>
              <p className="mt-3 text-xs text-ink-faint">Add your church logo in the <span className="font-medium text-ink-muted">Branding</span> tab.</p>
              <SubmitButton className="mt-5" disabled={ro} successMessage="Changes saved">Save changes</SubmitButton>
            </form>
          </Card>
        )}

        {/* ── Branding ── */}
        {tab === "branding" && (
          <BrandingForm
            initialLogo={church?.logoUrl ?? ""}
            initialAccent={church?.accentColor ?? "#0d7377"}
            readOnly={ro}
          />
        )}

        {/* ── Team / roles ── */}
        {tab === "team" && (
          <div className="space-y-4">
            <Card>
              <div className="flex items-center justify-between border-b border-line p-6">
                <div>
                  <h3 className="font-display text-lg font-semibold">Your team</h3>
                  <p className="text-sm text-ink-muted">
                    Signed in as <Badge variant="primary">{session.role}</Badge>
                  </p>
                </div>
              </div>
              <div className="divide-y divide-line-soft">
                {users.map((u) => (
                  <div key={u.email} className="flex items-center justify-between gap-4 p-5">
                    <div>
                      <div className="font-medium">{u.name}</div>
                      <div className="text-xs text-ink-faint">{u.email}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isAdmin && u.id !== session.userId && u.role !== "Owner" ? (
                        <form action={changeUserRole} className="flex items-center gap-2">
                          <input type="hidden" name="userId" value={u.id} />
                          <select
                            name="role"
                            defaultValue={u.customRole ? `custom:${u.customRole.id}` : u.role}
                            className="h-8 rounded-lg border border-line bg-surface px-2 text-xs"
                          >
                            {ALL_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                            {customRoles.length > 0 && (
                              <optgroup label="Custom roles">
                                {customRoles.map((cr) => <option key={cr.id} value={`custom:${cr.id}`}>{cr.name}</option>)}
                              </optgroup>
                            )}
                          </select>
                          <SubmitButton size="sm" variant="secondary" overlay={false} successMessage="Role updated" className="h-8 px-2 text-xs">
                            Update
                          </SubmitButton>
                        </form>
                      ) : (
                        <Badge variant="default">{u.customRole?.name ?? u.role}</Badge>
                      )}
                      {isAdmin && u.id !== session.userId && u.role !== "Owner" && (
                        <form action={removeTeamMember}>
                          <input type="hidden" name="userId" value={u.id} />
                          <SubmitButton size="sm" variant="danger" overlay={false} successMessage="Member removed" className="h-8 px-2">
                            <Trash2 className="size-3" />
                          </SubmitButton>
                        </form>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {isAdmin && (
              <Card className="p-6">
                <h3 className="flex items-center gap-2 font-display text-base font-semibold">
                  <UserPlus className="size-4" /> Invite a teammate
                </h3>
                <form action={inviteTeammate} className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Input name="name" placeholder="Full name" required disabled={ro} />
                  <Input name="email" type="email" placeholder="email@church.org" required disabled={ro} />
                  <select
                    name="role"
                    defaultValue="Leader"
                    disabled={ro}
                    className="flex h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  >
                    {ALL_ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                    {customRoles.length > 0 && (
                      <optgroup label="Custom roles">
                        {customRoles.map((cr) => <option key={cr.id} value={`custom:${cr.id}`}>{cr.name}</option>)}
                      </optgroup>
                    )}
                  </select>
                  <Input name="password" placeholder="Temp password (optional)" disabled={ro} />
                  <SubmitButton className="sm:col-span-2" disabled={ro} pendingLabel="Sending invite…" successMessage="Invite sent">Send invite</SubmitButton>
                </form>
                <p className="mt-2 text-xs text-ink-faint">
                  They&rsquo;ll sign in with this email and temporary password.
                </p>
              </Card>
            )}

            {/* ── Custom roles ── */}
            {isAdmin && (
              <Card className="p-6">
                <h3 className="flex items-center gap-2 font-display text-base font-semibold">
                  <Shield className="size-4" /> Custom roles
                </h3>
                <p className="mt-1 text-sm text-ink-muted">
                  Create a role that can only see certain sections — e.g. an &ldquo;Attendance&rdquo; role that sees only attendance. Choose whether they can delete records or only add.
                </p>

                {customRoles.length > 0 && (
                  <div className="mt-4 divide-y divide-line-soft rounded-xl border border-line">
                    {customRoles.map((cr) => (
                      <div key={cr.id} className="flex items-start justify-between gap-3 p-4">
                        <div>
                          <div className="font-medium">{cr.name}</div>
                          <div className="mt-0.5 text-xs text-ink-faint">
                            {cr.sections.length ? cr.sections.map((s) => MODULE_LABELS[s] ?? s).join(", ") : "No sections"}
                            {" · "}{cr.canDelete ? "can delete" : "add only"}
                          </div>
                        </div>
                        <form action={deleteCustomRole.bind(null, cr.id)}>
                          <SubmitButton size="sm" variant="ghost" overlay={false} successMessage="Role deleted" className="text-danger">
                            <Trash2 className="size-3.5" />
                          </SubmitButton>
                        </form>
                      </div>
                    ))}
                  </div>
                )}

                <form action={createCustomRole} className="mt-4 space-y-3">
                  <Input name="name" placeholder="Role name (e.g. Attendance team)" required disabled={ro} />
                  <div>
                    <Label>Sections this role can see</Label>
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                      {ALL_MODULES.map((m) => (
                        <label key={m} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
                          <input type="checkbox" name="sections" value={m} className="size-4 rounded border-line accent-primary" />
                          {MODULE_LABELS[m] ?? m}
                        </label>
                      ))}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-ink-muted">
                    <input type="checkbox" name="canDelete" className="size-4 rounded border-line accent-primary" />
                    Allow this role to delete records (otherwise they can only add/edit)
                  </label>
                  <SubmitButton disabled={ro} pendingLabel="Saving…" successMessage="Role saved">Create role</SubmitButton>
                </form>
              </Card>
            )}

            <BuiltInRolesEditor
              rolePermissions={church?.rolePermissions ?? null}
              readOnly={ro}
            />
          </div>
        )}

        {/* ── Departments ── */}
        {tab === "departments" && (
          <div className="space-y-4">
            <Card>
              <div className="border-b border-line p-6">
                <h3 className="font-display text-lg font-semibold">Departments</h3>
                <p className="text-sm text-ink-muted">Organize members into departments and ministries.</p>
              </div>
              <div className="divide-y divide-line-soft">
                {departments.length === 0 && (
                  <div className="p-6 text-sm text-ink-faint">
                    No departments yet. Add one below so members can be categorized automatically.
                  </div>
                )}
                {departments.map((d) => (
                  <div key={d.id} className="flex items-center justify-between px-6 py-4">
                    <span className="font-medium">{d.name}</span>
                    {!ro && (
                      <form
                        action={deleteDepartment.bind(null, d.id)}
                        onSubmit={(e) => {
                          if (!confirm(`Delete "${d.name}"? Members in this department will be unlinked.`)) {
                            e.preventDefault();
                          }
                        }}
                      >
                        <SubmitButton size="sm" variant="ghost" overlay={false} successMessage="Department deleted" className="text-danger">
                          <Trash2 className="size-3.5" />
                        </SubmitButton>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="font-display text-base font-semibold">Add department</h3>
              <form action={createDepartment} className="mt-3 flex gap-3">
                <Input name="name" placeholder="e.g. Choir, Ushering, Youth" required disabled={ro} className="flex-1" />
                <Input name="description" placeholder="Description (optional)" disabled={ro} className="flex-1" />
                <SubmitButton disabled={ro} pendingLabel="Adding…" successMessage="Department added">Add</SubmitButton>
              </form>
            </Card>
          </div>
        )}

        {/* ── Join link / registration form config ── */}
        {tab === "registration" && (
          <div className="space-y-4">
            <Card className="p-6">
              <h3 className="font-display text-lg font-semibold">Member self-registration link</h3>
              <p className="text-sm text-ink-muted">
                Share this link with your congregation. Members fill in their own details and appear in your People list automatically.
              </p>
              {joinUrl && (
                <div className="mt-4 flex items-center gap-2">
                  <Input value={joinUrl} readOnly className="flex-1 font-mono text-xs" />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      navigator.clipboard.writeText(joinUrl);
                      alert("Link copied!");
                    }}
                  >
                    <Link2 className="size-4" /> Copy
                  </Button>
                </div>
              )}
            </Card>

            {isAdmin && (
              <FormBuilder initial={getFormDefinition(church?.registrationFields ?? null)} readOnly={ro} />
            )}
          </div>
        )}

        {/* ── Billing ── */}
        {tab === "billing" && <BillingTab subscription={subscription} features={features} ro={ro} />}

        {tab === "sms" && (
          <Card className="p-6">
            <h3 className="font-display text-lg font-semibold">SMS Settings</h3>

            <p className="text-sm text-ink-muted">
              Request a custom Sender ID for your church.
            </p>

            <form action={requestSenderId}>
              <div className="mt-4">
                <Label>Sender ID</Label>

                <Input
                  name="senderId"
                  defaultValue={church?.smsSenderId ?? ""}
                  placeholder="GraceTemple"
                  maxLength={11}
                />

                <p className="mt-2 text-xs text-ink-faint">
                  Maximum 11 characters. Letters and numbers only.
                </p>
              </div>

              <div className="mt-4">
                Status{" "}
                <Badge variant="default">
                  {church?.smsSenderIdStatus ?? "pending"}
                </Badge>
              </div>

              <SubmitButton className="mt-5">
                Submit Request
              </SubmitButton>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}

const EDITABLE_ROLES = ["Admin", "Pastor", "Finance", "Media", "Leader", "Volunteer"] as const;

function BuiltInRolesEditor({
  rolePermissions,
  readOnly,
}: {
  rolePermissions: Record<string, string[]> | null;
  readOnly: boolean;
}) {
  const [editingRole, setEditingRole] = useState<string | null>(null);

  return (
    <Card>
      <div className="border-b border-line p-6">
        <h3 className="font-display text-base font-semibold">Built-in role permissions</h3>
        <p className="mt-1 text-sm text-ink-muted">
          Click the pencil to customize what each role can access. Owner always has full access.
        </p>
      </div>
      <div className="divide-y divide-line-soft">
        <div className="flex items-start justify-between gap-4 p-5">
          <div>
            <div className="font-medium">Owner</div>
            <div className="mt-1 text-xs text-ink-faint">Full access to everything</div>
          </div>
        </div>
        {EDITABLE_ROLES.map((role) => {
          const defaults = ROLE_PERMISSIONS[role] ?? [];
          const current = rolePermissions?.[role] ?? defaults;
          const isEditing = editingRole === role;

          return (
            <div key={role} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-medium">{role}</div>
                  <div className="mt-1 text-xs text-ink-faint">
                    {current.map((s) => MODULE_LABELS[s] ?? s).join(", ") || "No access"}
                  </div>
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => setEditingRole(isEditing ? null : role)}
                    className={cn(
                      "grid size-8 place-items-center rounded-lg border border-line transition-colors",
                      isEditing ? "bg-primary/10 text-primary-bright border-primary/30" : "text-ink-muted hover:bg-surface-2",
                    )}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                )}
              </div>
              {isEditing && (
                <form action={updateRolePermissions} className="mt-4 space-y-3">
                  <input type="hidden" name="role" value={role} />
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {ALL_MODULES.map((m) => (
                      <label key={m} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
                        <input
                          type="checkbox"
                          name="sections"
                          value={m}
                          defaultChecked={current.includes(m)}
                          className="size-4 rounded border-line accent-primary"
                        />
                        {MODULE_LABELS[m] ?? m}
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <SubmitButton size="sm" pendingLabel="Saving…" successMessage="Permissions updated">
                      Save
                    </SubmitButton>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditingRole(null)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function BillingTab({ subscription, features, ro }: { subscription: SubscriptionData; features: FeatureMap; ro: boolean }) {
  const [showPlans, setShowPlans] = useState(false);
  const [interval, setInterval] = useState<"monthly" | "yearly">(
    (subscription?.interval as "monthly" | "yearly") ?? "monthly",
  );

  const currentPlanId = subscription?.plan ?? "free";
  const currentPlan = plans.find((p) => p.id === currentPlanId) ?? plans[0];
  const isGrace = subscription?.status === "grace";
  const price = interval === "yearly" ? currentPlan.yearly / 12 : currentPlan.monthly;

  return (
    <div className="space-y-5">
      <Card className="p-6">
        <h3 className="font-display text-lg font-semibold">Billing & subscription</h3>
        <p className="text-sm text-ink-muted">Powered by Paystack. Billed in GHS.</p>

        <div className="mt-5 flex items-center justify-between rounded-2xl border border-primary/30 bg-primary/10 p-5">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary-bright" />
              <span className="font-display text-lg font-semibold">{currentPlan.name} plan</span>
              {isGrace && <Badge variant="success">Gift of Grace</Badge>}
            </div>
            <div className="mt-1 text-sm text-ink-muted">{currentPlan.members}. {currentPlan.branches}</div>
          </div>
          <div className="text-right">
            {isGrace ? (
              <div className="font-display text-2xl font-bold text-success">Free forever</div>
            ) : (
              <>
                <div className="font-display text-2xl font-bold">
                  {formatCurrency(price)}
                  <span className="text-sm font-normal text-ink-faint">/mo</span>
                </div>
                {currentPlanId !== "free" && subscription?.renewsAt && (
                  <div className="text-xs text-ink-faint">
                    Renews {new Date(subscription.renewsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </div>
                )}
                {currentPlanId === "free" && <div className="text-xs text-ink-faint">Upgrade anytime</div>}
              </>
            )}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <h4 className="text-sm font-medium text-ink-muted">Your plan includes:</h4>
          <ul className="grid gap-1 sm:grid-cols-2">
            {currentPlan.features.map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm text-ink">
                <Check className="size-3.5 shrink-0 text-success" /> {f}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5 flex gap-2">
          {!isGrace && (
            <Button variant="secondary" disabled={ro} onClick={() => setShowPlans(!showPlans)}>
              {showPlans ? "Hide plans" : currentPlanId === "free" ? "Upgrade plan" : "Change plan"}
            </Button>
          )}
          <Button variant="ghost">Billing history</Button>
        </div>

        {!features.payments && (
          <p className="mt-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-warning">
            Paystack is in stub mode — add PAYSTACK_SECRET_KEY to enable live billing & giving.
          </p>
        )}
      </Card>

      {showPlans && !isGrace && (
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold">Choose a plan</h3>
            <div className="flex items-center gap-1 rounded-full border border-line bg-surface-2 p-1">
              <button
                type="button"
                onClick={() => setInterval("monthly")}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  interval === "monthly" ? "bg-surface shadow-sm text-ink" : "text-ink-muted",
                )}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setInterval("yearly")}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  interval === "yearly" ? "bg-surface shadow-sm text-ink" : "text-ink-muted",
                )}
              >
                Yearly <span className="text-success">Save ~17%</span>
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => {
              const isCurrent = plan.id === currentPlanId;
              const monthlyPrice = interval === "yearly" ? plan.yearly / 12 : plan.monthly;
              return (
                <div
                  key={plan.id}
                  className={cn(
                    "rounded-2xl border p-4 transition-all",
                    isCurrent
                      ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
                      : plan.featured
                        ? "border-primary/30 bg-surface"
                        : "border-line bg-surface",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-display font-semibold">{plan.name}</h4>
                    {plan.featured && !isCurrent && <Badge variant="primary">Popular</Badge>}
                    {isCurrent && <Badge variant="success">Current</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">{plan.tagline}</p>
                  <div className="mt-3">
                    <span className="font-display text-2xl font-bold">{formatCurrency(monthlyPrice)}</span>
                    <span className="text-sm text-ink-faint">/mo</span>
                  </div>
                  <div className="mt-1 text-xs text-ink-faint">{plan.members}</div>
                  <ul className="mt-3 space-y-1.5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-1.5 text-xs text-ink-muted">
                        <Check className="mt-0.5 size-3 shrink-0 text-success" /> {f}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="mt-4 w-full"
                    variant={isCurrent ? "ghost" : plan.featured ? "primary" : "secondary"}
                    size="sm"
                    disabled={isCurrent || ro}
                  >
                    {isCurrent ? "Current plan" : plan.cta}
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
