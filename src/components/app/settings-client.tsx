"use client";

import { useState } from "react";
import {
  Building, Palette, Users2, CreditCard, Plug, Check, CircleDot,
  Sparkles, UserPlus, Link2, Layers, Trash2, ChevronDown, UserCircle,
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
  changeUserRole, removeTeamMember, updateProfile,
} from "@/app/actions/settings";
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
} | null;
type TeamUser = { id: string; name: string; email: string; role: string };
type Dept = { id: string; name: string };

const tabs = [
  { key: "account", label: "My account", icon: UserCircle },
  { key: "church", label: "Church profile", icon: Building },
  { key: "branding", label: "Branding", icon: Palette },
  { key: "team", label: "Users & roles", icon: Users2 },
  { key: "departments", label: "Departments", icon: Layers },
  { key: "registration", label: "Join link", icon: Link2 },
  { key: "billing", label: "Billing", icon: CreditCard },
  { key: "integrations", label: "Integrations", icon: Plug },
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
}: {
  session: Session;
  features: FeatureMap;
  church: Church;
  users: TeamUser[];
  departments: Dept[];
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

        {/* ── My account ── */}
        {tab === "account" && (
          <Card className="p-6">
            <h3 className="font-display text-lg font-semibold">My account</h3>
            <p className="text-sm text-ink-muted">
              Your display name shown across the app and in your church&rsquo;s team list. Use your real name, a role
              (e.g. &ldquo;Media Team&rdquo;), or your church name.
            </p>
            {session.impersonating ? (
              <div className="mt-5 rounded-xl border border-dashed border-line p-4 text-sm text-ink-faint">
                You&rsquo;re viewing this church as support — account editing is disabled here.
              </div>
            ) : (
              <form action={updateProfile} className="mt-5 max-w-md space-y-4">
                <div>
                  <Label htmlFor="profileName">Display name</Label>
                  <Input id="profileName" name="name" defaultValue={session.name} placeholder="e.g. Media Team" required disabled={ro} />
                </div>
                <div>
                  <Label htmlFor="profileEmail">Login email</Label>
                  <Input id="profileEmail" name="email" type="email" defaultValue={session.email} disabled={ro} />
                  <p className="mt-1 text-xs text-ink-faint">Used to sign in. Leave unchanged if you&rsquo;re unsure.</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-ink-faint">
                  <CircleDot className="size-3.5" /> Signed in as <span className="font-medium text-ink-muted">{session.role}</span>
                </div>
                <SubmitButton disabled={ro} successMessage="Profile updated">Save profile</SubmitButton>
              </form>
            )}
          </Card>
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
                            defaultValue={u.role}
                            className="h-8 rounded-lg border border-line bg-surface px-2 text-xs"
                          >
                            {ALL_ROLES.map((r) => <option key={r}>{r}</option>)}
                          </select>
                          <SubmitButton size="sm" variant="secondary" overlay={false} successMessage="Role updated" className="h-8 px-2 text-xs">
                            Update
                          </SubmitButton>
                        </form>
                      ) : (
                        <Badge variant="default">{u.role}</Badge>
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
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                  <Input name="password" placeholder="Temp password (optional)" disabled={ro} />
                  <SubmitButton className="sm:col-span-2" disabled={ro} pendingLabel="Sending invite…" successMessage="Invite sent">Send invite</SubmitButton>
                </form>
                <p className="mt-2 text-xs text-ink-faint">
                  They&rsquo;ll sign in with this email and temporary password.
                </p>
              </Card>
            )}

            <Card>
              <div className="border-b border-line p-6">
                <h3 className="font-display text-base font-semibold">What each role can access</h3>
              </div>
              <div className="divide-y divide-line-soft">
                {Object.entries(ROLE_PERMISSIONS).map(([role, perms]) => (
                  <div key={role} className="flex items-start justify-between gap-4 p-5">
                    <div>
                      <div className="font-medium">{role}</div>
                      <div className="mt-1 text-xs text-ink-faint">
                        {perms.includes("*") ? "Full access to everything" : `Access: ${perms.join(", ")}`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
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
        {tab === "billing" && (
          <Card className="p-6">
            <h3 className="font-display text-lg font-semibold">Billing & subscription</h3>
            <p className="text-sm text-ink-muted">Powered by Paystack. Billed in GHS.</p>
            <div className="mt-5 flex items-center justify-between rounded-2xl border border-primary/30 bg-primary/10 p-5">
              <div>
                <div className="flex items-center gap-2"><Sparkles className="size-4 text-primary-bright" /><span className="font-display text-lg font-semibold">Free plan</span></div>
                <div className="mt-1 text-sm text-ink-muted">Up to 50 members. 1 branch</div>
              </div>
              <div className="text-right">
                <div className="font-display text-2xl font-bold">{formatCurrency(plans[0].monthly)}<span className="text-sm font-normal text-ink-faint">/mo</span></div>
                <div className="text-xs text-ink-faint">Upgrade anytime</div>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" disabled={ro}>Upgrade plan</Button>
              <Button variant="ghost">Billing history</Button>
            </div>
            {!features.payments && (
              <p className="mt-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-warning">
                Paystack is in stub mode --- add PAYSTACK_SECRET_KEY to enable live billing & giving.
              </p>
            )}
          </Card>
        )}

        {/* ── Integrations ── */}
        {tab === "integrations" && (
          <Card>
            <div className="border-b border-line p-6">
              <h3 className="font-display text-lg font-semibold">Integrations</h3>
              <p className="text-sm text-ink-muted">Each integration runs in safe stub mode until you add its key.</p>
            </div>
            <div className="divide-y divide-line-soft">
              {integrationList.map((it) => {
                const live = features[it.key];
                return (
                  <div key={it.key} className="flex items-center justify-between gap-4 p-5">
                    <div>
                      <div className="font-medium">{it.name}</div>
                      <div className="text-xs text-ink-faint">{it.desc}</div>
                    </div>
                    {live ? (
                      <Badge variant="success"><Check className="size-3" /> Live</Badge>
                    ) : (
                      <Badge variant="default"><CircleDot className="size-3" /> Stub mode</Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
