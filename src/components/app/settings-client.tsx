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
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import type { Session } from "@/lib/permissions";
import { ROLE_PERMISSIONS } from "@/lib/permissions";
import { plans } from "@/config/pricing";
import { formatCurrency } from "@/config/brand";
import { cn } from "@/lib/utils";

type FeatureMap = Record<string, boolean>;

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

export function SettingsClient({ session, features }: { session: Session; features: FeatureMap }) {
  const [tab, setTab] = useState<(typeof tabs)[number]["key"]>("church");

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
        {tab === "church" && (
          <Card className="p-6">
            <h3 className="font-display text-lg font-semibold">Church profile</h3>
            <p className="text-sm text-ink-muted">Basic information about your church.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div><Label>Church name</Label><Input defaultValue="Grace Temple" /></div>
              <div><Label>Denomination</Label><Input defaultValue="Pentecostal" /></div>
              <div><Label>City</Label><Input defaultValue="Accra" /></div>
              <div><Label>Country</Label><Input defaultValue="Ghana" /></div>
              <div className="sm:col-span-2"><Label>Address</Label><Input defaultValue="12 Independence Ave, Osu, Accra" /></div>
            </div>
            <Button className="mt-5">Save changes</Button>
          </Card>
        )}

        {tab === "branding" && (
          <Card className="p-6">
            <h3 className="font-display text-lg font-semibold">Branding</h3>
            <p className="text-sm text-ink-muted">Make WorshipHQ feel like your church.</p>
            <div className="mt-5 space-y-4">
              <div>
                <Label>Accent color</Label>
                <div className="flex gap-2">
                  {["#6D5EF8", "#E5B567", "#34D399", "#F472B6", "#60A5FA"].map((c) => (
                    <button key={c} className="size-9 rounded-lg ring-1 ring-white/10" style={{ background: c }} />
                  ))}
                </div>
              </div>
              <div><Label>Church logo</Label>
                <div className="grid h-24 place-items-center rounded-xl border border-dashed border-line text-sm text-ink-faint">Drop a logo here</div>
              </div>
            </div>
            <Button className="mt-5">Save branding</Button>
          </Card>
        )}

        {tab === "team" && (
          <Card>
            <div className="border-b border-line p-6">
              <h3 className="font-display text-lg font-semibold">Users & roles</h3>
              <p className="text-sm text-ink-muted">Role-based access control. You are signed in as <Badge variant="primary">{session.role}</Badge></p>
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
                  <Badge variant="default">{role === session.role ? "You" : "Role"}</Badge>
                </div>
              ))}
            </div>
          </Card>
        )}

        {tab === "billing" && (
          <Card className="p-6">
            <h3 className="font-display text-lg font-semibold">Billing & subscription</h3>
            <p className="text-sm text-ink-muted">Powered by Paystack · billed in ₵.</p>
            <div className="mt-5 flex items-center justify-between rounded-2xl border border-primary/30 bg-primary/10 p-5">
              <div>
                <div className="flex items-center gap-2"><Sparkles className="size-4 text-primary-bright" /><span className="font-display text-lg font-semibold">Growth plan</span></div>
                <div className="mt-1 text-sm text-ink-muted">Up to 1,000 members · 3 branches</div>
              </div>
              <div className="text-right">
                <div className="font-display text-2xl font-bold">{formatCurrency(plans[2].monthly)}<span className="text-sm font-normal text-ink-faint">/mo</span></div>
                <div className="text-xs text-ink-faint">Renews 5 Jul 2026</div>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button variant="secondary">Change plan</Button>
              <Button variant="ghost">Billing history</Button>
            </div>
            {!features.payments && (
              <p className="mt-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-warning">
                Paystack is in stub mode — add PAYSTACK_SECRET_KEY in .env.local to enable live billing.
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
