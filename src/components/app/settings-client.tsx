"use client";

import { useState } from "react";
import {
  Building,
  Palette,
  Users2,
  CreditCard,
  Plug,
  Check,
  CircleDot,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import type { Session } from "@/lib/permissions";
import { ROLE_PERMISSIONS } from "@/lib/permissions";
import { updateChurch, updateBranding, inviteTeammate } from "@/app/actions/settings";
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
} | null;
type TeamUser = { name: string; email: string; role: string };

const tabs = [
  { key: "church", label: "Church profile", icon: Building },
  { key: "branding", label: "Branding", icon: Palette },
  { key: "team", label: "Users & roles", icon: Users2 },
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

const ACCENTS = ["#5b43db", "#b07d20", "#15966b", "#db2777", "#2563eb"];

export function SettingsClient({
  session,
  features,
  church,
  users,
}: {
  session: Session;
  features: FeatureMap;
  church: Church;
  users: TeamUser[];
}) {
  const [tab, setTab] = useState<(typeof tabs)[number]["key"]>("church");
  const [accent, setAccent] = useState(church?.accentColor ?? "#5b43db");
  const ro = session.isDemo;

  return (
    <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
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
              <Button type="submit" className="mt-5" disabled={ro}>Save changes</Button>
            </form>
          </Card>
        )}

        {tab === "branding" && (
          <Card className="p-6">
            <h3 className="font-display text-lg font-semibold">Branding</h3>
            <p className="text-sm text-ink-muted">Make WorshipHQ feel like your church.</p>
            <form action={updateBranding} className="mt-5 space-y-4">
              <input type="hidden" name="accentColor" value={accent} />
              <div>
                <Label>Accent color</Label>
                <div className="flex gap-2">
                  {ACCENTS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setAccent(c)}
                      className={cn(
                        "size-9 rounded-lg ring-2 ring-offset-2 ring-offset-surface transition",
                        accent === c ? "ring-ink" : "ring-transparent",
                      )}
                      style={{ background: c }}
                      aria-label={`Accent ${c}`}
                    />
                  ))}
                </div>
              </div>
              <Button type="submit" disabled={ro}>Save branding</Button>
            </form>
          </Card>
        )}

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
                    <Badge variant="default">{u.role}</Badge>
                  </div>
                ))}
              </div>
            </Card>

            {(session.role === "Owner" || session.role === "Admin") && (
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
                    {["Admin", "Finance", "Leader", "Volunteer"].map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                  <Input name="password" placeholder="Temp password (optional)" disabled={ro} />
                  <Button type="submit" className="sm:col-span-2" disabled={ro}>Send invite</Button>
                </form>
                <p className="mt-2 text-xs text-ink-faint">
                  They&rsquo;ll sign in with this email and temporary password (they can change it later).
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

        {tab === "billing" && (
          <Card className="p-6">
            <h3 className="font-display text-lg font-semibold">Billing & subscription</h3>
            <p className="text-sm text-ink-muted">Powered by Paystack · billed in ₵.</p>
            <div className="mt-5 flex items-center justify-between rounded-2xl border border-primary/30 bg-primary/10 p-5">
              <div>
                <div className="flex items-center gap-2"><Sparkles className="size-4 text-primary-bright" /><span className="font-display text-lg font-semibold">Free plan</span></div>
                <div className="mt-1 text-sm text-ink-muted">Up to 50 members · 1 branch</div>
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
                Paystack is in stub mode — add PAYSTACK_SECRET_KEY to enable live billing & giving.
              </p>
            )}
          </Card>
        )}

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
