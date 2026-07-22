"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Building, Palette, Users2, CreditCard, Plug, Check, Pencil, CircleDot,
  Sparkles, UserPlus, Link2, Layers, Trash2, ChevronDown, Shield, MessageSquare,
  ExternalLink, Rocket, Wallet, Loader2 as Spinner, Clock, CheckCircle2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import type { Session } from "@/lib/permissions";
import { ROLE_PERMISSIONS } from "@/lib/permissions";
import { submitPaymentRequest, getPaymentRequestStatus } from "@/app/actions/payment-request";
import {
  updateChurch, inviteTeammate,
  changeUserRole, removeTeamMember,
  createCustomRole, deleteCustomRole, requestSenderId,
  updateRolePermissions, changePlan, redeemPlanBypass, verifyPlanUpgrade,
  saveVisitorForm, saveChildrenForm, saveTeensForm, updateSlug,
} from "@/app/actions/settings";
import { ALL_MODULES, SECTION_GROUPS, MODULE_LABELS } from "@/lib/permissions";
import { BrandingForm } from "@/components/app/branding-form";
import { FormBuilder } from "@/components/app/form-builder";
import { getFormDefinition, getVisitorFormDefinition, getChildrenFormDefinition, getTeensFormDefinition } from "@/lib/forms/registration";
import { createDepartment, deleteDepartment } from "@/app/actions/departments";
import { plans as defaultPlans } from "@/config/pricing";
import type { PlanPrices } from "@/lib/data/platform-config";
import { getPlanLimits, type PlanId } from "@/lib/plan-gate";
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
  visitorFormFields: unknown;
  childrenFormFields: unknown;
  teensFormFields: unknown;

  smsSenderId?: string | null;
  smsSenderIdStatus?: string | null;
  smsSenderIdRequestedAt?: Date | null;
  rolePermissions?: Record<string, string[]> | null;
} | null;
type TeamUser = { id: string; name: string; email: string; role: string; customRole?: { id: string; name: string } | null };
type Dept = { id: string; name: string };
type CustomRoleRow = { id: string; name: string; sections: string[]; manageSections?: string[]; canDelete: boolean };
type SubscriptionData = { plan: string; status: string; interval: string; renewsAt: Date | null; bypassPlan: string | null } | null;

const tabs = [
  { key: "church", label: "Church profile", icon: Building },
  { key: "branding", label: "Branding", icon: Palette },
  { key: "team", label: "Users & roles", icon: Users2 },
  { key: "departments", label: "Departments", icon: Layers },
  { key: "registration", label: "Join link", icon: Link2 },
  { key: "billing", label: "Billing", icon: CreditCard },
  { key: "online-payments", label: "Online Payments", icon: Wallet },
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

type PlatformPricing = { currency: string; currencySymbol: string; prices: PlanPrices };

export function SettingsClient({
  session,
  features,
  church,
  users,
  departments,
  customRoles,
  subscription,
  platformPricing,
}: {
  session: Session;
  features: FeatureMap;
  church: Church;
  users: TeamUser[];
  departments: Dept[];
  customRoles: CustomRoleRow[];
  subscription: SubscriptionData;
  platformPricing?: PlatformPricing;
}) {
  const [tab, setTab] = useState<(typeof tabs)[number]["key"]>("church");
  const ro = session.isDemo;
  const isAdmin = session.role === "Owner" || session.role === "Admin";

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

                <form action={createCustomRole} className="mt-4 space-y-4">
                  <Input name="name" placeholder="Role name (e.g. Finance — Day Born)" required disabled={ro} />
                  <div>
                    <div className="flex items-center justify-between">
                      <Label>What can this role do?</Label>
                      <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                        <span className="w-12 text-center">View</span>
                        <span className="w-12 text-center">Manage</span>
                      </div>
                    </div>
                    <p className="mb-2 text-xs text-ink-faint">
                      <b>View</b> = can open &amp; read. <b>Manage</b> = can also add &amp; edit. Tick only the sections this person should ever see.
                    </p>
                    <div className="max-h-80 space-y-3 overflow-y-auto rounded-xl border border-line p-3">
                      {SECTION_GROUPS.map((group) => (
                        <div key={group.category}>
                          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{group.category}</div>
                          <div className="divide-y divide-line-soft">
                            {group.sections.map((s) => (
                              <div key={s.key} className="flex items-center justify-between gap-3 py-1.5">
                                <span className="text-sm">{s.label}</span>
                                <div className="flex items-center gap-3">
                                  <span className="w-12 text-center">
                                    <input type="checkbox" name="sections" value={s.key} className="size-4 rounded border-line accent-primary" />
                                  </span>
                                  <span className="w-12 text-center">
                                    {s.manageable ? (
                                      <input type="checkbox" name="manageSections" value={s.key} className="size-4 rounded border-line accent-primary" />
                                    ) : (
                                      <span className="text-ink-faint/40">—</span>
                                    )}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
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
            <SlugEditor slug={church?.slug ?? ""} ro={ro} isAdmin={isAdmin} />

            <SharedLinkCard
              title="Member self-registration"
              description="Share this link with your congregation. Members fill in their own details and appear in your People list automatically."
              path={`/join/${church?.slug ?? ""}`}
              slug={church?.slug}
            />

            {isAdmin && (
              <FormBuilder initial={getFormDefinition(church?.registrationFields ?? null)} readOnly={ro} />
            )}

            <SharedLinkCard
              title="Visitor form"
              description="A simpler form for first-time visitors. Collects name, phone, purpose of visit and prayer requests."
              path={`/visit/${church?.slug ?? ""}`}
              slug={church?.slug}
            />

            {isAdmin && (
              <FormBuilder
                initial={getVisitorFormDefinition(church?.visitorFormFields ?? null)}
                readOnly={ro}
                saveAction={saveVisitorForm}
                title="Visitor form builder"
                description="Customise the fields first-time visitors fill in. Name fields are always required."
              />
            )}

            <SharedLinkCard
              title="Children's registration"
              description="A simplified form for registering children. Collects guardian details, school and class info."
              path={`/children/${church?.slug ?? ""}`}
              slug={church?.slug}
            />

            {isAdmin && (
              <FormBuilder
                initial={getChildrenFormDefinition(church?.childrenFormFields ?? null)}
                readOnly={ro}
                saveAction={saveChildrenForm}
                title="Children's form builder"
                description="Customise the fields for children's registration. Guardian details are included by default."
              />
            )}

            <SharedLinkCard
              title="Teens registration"
              description="Registration for teens. Includes guardian info and lets teens select which department they serve in."
              path={`/teens/${church?.slug ?? ""}`}
              slug={church?.slug}
            />

            {isAdmin && (
              <FormBuilder
                initial={getTeensFormDefinition(church?.teensFormFields ?? null)}
                readOnly={ro}
                saveAction={saveTeensForm}
                title="Teens form builder"
                description="Customise the fields for teen registration. Includes department selection so teens can join ministries."
              />
            )}

            <SharedLinkCard
              title="Prayer requests"
              description="Share this link so members can submit prayer requests online."
              path={`/pray/${church?.slug ?? ""}`}
              slug={church?.slug}
            />
          </div>
        )}

        {/* ── Billing ── */}
        {tab === "billing" && <BillingTab subscription={subscription} features={features} ro={ro} platformPricing={platformPricing} />}

        {/* ── Online Payments ── */}
        {tab === "online-payments" && <OnlinePaymentsTab churchId={session.churchId} />}

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

function getNewFeatures(oldPlan: PlanId, newPlan: PlanId): string[] {
  const oldFeatures = new Set(getPlanLimits(oldPlan).features);
  return getPlanLimits(newPlan).features.filter((f) => !oldFeatures.has(f));
}

const FEATURE_LABELS: Record<string, string> = {
  sms: "SMS Broadcasts",
  "form-builder": "Custom Form Builder",
  "import-export": "Import & Export",
  "member-ids": "Member ID Cards",
  "qr-codes": "QR Code Check-in",
  "custom-roles": "Custom Roles & Permissions",
  harvest: "Harvest Management",
  pledges: "Pledges & Campaigns",
  "recurring-giving": "Recurring Giving",
  "auto-receipts": "Automatic Receipts",
  reminders: "Birthday & Anniversary Reminders",
  "data-migration": "Free Data Migration",
  "follow-ups": "Follow-up Tracking",
  sermons: "Sermon Archive",
  devotionals: "Daily Devotionals",
  testimonies: "Testimony Sharing",
  automations: "Automations & Workflows",
  volunteers: "Volunteer Management",
  rosters: "Service Rosters",
  "volunteer-scheduling": "Volunteer Scheduling",
  "engagement-scoring": "Engagement Scoring",
  "advanced-reports": "Advanced Reports & Dashboards",
  welfare: "Welfare & Benevolence",
  counseling: "Counseling Sessions",
  "auto-inactive": "Auto-detect Inactive Members",
  bookings: "Facility Bookings",
  accounting: "Fund Accounting",
  budgets: "Budget Management",
  expenses: "Expense Tracking",
  "fund-accounting": "Fund Accounting",
  assets: "Asset Register",
  "api-access": "API Access",
  "audit-log": "Audit Log",
};

function UpgradeCelebration({ planName, newFeatures, onDone }: { planName: string; newFeatures: string[]; onDone: () => void }) {
  const [phase, setPhase] = useState<"rocket" | "reveal">("rocket");

  useEffect(() => {
    const timer = setTimeout(() => setPhase("reveal"), 2800);
    return () => clearTimeout(timer);
  }, []);

  if (phase === "rocket") {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gradient-to-b from-[#0a0e27] via-[#0d1a3a] to-[#0d7377]/80">
        <style>{`
          @keyframes rocketLaunch {
            0% { transform: translateY(60vh) scale(0.8); opacity: 0; }
            15% { transform: translateY(40vh) scale(1); opacity: 1; }
            40% { transform: translateY(10vh) scale(1); opacity: 1; }
            70% { transform: translateY(-20vh) scale(1.1); opacity: 1; }
            100% { transform: translateY(-100vh) scale(1.2); opacity: 0; }
          }
          @keyframes exhaust {
            0%, 100% { opacity: 0.4; transform: scaleY(0.8) scaleX(0.9); }
            50% { opacity: 1; transform: scaleY(1.3) scaleX(1.1); }
          }
          @keyframes starTwinkle {
            0%, 100% { opacity: 0.2; }
            50% { opacity: 1; }
          }
          @keyframes upgradeText {
            0% { opacity: 0; transform: scale(0.5); }
            50% { opacity: 1; transform: scale(1.1); }
            70% { opacity: 1; transform: scale(1); }
            100% { opacity: 0; transform: scale(1); }
          }
        `}</style>

        {/* Stars */}
        {Array.from({ length: 30 }).map((_, i) => (
          <div
            key={i}
            className="absolute size-1 rounded-full bg-white"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animation: `starTwinkle ${1 + Math.random() * 2}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 2}s`,
            }}
          />
        ))}

        {/* Rocket */}
        <div
          className="relative"
          style={{ animation: "rocketLaunch 2.8s ease-in forwards" }}
        >
          <div className="relative flex flex-col items-center">
            <Rocket className="size-20 -rotate-45 text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.5)]" />
            {/* Exhaust flame */}
            <div
              className="absolute -bottom-8 left-1/2 -translate-x-1/2 rotate-45"
              style={{ animation: "exhaust 0.15s ease-in-out infinite" }}
            >
              <div className="h-16 w-6 rounded-full bg-gradient-to-b from-yellow-400 via-orange-500 to-red-600 blur-sm" />
            </div>
            <div
              className="absolute -bottom-12 left-1/2 -translate-x-1/2 rotate-45"
              style={{ animation: "exhaust 0.12s ease-in-out infinite", animationDelay: "0.05s" }}
            >
              <div className="h-20 w-4 rounded-full bg-gradient-to-b from-orange-300 via-red-500 to-transparent blur-md opacity-70" />
            </div>
          </div>
        </div>

        {/* Upgrading text */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ animation: "upgradeText 2.8s ease-in-out forwards" }}
        >
          <div className="text-center">
            <h1 className="font-display text-4xl font-black text-white sm:text-5xl">
              Upgrading to {planName}
            </h1>
            <p className="mt-2 text-lg text-white/60">Unlocking your new features...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <style>{`
        @keyframes celebrationSlide {
          0% { opacity: 0; transform: translateY(40px) scale(0.95); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes featurePop {
          0% { opacity: 0; transform: translateX(-20px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        @keyframes confettiBurst {
          0% { opacity: 1; transform: translateY(0) rotate(0deg); }
          100% { opacity: 0; transform: translateY(-80px) rotate(720deg); }
        }
      `}</style>

      {/* Confetti particles */}
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={i}
          className="absolute rounded-sm"
          style={{
            width: 8 + Math.random() * 8,
            height: 8 + Math.random() * 8,
            left: `${30 + Math.random() * 40}%`,
            top: `${30 + Math.random() * 30}%`,
            background: ["#0d7377", "#f59e0b", "#10b981", "#6366f1", "#ec4899"][i % 5],
            animation: `confettiBurst ${1 + Math.random()}s ease-out forwards`,
            animationDelay: `${Math.random() * 0.5}s`,
          }}
        />
      ))}

      <div
        className="w-full max-w-lg rounded-2xl border border-primary/30 bg-surface p-8 shadow-2xl"
        style={{ animation: "celebrationSlide 0.5s ease-out" }}
      >
        <div className="text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-primary/20 to-success/20">
            <Rocket className="size-8 -rotate-45 text-primary-bright" />
          </div>
          <h2 className="mt-4 font-display text-2xl font-black">
            Welcome to {planName}! 🎉
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Your church is now on the {planName} plan. Here&apos;s what&apos;s new:
          </p>
        </div>

        {newFeatures.length > 0 && (
          <div className="mt-6 max-h-60 overflow-y-auto rounded-xl border border-line bg-surface-2/30 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">Newly unlocked features</h3>
            <div className="space-y-2">
              {newFeatures.map((f, i) => (
                <div
                  key={f}
                  className="flex items-center gap-3 rounded-lg px-2 py-1.5"
                  style={{ animation: `featurePop 0.3s ease-out forwards`, animationDelay: `${0.3 + i * 0.08}s`, opacity: 0 }}
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-md bg-success/10">
                    <Check className="size-3.5 text-success" />
                  </span>
                  <span className="text-sm font-medium text-ink">{FEATURE_LABELS[f] ?? f}</span>
                  <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-red-500">NEW</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="mt-4 text-center text-xs text-ink-faint">
          A receipt has been sent to your email and phone.
        </p>

        <Button className="mt-5 w-full" onClick={onDone}>
          <Sparkles className="size-4" /> Start exploring
        </Button>
      </div>
    </div>
  );
}

function BillingTab({ subscription, features, ro, platformPricing }: { subscription: SubscriptionData; features: FeatureMap; ro: boolean; platformPricing?: PlatformPricing }) {
  const router = useRouter();
  const plans = defaultPlans.map((p) => {
    const dbPrice = platformPricing?.prices[p.id];
    return dbPrice ? { ...p, monthly: dbPrice.monthly, yearly: dbPrice.yearly } : p;
  });
  const sym = platformPricing?.currencySymbol ?? "₵";
  const fmtPrice = (amount: number) => `${sym}${amount.toLocaleString()}`;

  const [showPlans, setShowPlans] = useState(false);
  const [interval, setInterval] = useState<"monthly" | "yearly">(
    (subscription?.interval as "monthly" | "yearly") ?? "monthly",
  );
  const [switching, startSwitch] = useTransition();
  const [upgradePlan, setUpgradePlan] = useState<typeof plans[number] | null>(null);
  const [celebrating, setCelebrating] = useState<{ planName: string; newFeatures: string[] } | null>(null);

  const previousPlan = (subscription?.plan ?? "free") as PlanId;

  // Detect ?upgraded= param (from Paystack redirect) — verify payment and activate
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const upgraded = params.get("upgraded");
    const ref = params.get("ref") || params.get("trxref") || params.get("reference") || "";
    const intv = params.get("interval") || "monthly";
    if (upgraded) {
      const url = new URL(window.location.href);
      url.searchParams.delete("upgraded");
      url.searchParams.delete("ref");
      url.searchParams.delete("trxref");
      url.searchParams.delete("reference");
      url.searchParams.delete("interval");
      window.history.replaceState({}, "", url.pathname + (url.search || ""));

      // Verify and activate on the server (fallback if webhook hasn't fired yet)
      if (ref) {
        verifyPlanUpgrade(ref, upgraded, intv).then((res) => {
          if (res && "error" in res) {
            console.error("[upgrade verify]", res.error);
          }
        }).catch(() => {});
      }

      const p = plans.find((pl) => pl.id === upgraded);
      if (p) {
        const newFeatures = getNewFeatures(previousPlan, upgraded as PlanId);
        setCelebrating({ planName: p.name, newFeatures });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const triggerCelebration = useCallback((newPlanId: string) => {
    const p = plans.find((pl) => pl.id === newPlanId);
    if (p) {
      const newFeatures = getNewFeatures(previousPlan, newPlanId as PlanId);
      setCelebrating({ planName: p.name, newFeatures });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previousPlan]);

  const handleCelebrationDone = useCallback(() => {
    setCelebrating(null);
    localStorage.setItem("whq_plan_upgraded", Date.now().toString());
    localStorage.setItem("whq_prev_plan", previousPlan);
    router.refresh();
  }, [router, previousPlan]);

  const currentPlanId = subscription?.plan ?? "free";
  const currentPlan = plans.find((p) => p.id === currentPlanId) ?? plans[0];
  const isGrace = subscription?.status === "grace";
  const price = interval === "yearly" ? currentPlan.yearly / 12 : currentPlan.monthly;

  return (
    <div className="space-y-5">
      {celebrating && (
        <UpgradeCelebration
          planName={celebrating.planName}
          newFeatures={celebrating.newFeatures}
          onDone={handleCelebrationDone}
        />
      )}
      <Card className="p-6">
        <h3 className="font-display text-lg font-semibold">Billing & subscription</h3>
        <p className="text-sm text-ink-muted">Powered by Paystack. Billed in {platformPricing?.currency ?? "GHS"}.</p>

        <div className="mt-5 flex items-center justify-between rounded-2xl border border-primary/30 bg-primary/10 p-5">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary-bright" />
              <span className="font-display text-lg font-semibold">{currentPlan.name} plan</span>
              {isGrace && <Badge variant="success">Gift of Grace</Badge>}
            </div>
            <div className="mt-1 text-sm text-ink-muted">{currentPlan.members}</div>
          </div>
          <div className="text-right">
            {isGrace ? (
              <div className="font-display text-2xl font-bold text-success">Free forever</div>
            ) : (
              <>
                <div className="font-display text-2xl font-bold">
                  {fmtPrice(price)}
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
        </div>

        {subscription?.bypassPlan && (
          <div className="mt-4 rounded-xl border border-success/30 bg-success/10 p-4">
            <p className="text-sm font-medium text-success">
              You have a free upgrade available to the <strong>{plans.find((p) => p.id === subscription.bypassPlan)?.name ?? subscription.bypassPlan}</strong> plan!
            </p>
            <p className="mt-1 text-xs text-ink-muted">Enter the code sent to your phone to activate.</p>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const code = new FormData(e.currentTarget).get("code") as string;
                startSwitch(async () => {
                  const res = await redeemPlanBypass(code);
                  if ("error" in res) alert(res.error);
                  else triggerCelebration(res.plan);
                });
              }}
            >
              <Input name="code" placeholder="Enter 6-digit code" maxLength={6} className="w-40 font-mono tracking-widest" required />
              <Button type="submit" size="sm" disabled={switching}>
                {switching ? "Activating..." : "Activate"}
              </Button>
            </form>
          </div>
        )}

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
                    <span className="font-display text-2xl font-bold">{fmtPrice(monthlyPrice)}</span>
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
                    disabled={isCurrent || ro || switching}
                    onClick={() => {
                      if (isCurrent) return;
                      setUpgradePlan(plan);
                    }}
                  >
                    {isCurrent ? "Current plan" : plan.cta}
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Upgrade confirmation dialog */}
      {upgradePlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setUpgradePlan(null)}>
          <div
            className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-primary/10">
                <Sparkles className="size-5 text-primary-bright" />
              </div>
              <div>
                <h3 className="font-display text-lg font-semibold">Upgrade to {upgradePlan.name}</h3>
                <p className="text-sm text-ink-muted">{upgradePlan.tagline}</p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
              <div className="font-display text-2xl font-bold">
                {fmtPrice(interval === "yearly" ? upgradePlan.yearly / 12 : upgradePlan.monthly)}
                <span className="text-sm font-normal text-ink-faint">/mo</span>
              </div>
              <p className="text-xs text-ink-faint">
                {interval === "yearly"
                  ? `${sym}${upgradePlan.yearly.toLocaleString()} billed yearly`
                  : "Billed monthly"}
                {" · "}{upgradePlan.members}
              </p>
            </div>

            {upgradePlan.upgradeTips.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-semibold text-ink">What you get with {upgradePlan.name}:</h4>
                <ul className="mt-2 space-y-2">
                  {upgradePlan.upgradeTips.map((tip) => (
                    <li key={tip} className="flex items-start gap-2 text-sm text-ink-muted">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!features.payments && (
              <p className="mt-4 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                Payment gateway is in stub mode — upgrade will be applied instantly without payment. Enable Paystack to collect payments.
              </p>
            )}

            <div className="mt-5 flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setUpgradePlan(null)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                disabled={switching}
                onClick={() => {
                  startSwitch(async () => {
                    try {
                      const res = await changePlan(upgradePlan.id, interval);
                      if (res && "error" in res) alert(res.error);
                      else if (res && "plan" in res) {
                        setUpgradePlan(null);
                        setShowPlans(false);
                        triggerCelebration(res.plan as string);
                      }
                    } catch {
                      // redirect() throws NEXT_REDIRECT — expected for Paystack checkout
                    }
                  });
                }}
              >
                {switching
                  ? (features.payments ? "Redirecting to checkout…" : "Upgrading…")
                  : features.payments
                    ? `Pay & upgrade to ${upgradePlan.name}`
                    : `Upgrade to ${upgradePlan.name}`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SlugEditor({ slug, ro, isAdmin }: { slug: string; ro: boolean; isAdmin: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(slug);
  const [saving, startSave] = useTransition();
  const [error, setError] = useState("");

  const preview = draft
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return (
    <Card className="p-6">
      <h3 className="font-display text-lg font-semibold">Your church link</h3>
      <p className="text-sm text-ink-muted">
        This slug is used in all your shared links — membership, visitor form and prayer requests.
        Changing it updates every link at once.
      </p>
      <div className="mt-4 flex items-center gap-2">
        {editing ? (
          <>
            <div className="flex flex-1 items-center rounded-xl border border-line bg-surface px-3">
              <span className="text-xs text-ink-faint">/join/</span>
              <input
                value={draft}
                onChange={(e) => { setDraft(e.target.value); setError(""); }}
                className="h-10 flex-1 bg-transparent text-sm font-mono text-ink outline-none"
                autoFocus
              />
            </div>
            <Button
              size="sm"
              disabled={saving || preview.length < 3}
              onClick={() => {
                startSave(async () => {
                  const res = await updateSlug(preview);
                  if (res && "error" in res) setError(res.error ?? "Something went wrong");
                  else setEditing(false);
                });
              }}
            >
              {saving ? "Saving..." : "Save"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setDraft(slug); setError(""); }}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Input value={slug} readOnly className="flex-1 font-mono text-xs" />
            {isAdmin && !ro && (
              <Button variant="secondary" size="sm" onClick={() => { setDraft(slug); setEditing(true); }}>
                <Pencil className="size-3.5" /> Edit
              </Button>
            )}
          </>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      {editing && preview && preview !== slug && (
        <p className="mt-2 text-xs text-ink-faint">Preview: /join/<strong>{preview}</strong></p>
      )}
    </Card>
  );
}

function SharedLinkCard({ title, description, path, slug }: { title: string; description: string; path: string; slug?: string }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = slug ? `${origin}${path}` : "";
  const [copied, setCopied] = useState(false);

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-xs text-ink-muted">{description}</p>
      {url && (
        <div className="mt-3 flex items-center gap-2">
          <Input value={url} readOnly className="flex-1 font-mono text-xs" />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? <><Check className="size-3.5" /> Copied</> : <><Link2 className="size-3.5" /> Copy</>}
          </Button>
          <a href={path} target="_blank" rel="noopener noreferrer">
            <Button type="button" variant="ghost" size="sm">
              <ExternalLink className="size-3.5" /> Open
            </Button>
          </a>
        </div>
      )}
    </Card>
  );
}

/* ── Online Payments Tab ── */
function OnlinePaymentsTab({ churchId }: { churchId: string }) {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getPaymentRequestStatus().then((s) => { setStatus(s); setLoading(false); });
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    const formData = new FormData(e.currentTarget);
    const result = await submitPaymentRequest(formData);
    setSubmitting(false);
    if (result?.error) {
      setError(result.error);
    } else {
      setSubmitted(true);
      getPaymentRequestStatus().then(setStatus);
    }
  }

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <Spinner className="size-5 animate-spin text-teal-500" />
        </div>
      </Card>
    );
  }

  const hasActive = status && ["pending", "scheduled", "in_progress"].includes(status.status);
  const isCompleted = status?.status === "completed";

  return (
    <Card className="p-6 space-y-6">
      <div>
        <h3 className="font-display text-lg font-semibold">Online Payments</h3>
        <p className="text-sm text-muted-foreground">
          Request online payment setup for your church. Our team will schedule a meeting to discuss your needs
          and set up payment portals, USSD codes, and mobile money options.
        </p>
      </div>

      {isCompleted && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/20">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-5" />
            <span className="font-semibold">Online payments are set up!</span>
          </div>
          <div className="mt-3 space-y-2 text-sm">
            {status.ussdCode && <p><strong>USSD Code:</strong> {status.ussdCode}</p>}
            {status.portalUrl && <p><strong>Payment Portal:</strong> <a href={status.portalUrl} target="_blank" rel="noopener" className="text-teal-600 underline">{status.portalUrl}</a></p>}
            {status.adminNotes && <p className="text-muted-foreground">{status.adminNotes}</p>}
          </div>
        </div>
      )}

      {hasActive && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <Clock className="size-5" />
            <span className="font-semibold">
              {status.status === "pending" && "Request submitted — waiting for admin review"}
              {status.status === "scheduled" && "Meeting scheduled"}
              {status.status === "in_progress" && "Setup in progress"}
            </span>
          </div>
          {status.meetingDate && (
            <p className="mt-2 text-sm">
              Meeting: {new Date(status.meetingDate).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              {status.meetingType && ` (${status.meetingType === "call" ? "Phone call" : status.meetingType === "video" ? "Video call" : "In person"})`}
            </p>
          )}
          {status.adminNotes && <p className="mt-1 text-sm text-muted-foreground">{status.adminNotes}</p>}
        </div>
      )}

      {!hasActive && !submitted && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Contact Name *</Label>
            <Input name="contactName" required placeholder="Who should we reach out to?" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Phone</Label>
              <Input name="contactPhone" type="tel" placeholder="+233..." />
            </div>
            <div>
              <Label>Email</Label>
              <Input name="contactEmail" type="email" placeholder="you@church.org" />
            </div>
          </div>
          <div>
            <Label>What do you need?</Label>
            <textarea name="needs" rows={3} placeholder="Tell us what payment options you'd like — mobile money, card payments, USSD, QR codes, etc."
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={submitting}>
            {submitting && <Spinner className="size-4 animate-spin" />}
            {submitting ? "Submitting..." : "Request Online Payments Setup"}
          </Button>
        </form>
      )}

      {submitted && !hasActive && (
        <div className="rounded-xl border border-teal-200 bg-teal-50 p-4 dark:border-teal-800 dark:bg-teal-950/20">
          <div className="flex items-center gap-2 text-teal-700 dark:text-teal-400">
            <CheckCircle2 className="size-5" />
            <span className="font-semibold">Request submitted!</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Our team will review your request and reach out to schedule a meeting. You&apos;ll see updates here.
          </p>
        </div>
      )}
    </Card>
  );
}
