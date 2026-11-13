"use client";

import Link from "@/components/ui/app-link";
import { useState, useTransition, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Building, Palette, Users2, CreditCard, Plug, Check, Pencil, CircleDot,
  Sparkles, Link2, Layers, Trash2, ChevronDown, MessageSquare, MessageSquareText,
  ExternalLink, Rocket, Wallet, Loader2 as Spinner, Clock, CheckCircle2, Receipt, DatabaseBackup, Tags, Baby, GitBranch, Lock, X as XIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { SenderIdCard } from "@/components/app/sender-id-card";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import type { Session } from "@/lib/permissions";
import { OnlinePaymentsTab } from "@/components/app/online-payments-tab";
import { ServiceTimesTab } from "@/components/app/service-times-tab";
import { PlanHero, UsageTiles, PaymentHistory, type PaymentItem } from "@/components/app/billing-parts";
import { TrialCard, type TrialCardInfo } from "@/components/app/trial-card";
import { BillingRenewal, type CardRow } from "@/components/app/billing-renewal";
import { toastNow } from "@/components/ui/feedback";
import { AutoInactiveCard, type AutoInactiveData } from "@/components/app/auto-inactive-card";
import { MemberCategoriesTab } from "@/components/app/member-categories-tab";
import { AgeGroupsTab } from "@/components/app/age-groups-tab";
import { LinkedChurchesTab } from "@/components/app/linked-churches-tab";
import { canManage as canManageSection } from "@/lib/permissions";
import {
  updateChurch, changePlan, redeemPlanBypass, verifyPlanUpgrade, previewCoupon,
  previewPlanChangeAction, cancelScheduledChange,
  updateSlug, transferMainAdmin,
} from "@/app/actions/settings";
import { TeamTab, type TeamMember } from "@/components/app/team-tab";
import { BrandingForm } from "@/components/app/branding-form";
import { BackupsPanel } from "@/components/app/backups-panel";
import { LinksTab } from "@/components/app/links-tab";
import { MessageCenter } from "@/components/app/message-center";
import type { MessageCenterData } from "@/lib/messages/load";
import { getFormDefinition, getVisitorFormDefinition, getChildrenFormDefinition, getTeensFormDefinition } from "@/lib/forms/registration";
import { createDepartment, deleteDepartment } from "@/app/actions/departments";
import { plans as defaultPlans } from "@/config/pricing";
import type { EditablePlan, PlanPrices } from "@/lib/data/platform-config";
import { getPlanLimits, planRank, syncMemberText, getMinimumPlan, FEATURE_LABELS as PLAN_FEATURE_LABELS, type PlanId } from "@/lib/plan-gate";
import { usePaystack } from "@/components/payments/use-paystack";
import { cn } from "@/lib/utils";
import { confirmBinDelete } from "@/lib/recycle-bin-events";
import { BIN_TOAST } from "@/lib/recycle-bin-config";

type FeatureMap = Record<string, boolean>;
type Church = {
  name: string;
  denomination: string;
  city: string;
  country: string;
  address: string;
  notifySubmissions?: boolean;
  hideAmounts?: boolean;
  birthdayDigestOn?: boolean;
  birthdayDigestDay?: number;
  /** The plan does not include automatic birthday messages (Starter and up). */
  birthdayLocked?: boolean;
  /** Already linked to other churches: the Linked churches tab stays open even on a plan without it. */
  hasLinks?: boolean;
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
  rolePermissions?: import("@/lib/team-access").RolePermissions | null;
} | null;
type TeamUser = TeamMember;
type Dept = { id: string; name: string; memberCount?: number };
type CustomRoleRow = { id: string; name: string; sections: string[]; manageSections?: string[]; canDelete: boolean };
type SubscriptionData = { plan: string; status: string; interval: string; renewsAt: Date | null; bypassPlan: string | null; scheduledPlan?: string | null; cancelAtPeriodEnd?: boolean; autoRenew?: boolean; cardId?: string | null; renewalFailures?: number } | null;
type PlanChangePreviewData = {
  direction: string;
  amountDueUsd: number;
  listPrice: number;
  /** The interval the change is really priced on (an upgrade keeps the one the church is on). */
  interval?: string;
  daysLeft: number;
  unusedCreditUsd: number;
  effectiveDate: string;
  summary: string;
  symbol: string;
};
export type PlanPaymentRow = {
  id: string;
  reference: string;
  plan: string;
  interval: string;
  amountUsd: number;
  amountGhs: number;
  discountUsd: number;
  status: string;
  paidAt: string;
  periodEnd: string;
  source?: string;
  note?: string | null;
  termMonths?: number;
};
export type BillingUsage = { members: number; memberLimit: number | null; teamUsers: number; teamLimit: number | null; smsCredits: number };
export type SmsTopupRow = { id: string; at: string; credits: number; amountGhs: number | null; kind: string; note: string | null };

/** Settings tabs that need a plan feature. A church without it sees the tab, locked, with a way to upgrade. */
const TAB_FEATURE: Record<string, string> = {
  categories: "member-categories",
  "service-times": "service-times",
  linked: "linked-churches",
  "online-payments": "online-payments",
  messages: "custom-messages",
};

/** What a tab offers, said plainly, for the locked panel. */
const LOCKED_COPY: Record<string, string> = {
  "member-categories": "Group your members into zones, fellowships or any category you like, and let members pick theirs on the join form.",
  "service-times": "Set your service times so check-ins land on the right service and late arrivals are marked.",
  "linked-churches": "Link your branches, partner churches and teens chapel, and see them all from one account.",
  "online-payments": "Receive tithes, offerings and gifts by Mobile Money and card, paid straight into your church account.",
  "custom-messages": "Write your own wording for birthday wishes, receipts, reminders and every other message the church sends.",
};

function LockedTab({ feature, isOwner }: { feature: string; isOwner: boolean }) {
  const plan = getMinimumPlan(feature);
  const planName = plan.charAt(0).toUpperCase() + plan.slice(1);
  return (
    <Card className="p-8 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10"><Lock className="size-6 text-primary" /></div>
      <h3 className="mt-4 font-display text-lg font-semibold">{PLAN_FEATURE_LABELS[feature] ?? feature} comes with {planName}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">{LOCKED_COPY[feature]}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
        Available on the {planName} plan{plan === "max" ? "" : " and above"}. {isOwner ? "Unlock it in Billing." : "Ask your Main Admin to upgrade in Billing."}
      </p>
      <a href="/app/settings?tab=billing" className="mt-5 inline-flex h-10 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-white hover:opacity-90">Unlock in Billing</a>
    </Card>
  );
}

const tabs = [
  { key: "church", label: "Church profile", icon: Building },
  { key: "branding", label: "Branding", icon: Palette },
  { key: "team", label: "Users & roles", icon: Users2 },
  { key: "departments", label: "Departments", icon: Layers },
  { key: "categories", label: "Zones & fellowships", icon: Tags },
  { key: "age-groups", label: "Members & age groups", icon: Baby },
  { key: "service-times", label: "Service times", icon: Clock },
  { key: "linked", label: "Linked churches", icon: GitBranch },
  { key: "registration", label: "Links & forms", icon: Link2 },
  { key: "billing", label: "Billing", icon: CreditCard },
  { key: "online-payments", label: "Online Payments", icon: Wallet },
  { key: "messages", label: "Messages", icon: MessageSquareText },
  { key: "sms", label: "SMS Settings", icon: MessageSquare },
  { key: "backups", label: "Data backups", icon: DatabaseBackup },
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


/** The Main Admin hands the role to one of the church's Admins (asks for their password). */
function TransferMainAdmin({ admins }: { admins: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState(admins[0]?.id ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const target = admins.find((a) => a.id === userId);

  async function go() {
    setError("");
    setBusy(true);
    const res = await transferMainAdmin({ userId, password }).catch(() => ({ ok: false as const, error: "Something went wrong." }));
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    router.refresh();
  }

  return (
    <Card className="p-6">
      <h3 className="font-display text-[1rem] font-semibold">Hand over the Main Admin role</h3>
      <p className="mt-1 text-sm text-ink-muted">
        The Main Admin has full control, including billing and removing Admins. You can hand the role to one of your Admins, for example if you are stepping down. You will become an Admin, and both of you get a message.
      </p>
      {admins.length === 0 ? (
        <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink-muted">Make someone an Admin first, then you can hand the role to them.</p>
      ) : !open ? (
        <Button className="mt-3" variant="secondary" size="sm" onClick={() => setOpen(true)}>Hand over the role</Button>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted" htmlFor="tma-who">New Main Admin</label>
            <select id="tma-who" value={userId} onChange={(e) => setUserId(e.target.value)} className="flex h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm">
              {admins.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted" htmlFor="tma-pw">Your password</label>
            <Input id="tma-pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <p className="text-xs text-ink-faint sm:col-span-2">After this, {target?.name ?? "they"} is the Main Admin and you are an Admin. Only they can change it back.</p>
          {error && <p role="alert" className="text-sm text-danger sm:col-span-2">{error}</p>}
          <div className="flex gap-2 sm:col-span-2">
            <Button variant="danger" size="sm" onClick={go} disabled={busy || !password}>{busy ? <><Spinner className="size-4 animate-spin" /> Handing over…</> : "Make them Main Admin"}</Button>
            <Button variant="secondary" size="sm" onClick={() => { setOpen(false); setPassword(""); setError(""); }} disabled={busy}>Cancel</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

type PlatformPricing = { currency: string; currencySymbol: string; prices: PlanPrices; planList?: EditablePlan[] };

export function SettingsClient({
  session,
  features,
  church,
  users,
  departments,
  customRoles,
  subscription,
  platformPricing,
  payments = [],
  billingUsage,
  trial,
  smsTopups = [],
  cards = [],
  autoInactive,
  messageCenter,
}: {
  session: Session;
  features: FeatureMap;
  church: Church;
  users: TeamUser[];
  departments: Dept[];
  customRoles: CustomRoleRow[];
  subscription: SubscriptionData;
  platformPricing?: PlatformPricing;
  payments?: PlanPaymentRow[];
  billingUsage?: BillingUsage;
  trial?: TrialCardInfo;
  smsTopups?: SmsTopupRow[];
  /** Cards the church kept for renewals. Never carries the charge token. */
  cards?: CardRow[];
  autoInactive: AutoInactiveData;
  messageCenter: MessageCenterData;
}) {
  // Links such as /app/settings?tab=billing open straight on that tab.
  const asked = useSearchParams().get("tab");
  const [tab, setTab] = useState<(typeof tabs)[number]["key"]>(() => (tabs.find((t) => t.key === asked)?.key ?? "church"));
  const ro = session.isDemo;
  const isAdmin = session.role === "Owner" || session.role === "Admin";
  /** The plan feature a tab needs when the church's plan does not include it, else null. */
  const lockedFeature = (key: string): string | null => {
    const f = TAB_FEATURE[key];
    if (!f || session.isDemo) return null;
    if (key === "linked" && church?.hasLinks) return null;
    return session.planLocked?.includes(f) ? f : null;
  };
  const tabLock = lockedFeature(tab);

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <nav role="tablist" aria-label="Settings" aria-orientation="vertical" className="flex gap-1 overflow-x-auto lg:flex-col">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`settings-tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls="settings-panel"
            tabIndex={tab === t.key ? 0 : -1}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              tab === t.key ? "bg-primary/15 text-primary-bright" : "text-ink-muted hover:bg-surface-2 hover:text-ink",
            )}
          >
            <t.icon className="size-4" aria-hidden /> {t.label}
            {lockedFeature(t.key) && <Lock className="ml-auto size-3.5 text-ink-faint" aria-label="Locked on your plan" />}
          </button>
        ))}
      </nav>

      <div id="settings-panel" role="tabpanel" aria-labelledby={`settings-tab-${tab}`}>
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
                <div>
                  <Label>Country</Label>
                  <Input name="country" defaultValue={church?.country ?? "Ghana"} disabled={ro || session.role !== "Owner"} />
                  {/* The country sets the billing price, so only the Main Admin changes it, and moving into or out of Ghana goes through support. */}
                  <p className="mt-1 text-xs text-ink-faint">{session.role === "Owner" ? "Moving your church into or out of Ghana? Contact WorshipHQ support, as it changes your plan price." : "Only the Main Admin can change the country."}</p>
                </div>
                <div className="sm:col-span-2"><Label>Address</Label><Input name="address" defaultValue={church?.address ?? ""} disabled={ro} /></div>
              </div>
              <label className="mt-4 flex items-start gap-2 rounded-xl border border-line bg-surface-2/40 p-3 text-sm text-ink-muted">
                <input type="checkbox" name="notifySubmissions" defaultChecked={church?.notifySubmissions ?? true} disabled={ro} className="mt-0.5 size-4 rounded border-line accent-primary" />
                <span>
                  <span className="font-medium text-ink">Notify admins of new submissions</span> - text &amp; email your admins when a member sends a
                  prayer request, testimony or counselling request.
                </span>
              </label>
              <label className="mt-3 flex items-start gap-2 rounded-xl border border-line bg-surface-2/40 p-3 text-sm text-ink-muted">
                <input type="checkbox" name="hideAmounts" defaultChecked={church?.hideAmounts ?? false} disabled={ro} className="mt-0.5 size-4 rounded border-line accent-primary" />
                <span>
                  <span className="font-medium text-ink">Blur amounts on screen</span> - money is blurred on the dashboard, giving, accounting,
                  expenses and other finance pages until someone taps the eye button, so nobody can read it over your shoulder. Applies to everyone,
                  owners included. Off by default.
                </span>
              </label>
              <div className="mt-3 rounded-xl border border-line bg-surface-2/40 p-3 text-sm text-ink-muted">
                <label className="flex items-start gap-2">
                  {/* Locked: keep the saved choice so it is still there after an upgrade. */}
                  {church?.birthdayLocked && (church?.birthdayDigestOn ?? true) && <input type="hidden" name="birthdayDigestOn" value="on" />}
                  <input type="checkbox" name={church?.birthdayLocked ? undefined : "birthdayDigestOn"} defaultChecked={church?.birthdayDigestOn ?? true} disabled={ro || church?.birthdayLocked} className="mt-0.5 size-4 rounded border-line accent-primary" />
                  <span>
                    <span className="font-medium text-ink">Weekly birthday digest</span> - text &amp; email admins the week&rsquo;s upcoming birthdays.
                    {church?.birthdayLocked && <span className="mt-1 block text-xs text-ink-faint">Comes with the Starter plan and above. <a href="/app/settings?tab=billing" className="font-medium text-primary hover:underline">See plans</a></span>}
                  </span>
                </label>
                <div className="mt-2 flex items-center gap-2 pl-6">
                  <span className="text-xs text-ink-faint">Send every</span>
                  <select name="birthdayDigestDay" defaultValue={String(church?.birthdayDigestDay ?? 1)} disabled={ro} className="h-8 rounded-lg border border-line bg-base px-2 text-xs">
                    {["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </div>
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
          <div className="space-y-6">
            <TeamTab
              me={{ id: session.userId, role: session.role, isDemo: ro }}
              members={users}
              customRoles={customRoles.map((r) => ({ ...r, manageSections: r.manageSections ?? r.sections }))}
              departments={departments.map((d) => ({ id: d.id, name: d.name }))}
              rolePermissions={church?.rolePermissions ?? null}
              seats={{ used: billingUsage?.teamUsers ?? users.length, limit: billingUsage?.teamLimit ?? null }}
              customRolesLocked={!ro && !!session.planLocked?.includes("custom-roles")}
            />
            {session.role === "Owner" && !session.isDemo && (
              <TransferMainAdmin admins={users.filter((u) => u.role === "Admin").map((u) => ({ id: u.id, name: u.name ?? u.email ?? "" }))} />
            )}
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
                  <div key={d.id} className="flex items-center justify-between gap-3 px-6 py-4">
                    {/* Opens the department's own page, where people can be added in bulk - the
                        same move Groups has. Editing members one profile at a time was the only
                        way in before. */}
                    <Link
                      href={`/app/departments/${d.id}`}
                      className="group flex min-w-0 flex-1 items-center gap-2 font-medium hover:text-primary"
                    >
                      <span className="truncate">{d.name}</span>
                      <span className="flex shrink-0 items-center gap-1 text-xs font-normal text-ink-faint group-hover:text-primary">
                        <Users2 className="size-3.5" /> {d.memberCount ?? 0}
                      </span>
                    </Link>
                    {!ro && (
                      <form
                        action={deleteDepartment.bind(null, d.id)}
                        onSubmit={(e) => {
                          if (!confirmBinDelete(`Delete "${d.name}"? Members in this department will be unlinked.`)) {
                            e.preventDefault();
                          }
                        }}
                      >
                        <SubmitButton size="sm" variant="ghost" overlay={false} successMessage={BIN_TOAST} className="text-danger">
                          <Trash2 className="size-3.5" />
                        </SubmitButton>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="font-display text-[1rem] font-semibold">Add department</h3>
              <form action={createDepartment} className="mt-3 flex gap-3">
                <Input name="name" placeholder="e.g. Choir, Ushering, Youth" required disabled={ro} className="flex-1" />
                <Input name="description" placeholder="Description (optional)" disabled={ro} className="flex-1" />
                <SubmitButton disabled={ro} pendingLabel="Adding…" successMessage="Department added">Add</SubmitButton>
              </form>
            </Card>
          </div>
        )}

        {/* ── Links and sign-up forms ── */}
        {tab === "registration" && (
          <LinksTab
            slugEditor={<SlugEditor slug={church?.slug ?? ""} ro={ro} isAdmin={isAdmin} />}
            brand={{ name: church?.name ?? "", accent: church?.accentColor ?? "#0d7377", logo: church?.logoUrl ?? "", canMake: !session.planLocked?.includes("poster-maker"), canRemoveCredit: !session.planLocked?.includes("white-label-posters") }}
            forms={[
              { key: "member", icon: "member", title: "Member registration", description: "Members fill in their own details and appear in your People list automatically.", path: `/join/${church?.slug ?? ""}`, customize: isAdmin ? "/app/settings/forms/join" : undefined },
              { key: "visitor", icon: "visitor", title: "Visitor form", description: "A simple form for first-time visitors: name, phone, purpose of visit, prayer requests.", path: `/visit/${church?.slug ?? ""}`, customize: isAdmin ? "/app/settings/forms/visitor" : undefined },
              { key: "children", icon: "children", title: "Children's registration", description: "Register children with guardian details, school and class.", path: `/children/${church?.slug ?? ""}`, customize: isAdmin ? "/app/settings/forms/children" : undefined },
              { key: "teens", icon: "teens", title: "Teens registration", description: "Teens register with guardian info and choose the department they serve in.", path: `/teens/${church?.slug ?? ""}`, customize: isAdmin ? "/app/settings/forms/teens" : undefined },
            ]}
            share={[
              { key: "pray", icon: "prayer", title: "Prayer requests", description: "Members submit prayer requests online.", path: `/pray/${church?.slug ?? ""}`, customize: isAdmin ? "/app/settings/forms/prayer" : undefined },
              { key: "testify", icon: "testimony", title: "Testimonies", description: "Members share testimonies. You review each one before it is published.", path: `/testify/${church?.slug ?? ""}`, customize: isAdmin ? "/app/settings/forms/testimony" : undefined },
              { key: "counsel", icon: "counsel", title: "Counselling requests", description: "Members privately request counselling. Your admins are notified.", path: `/counsel/${church?.slug ?? ""}`, customize: isAdmin ? "/app/settings/forms/counsel" : undefined },
              { key: "give", icon: "give", title: "Online giving", description: "Mobile Money and card giving page.", path: `/give/${church?.slug ?? ""}`, customize: isAdmin ? "/app/settings/forms/give" : undefined },
              { key: "book", icon: "book", title: "Facility booking", description: "People request a hall or room for an event.", path: `/book/${church?.slug ?? ""}`, customize: isAdmin ? "/app/settings/forms/book" : undefined },
            ]}
          />
        )}

        {/* ── Billing ── */}
        {tab === "billing" && <BillingTab trial={trial} subscription={subscription} features={features} ro={ro} platformPricing={platformPricing} payments={payments} usage={billingUsage} smsTopups={smsTopups} cards={cards} isOwner={session.role === "Owner"} />}

        {tabLock && <LockedTab feature={tabLock} isOwner={session.role === "Owner"} />}

        {/* ── Online Payments ── */}
        {tab === "online-payments" && !tabLock && <OnlinePaymentsTab canManage={isAdmin && !ro} />}

        {tab === "categories" && !tabLock && <MemberCategoriesTab canManage={!ro && canManageSection(session, "people")} />}

        {tab === "linked" && !tabLock && <LinkedChurchesTab canManage={!ro && isAdmin} />}

        {tab === "age-groups" && (
          <div className="space-y-4">
            <AutoInactiveCard data={autoInactive} canWrite={!ro && canManageSection(session, "people")} />
            <AgeGroupsTab canManage={!ro && canManageSection(session, "people")} />
          </div>
        )}

        {tab === "service-times" && !tabLock && <ServiceTimesTab canManage={!ro && canManageSection(session, "attendance")} />}

        {tab === "backups" && <BackupsPanel />}

        {tab === "messages" && !tabLock && (
          <MessageCenter values={messageCenter.values} automations={messageCenter.automations} canWrite={!ro && isAdmin} />
        )}

        {tab === "sms" && (
          <SenderIdCard current={church?.smsSenderId ?? null} status={church?.smsSenderIdStatus ?? null} paid={planRank((subscription?.plan ?? "free") as PlanId) >= planRank("max")} canManage={!ro && isAdmin} />
        )}
      </div>
    </div>
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
  "poster-maker": "QR Poster Maker",
  "white-label-posters": "Posters without the WorshipHQ credit",
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
  fingerprint: "USB Fingerprint Check-in",
  "biometric-devices": "Face, Palm & Fingerprint Devices",
  baptisms: "Baptisms & Certificates",
  "linked-churches": "Branches & Linked Churches",
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
          <div className="mt-6 max-h-60 overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface-2/30 p-4">
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

function BillingTab({ trial, subscription, features, ro, platformPricing, payments = [], usage, smsTopups = [], cards = [], isOwner = false }: { trial?: TrialCardInfo; subscription: SubscriptionData; features: FeatureMap; ro: boolean; platformPricing?: PlatformPricing; payments?: PlanPaymentRow[]; usage?: BillingUsage; smsTopups?: SmsTopupRow[]; cards?: CardRow[]; isOwner?: boolean }) {
  const router = useRouter();
  // What the SuperAdmin saved (name, member limit, wording, price) wins over the built-in defaults.
  const plans = defaultPlans.map((p) => {
    const dbPrice = platformPricing?.prices[p.id];
    const live = platformPricing?.planList?.find((x) => x.id === p.id);
    const merged = live
      ? { ...p, name: live.name, tagline: live.tagline, members: live.membersLabel, featured: live.featured, cta: live.cta, features: live.marketingFeatures, upgradeTips: p.upgradeTips.map((t) => syncMemberText(t, live.memberLimit)) }
      : p;
    return dbPrice ? { ...merged, monthly: dbPrice.monthly, yearly: dbPrice.yearly } : merged;
  });
  const sym = platformPricing?.currencySymbol ?? "₵";
  // Round before formatting: a yearly price shown per-month (100/12) is 8.3333..., and toLocaleString
  // would print "8.333". Never show a price with stray decimals.
  const fmtPrice = (amount: number) =>
    `${sym}${(Math.round(amount * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  const [showPlans, setShowPlans] = useState(false);
  const [interval, setInterval] = useState<"monthly" | "yearly">(
    (subscription?.interval as "monthly" | "yearly") ?? "monthly",
  );
  const [switching, startSwitch] = useTransition();
  const [upgradePlan, setUpgradePlan] = useState<typeof plans[number] | null>(null);
  // SuperAdmin-issued discount code applied at checkout.
  const [couponCode, setCouponCode] = useState("");
  const [couponError, setCouponError] = useState("");
  const [couponInfo, setCouponInfo] = useState<
    { label: string; listAmount: number; newAmount: number; saved: number; symbol: string } | null
  >(null);
  const [checkingCoupon, startCouponCheck] = useTransition();
  // Proration / scheduled-downgrade preview for the plan-change dialog.
  const [changePreview, setChangePreview] = useState<PlanChangePreviewData | null>(null);
  const [loadingPreview, startPreview] = useTransition();
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  // "Keep my card and renew automatically": opt-in, so it starts unticked.
  const [saveCard, setSaveCard] = useState(false);
  // The reference of a payment made in this visit, so the card can be offered while it is fresh.
  const [justPaidRef, setJustPaidRef] = useState<string | null>(null);
  const [celebrating, setCelebrating] = useState<{ planName: string; newFeatures: string[] } | null>(null);

  const previousPlan = (subscription?.plan ?? "free") as PlanId;

  // Detect ?upgraded= param (from Paystack redirect) - verify payment and activate
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

  // ?upgrade=<plan> (a paid plan picked at sign-up): open that plan's checkout so it can be paid for.
  useEffect(() => {
    if (typeof window === "undefined" || ro) return;
    const url = new URL(window.location.href);
    const wanted = url.searchParams.get("upgrade");
    if (!wanted) return;
    url.searchParams.delete("upgrade");
    window.history.replaceState({}, "", url.pathname + (url.search || ""));
    const plan = plans.find((pl) => pl.id === wanted);
    if (!plan || plan.id === (subscription?.plan ?? "free")) return;
    setUpgradePlan(plan);
    startPreview(async () => {
      setChangePreview(await previewPlanChangeAction(plan.id, interval));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { start: startPaystack } = usePaystack();

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
  // Downgrades never charge and never refund - they're scheduled for period end.
  const isDowngrade = changePreview?.direction === "downgrade";
  // Same plan, near or past its end: the church is renewing, not upgrading.
  const isRenewal = changePreview?.direction === "renew";

  const currentPlan = plans.find((p) => p.id === currentPlanId) ?? plans[0];
  const isGrace = subscription?.status === "grace";
  // What this church is actually billed, so it follows the real subscription - not the monthly/yearly tab
  // the user is browsing with. Shown as the full amount for the period, never a per-month slice.
  const billedYearly = (subscription?.interval ?? "monthly") === "yearly";
  const price = billedYearly ? currentPlan.yearly : currentPlan.monthly;

  return (
    <div className="space-y-5">
      {celebrating && (
        <UpgradeCelebration
          planName={celebrating.planName}
          newFeatures={celebrating.newFeatures}
          onDone={handleCelebrationDone}
        />
      )}
      {/* A queued downgrade - they keep what they paid for until period end. */}
      {(subscription?.scheduledPlan || subscription?.cancelAtPeriodEnd) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-info/30 bg-info/10 px-4 py-3">
          <p className="text-sm text-info">
            <Clock className="mr-1.5 inline size-4" />
            Scheduled: you move to{" "}
            <b className="capitalize">{subscription.cancelAtPeriodEnd ? "Free" : subscription.scheduledPlan}</b>
            {subscription.renewsAt && <> on {new Date(subscription.renewsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</>}.
            You keep your current plan until then - nothing more to pay.
          </p>
          <Button
            size="sm"
            variant="secondary"
            disabled={switching}
            onClick={() => startSwitch(async () => { await cancelScheduledChange(); router.refresh(); })}
          >
            Keep my current plan
          </Button>
        </div>
      )}

      {trial && (
        <TrialCard
          trial={trial}
          isOwner={isOwner}
          readOnly={ro}
          highlights={plans.find((p) => p.id === (trial.canStart ?? trial.plan))?.features ?? []}
          onUpgrade={(planId) => {
            const plan = plans.find((pl) => pl.id === planId);
            if (!plan) return;
            setUpgradePlan(plan);
            setCouponCode(""); setCouponInfo(null); setCouponError(""); setAcceptedTerms(false);
            setChangePreview(null);
            startPreview(async () => {
              setChangePreview(await previewPlanChangeAction(plan.id, interval));
            });
          }}
        />
      )}

      <PlanHero
        planName={currentPlan.name}
        members={currentPlan.members}
        priceText={isGrace ? "Free forever" : currentPlanId === "free" ? "Free" : `${fmtPrice(price)}${billedYearly ? "/year" : "/mo"}`}
        status={isGrace ? "grace" : currentPlanId === "free" ? "free" : "active"}
        renewsAt={subscription?.renewsAt ? String(subscription.renewsAt) : null}
        interval={subscription?.interval ?? "monthly"}
        isFree={currentPlanId === "free"}
        canChange={!ro}
        onChange={() => setShowPlans(!showPlans)}
      />

      {subscription && (
        <BillingRenewal
          sub={subscription}
          planName={currentPlan.name}
          priceText={fmtPrice(price)}
          cards={cards}
          recentPayments={payments.map((p) => ({ id: p.id, reference: p.reference, source: p.source ?? "paystack", plan: p.plan, paidAt: p.paidAt, status: p.status }))}
          canManage={!ro && isOwner}
          paymentsLive={!!features.payments}
          justPaidRef={justPaidRef}
          onRenew={() => {
            setUpgradePlan(currentPlan);
            setCouponCode(""); setCouponInfo(null); setCouponError(""); setAcceptedTerms(false); setSaveCard(false);
            setChangePreview(null);
            const keep = (subscription.interval as "monthly" | "yearly") ?? "monthly";
            setInterval(keep);
            startPreview(async () => { setChangePreview(await previewPlanChangeAction(currentPlan.id, keep)); });
          }}
        />
      )}

      {usage && <UsageTiles {...usage} />}

      <Card className="p-6">
        <h3 className="font-display text-[1rem] font-semibold">Your plan includes</h3>
        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {currentPlan.features.map((f) => (
            <li key={f} className="flex items-center gap-2 text-sm text-ink">
              <Check className="size-3.5 shrink-0 text-success" /> {f}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-ink-faint">Billed in {platformPricing?.currency ?? "GHS"} through Paystack. Need a longer term, like 3 or 5 years? Contact us and we will set it up for you.</p>

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
            Paystack is in stub mode - add PAYSTACK_SECRET_KEY to enable live billing & giving.
          </p>
        )}
      </Card>

      {/* The plans open in a window over the page: people who never scroll still see them. */}
      {showPlans && !isGrace && (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center" onClick={() => setShowPlans(false)} role="dialog" aria-modal="true" aria-label="Choose a plan">
        <Card className="relative my-8 w-full max-w-5xl p-6" onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => setShowPlans(false)} aria-label="Close" className="absolute right-3 top-3 grid size-9 place-items-center rounded-lg text-ink-muted hover:bg-surface-2 hover:text-ink">
            <XIcon className="size-5" />
          </button>
          <div className="flex flex-wrap items-center justify-between gap-3 pr-10">
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
              const isYearly = interval === "yearly";
              // Show what the church actually pays: the full yearly total on the yearly tab, not a
              // per-month slice of it. The per-month equivalent goes underneath, rounded.
              const shownPrice = isYearly ? plan.yearly : plan.monthly;
              const perMonthEquivalent = isYearly && plan.yearly > 0 ? plan.yearly / 12 : null;
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
                    {shownPrice > 0 ? (
                      <>
                        <span className="font-display text-2xl font-bold">{fmtPrice(shownPrice)}</span>
                        <span className="text-sm text-ink-faint">{isYearly ? "/year" : "/mo"}</span>
                      </>
                    ) : (
                      <span className="font-display text-2xl font-bold">Free</span>
                    )}
                  </div>
                  {perMonthEquivalent !== null && (
                    <div className="mt-0.5 text-xs text-ink-faint">
                      about {fmtPrice(perMonthEquivalent)}/mo, billed once a year
                    </div>
                  )}
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
                      setCouponCode(""); setCouponInfo(null); setCouponError(""); setAcceptedTerms(false);
                      setChangePreview(null);
                      startPreview(async () => {
                        setChangePreview(await previewPlanChangeAction(plan.id, interval));
                      });
                    }}
                  >
                    {isCurrent ? "Current plan" : plan.cta}
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>
        </div>
      )}

      {/* Upgrade confirmation dialog */}
      {/* ── Payments and receipts ── */}
      <PaymentHistory
        sym={sym}
        items={[
          ...payments.map((p): PaymentItem => {
            const src = (p.source === "granted" || p.source === "offline" ? p.source : "paystack") as PaymentItem["source"];
            const term = p.termMonths ? (p.termMonths % 12 === 0 ? `${p.termMonths / 12} year${p.termMonths === 12 ? "" : "s"}` : `${p.termMonths} month${p.termMonths === 1 ? "" : "s"}`) : p.interval;
            return {
              id: p.id, kind: "plan", at: p.paidAt, title: `${p.plan} plan · ${term}`,
              detail: p.note || (src === "paystack" ? p.reference : ""),
              amountDisplay: src === "granted" ? 0 : p.amountUsd, amountGhs: p.amountGhs, discountDisplay: p.discountUsd,
              source: src, status: p.status === "refunded" ? "refunded" : "paid",
              canRefund: src === "paystack" && p.amountUsd > 0,
            };
          }),
          ...smsTopups.map((t): PaymentItem => ({
            id: `sms-${t.id}`, kind: "sms", at: t.at, title: `${t.credits.toLocaleString()} SMS credits`,
            detail: t.kind === "bonus" ? (t.note ?? "Gift from WorshipHQ") : "Top-up",
            amountDisplay: null, amountGhs: t.amountGhs ?? 0,
            source: t.kind === "bonus" ? "granted" : "paystack", status: "paid",
          })),
        ]}
      />

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
                <h3 className="font-display text-lg font-semibold">{isRenewal ? `Renew ${upgradePlan.name}` : `Upgrade to ${upgradePlan.name}`}</h3>
                <p className="text-sm text-ink-muted">{upgradePlan.tagline}</p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
              {loadingPreview || !changePreview ? (
                <div className="flex items-center gap-2 text-sm text-ink-muted">
                  <Spinner className="size-4 animate-spin" /> Working out your price…
                </div>
              ) : isDowngrade ? (
                <>
                  <div className="font-display text-2xl font-bold text-ink">No charge</div>
                  <p className="mt-1 text-xs text-ink-muted">{changePreview.summary}</p>
                </>
              ) : (
                <>
                  <div className="font-display text-2xl font-bold">
                    {sym}{(couponInfo?.newAmount ?? changePreview.amountDueUsd).toLocaleString()}
                    <span className="text-sm font-normal text-ink-faint"> due now</span>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">{changePreview.summary}</p>
                  {changePreview.direction === "upgrade" && changePreview.unusedCreditUsd > 0 && (
                    <p className="mt-1 text-xs text-success">
                      Includes {sym}{changePreview.unusedCreditUsd.toLocaleString()} credit for the time you&rsquo;ve already paid for.
                    </p>
                  )}
                  <p className="mt-2 text-xs text-ink-faint">
                    Then {sym}{((changePreview.interval ?? interval) === "yearly" ? upgradePlan.yearly : upgradePlan.monthly).toLocaleString()}
                    {(changePreview.interval ?? interval) === "yearly" ? " / year" : " / month"} · {upgradePlan.members}
                  </p>
                </>
              )}
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

            {/* ── Discount code (paid changes only) ── */}
            <div className={cn("mt-4", isDowngrade && "hidden")}>
              <Label>Have a discount code?</Label>
              <div className="flex gap-2">
                <Input
                  value={couponCode}
                  onChange={(e) => { setCouponCode(e.target.value); setCouponInfo(null); setCouponError(""); }}
                  placeholder="e.g. WOR2650OFF"
                  className="font-mono uppercase"
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!couponCode.trim() || checkingCoupon}
                  onClick={() => {
                    setCouponError("");
                    startCouponCheck(async () => {
                      const res = await previewCoupon(couponCode, upgradePlan.id, interval);
                      if (!res.ok) { setCouponInfo(null); setCouponError(res.error); return; }
                      setCouponInfo(res);
                    });
                  }}
                >
                  {checkingCoupon ? <Spinner className="size-4 animate-spin" /> : "Apply"}
                </Button>
              </div>
              {couponError && <p className="mt-1 text-xs text-danger">{couponError}</p>}
              {couponInfo && (
                <p className="mt-1 text-xs font-medium text-success">
                  {couponInfo.label} applied - you pay {couponInfo.symbol}
                  {couponInfo.newAmount.toLocaleString()} instead of {couponInfo.symbol}
                  {couponInfo.listAmount.toLocaleString()} (save {couponInfo.symbol}
                  {couponInfo.saved.toLocaleString()}).
                </p>
              )}
            </div>

            {!features.payments && !isDowngrade && (
              <p className="mt-4 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                Payment gateway is in stub mode - upgrade will be applied instantly without payment. Enable Paystack to collect payments.
              </p>
            )}

            {/* ── Keep my card (opt-in; live card payments only) ── */}
            {!isDowngrade && features.payments && (
              <label className="mt-4 flex items-start gap-2 rounded-lg border border-line bg-surface-2/50 p-3 text-xs text-ink-muted">
                <input
                  type="checkbox"
                  checked={saveCard}
                  onChange={(e) => setSaveCard(e.target.checked)}
                  className="mt-0.5 size-4 shrink-0 rounded border-line accent-primary"
                />
                <span>
                  <b className="text-ink">Keep my card and renew automatically.</b> If you pay by card we keep it safely with our payment
                  provider and charge it on each renewal date, with a heads-up three days before. Turn it off any time in Billing.
                  Mobile Money can&rsquo;t be kept, because it has to be approved on your phone each time.
                </span>
              </label>
            )}

            {/* ── Terms acceptance (required before any payment) ── */}
            {!isDowngrade && (
              <label className="mt-4 flex items-start gap-2 rounded-lg border border-line bg-surface-2/50 p-3 text-xs text-ink-muted">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 size-4 shrink-0 rounded border-line accent-primary"
                />
                <span>
                  I understand and accept the{" "}
                  <a href="/terms" target="_blank" className="font-semibold text-primary hover:underline">Terms of Service</a>{" "}
                  and{" "}
                  <a href="/refund-policy" target="_blank" className="font-semibold text-primary hover:underline">Refund Policy</a>.
                  Refunds are limited to the eligibility window; outside it, plan changes are handled by downgrading, which takes
                  effect at the end of the period you&rsquo;ve paid for.
                </span>
              </label>
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
                disabled={switching || loadingPreview || (!isDowngrade && !acceptedTerms)}
                onClick={() => {
                  startSwitch(async () => {
                    const res = await changePlan(upgradePlan.id, interval, couponCode.trim() || undefined, saveCard);
                    if (res && "error" in res) { alert(res.error); return; }
                    if (!res || !("plan" in res)) return;
                    // Downgrade: nothing was charged, it's queued for period end.
                    if ("scheduled" in res && res.scheduled) {
                      setUpgradePlan(null);
                      setShowPlans(false);
                      router.refresh();
                      return;
                    }
                    const planId = res.plan as string;
                    const usedCouponId = "couponId" in res ? res.couponId : null;
                    // Live mode returns payment init → open the in-app popup and
                    // celebrate once the charge succeeds. Stub/free celebrates now.
                    if ("payment" in res && res.payment) {
                      await startPaystack(res.payment, {
                        onSuccess: async (ref) => {
                          await verifyPlanUpgrade(ref, planId, interval, usedCouponId);
                          setUpgradePlan(null);
                          setShowPlans(false);
                          setJustPaidRef(ref);
                          // A renewal unlocks nothing new, so it gets a thank-you, not the upgrade fanfare.
                          if (isRenewal) { toastNow("Plan renewed. Thank you!", "success"); router.refresh(); }
                          else triggerCelebration(planId);
                        },
                        onError: (m) => alert(m),
                      });
                    } else {
                      setUpgradePlan(null);
                      setShowPlans(false);
                      if (isRenewal) { toastNow("Plan renewed. Thank you!", "success"); router.refresh(); }
                      else triggerCelebration(planId);
                    }
                  });
                }}
              >
                {switching
                  ? (isDowngrade ? "Scheduling…" : features.payments ? "Opening checkout…" : isRenewal ? "Renewing…" : "Applying…")
                  : isDowngrade
                    ? `Schedule move to ${upgradePlan.name}`
                    : features.payments
                      ? `Pay ${sym}${(couponInfo?.newAmount ?? changePreview?.amountDueUsd ?? 0).toLocaleString()} & ${isRenewal ? "renew" : "switch"}`
                      : isRenewal ? `Renew ${upgradePlan.name}` : `Switch to ${upgradePlan.name}`}
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
    <Card className="p-4">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h3 className="font-display text-[1rem] font-semibold">Your church link name</h3>
        <p className="text-xs text-ink-muted">Used in every link below. Changing it updates all of them at once.</p>
      </div>
      <div className="mt-3 flex items-center gap-2">
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
