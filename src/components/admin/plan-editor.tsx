"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Save, Check, Star, Infinity as InfinityIcon, AlertTriangle, ChevronDown,
} from "lucide-react";
import { updatePlanDefinitions } from "@/app/actions/admin";
import {
  CORE_FEATURES, FEATURE_LABELS, PLAN_IDS, type PlanId,
} from "@/lib/plan-gate";
import type { EditablePlan } from "@/lib/data/platform-config";

const CURRENCIES = [
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "GHS", symbol: "₵", name: "Ghana Cedi" },
  { code: "NGN", symbol: "₦", name: "Nigerian Naira" },
  { code: "KES", symbol: "KSh", name: "Kenyan Shilling" },
  { code: "ZAR", symbol: "R", name: "South African Rand" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "EUR", symbol: "€", name: "Euro" },
];

/** Feature keys grouped into matrix sections. Anything unlisted falls into "Other". */
const FEATURE_GROUPS: { label: string; keys: string[] }[] = [
  { label: "Core", keys: ["dashboard", "people", "attendance", "events", "giving", "reports", "directory", "calendar", "birthdays", "departments", "leaders", "notices", "groups", "households", "visitors", "prayer-requests", "children-forms", "teens-forms"] },
  { label: "Growth", keys: ["sms", "reminders", "form-builder", "import-export", "member-ids", "qr-codes", "custom-roles", "harvest", "pledges", "recurring-giving", "auto-receipts", "data-migration", "follow-ups", "sermons", "devotionals", "testimonies"] },
  { label: "Advanced", keys: ["automations", "volunteers", "rosters", "volunteer-scheduling", "engagement-scoring", "advanced-reports", "welfare", "counseling", "auto-inactive", "bookings"] },
  { label: "Finance & scale", keys: ["accounting", "budgets", "expenses", "fund-accounting", "assets", "api-access", "audit-log"] },
];

/** Short helper line under each feature name in the matrix. */
const FEATURE_DESC: Record<string, string> = {
  people: "Member profiles, photos & families", giving: "Tithes, offerings & receipts",
  attendance: "Mark present or scan a QR", sms: "Text your whole church or a group",
  reminders: "Birthday & anniversary automations", "form-builder": "Design your own join forms",
  "import-export": "Bring data in and out via CSV/Excel", "qr-codes": "Member ID QR codes",
  "custom-roles": "Fine-grained team permissions", harvest: "Annual harvest tracking",
  automations: "Trigger-based workflows", volunteers: "Schedule & manage volunteers",
  accounting: "Full fund accounting", budgets: "Plan & track budgets",
  "api-access": "Integrate with other tools", "audit-log": "Who changed what, when",
  "advanced-reports": "Deeper analytics & trends", welfare: "Benevolence records",
};

const label = (k: string) => FEATURE_LABELS[k] ?? k;
const isCore = (k: string) => CORE_FEATURES.includes(k);

export function PlanEditor({
  currency: initCurrency,
  currencySymbol: initSymbol,
  usdToGhsRate: initRate,
  planList,
}: {
  currency: string;
  currencySymbol: string;
  usdToGhsRate: number;
  planList: EditablePlan[];
}) {
  const [currency, setCurrency] = useState(initCurrency);
  const [symbol, setSymbol] = useState(initSymbol);
  const [rate, setRate] = useState(String(initRate));
  const [yearlyOpen, setYearlyOpen] = useState(false);
  const [plans, setPlans] = useState<EditablePlan[]>(() =>
    planList.map((p) => ({ ...p, features: [...new Set([...CORE_FEATURES, ...p.features])] })),
  );
  const [saving, startSave] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = (id: PlanId, changes: Partial<EditablePlan>) =>
    setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, ...changes } : p)));

  function toggle(id: PlanId, key: string) {
    if (isCore(key)) return; // core is always on
    setPlans((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const has = p.features.includes(key);
        return { ...p, features: has ? p.features.filter((f) => f !== key) : [...p.features, key] };
      }),
    );
  }

  function setFeatured(id: PlanId) {
    setPlans((prev) => prev.map((p) => ({ ...p, featured: p.id === id })));
  }

  function handleCurrency(code: string) {
    const c = CURRENCIES.find((x) => x.code === code);
    if (c) { setCurrency(c.code); setSymbol(c.symbol); }
  }

  const byId = useMemo(() => {
    const m = {} as Record<PlanId, EditablePlan>;
    for (const p of plans) m[p.id] = p;
    return m;
  }, [plans]);

  /** Warn when a cheaper plan unlocks something a dearer one doesn't. */
  const inversions = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < PLAN_IDS.length - 1; i++) {
      const lower = byId[PLAN_IDS[i]];
      const higher = byId[PLAN_IDS[i + 1]];
      if (!lower || !higher) continue;
      const missing = lower.features.filter((f) => !higher.features.includes(f) && !isCore(f));
      if (missing.length) {
        out.push(`${higher.name} is missing ${missing.length} feature${missing.length > 1 ? "s" : ""} that ${lower.name} has (${missing.slice(0, 3).map(label).join(", ")}${missing.length > 3 ? "…" : ""})`);
      }
    }
    return out;
  }, [byId]);

  function handleSave() {
    setSaved(false); setError(null);
    startSave(async () => {
      const res = await updatePlanDefinitions({
        currency, currencySymbol: symbol,
        usdToGhsRate: Number(rate) || undefined,
        plans: plans.map((p) => ({
          ...p,
          features: [...new Set([...CORE_FEATURES, ...p.features])],
        })),
      });
      if (res && !res.ok) { setError(res.error ?? "Could not save."); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    });
  }

  const cell =
    "h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-slate-100 focus:border-teal-400/60 focus:outline-none";

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100">Plans &amp; pricing</h2>
          <p className="max-w-2xl text-sm text-slate-400">
            Edit the plans in a single table. One save updates the pricing page, sign-up, billing and
            what each plan unlocks in the app.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-teal-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? (
            <><span className="whq-spin inline-block size-4 rounded-full border-2 border-white/30 border-t-white" /> Saving…</>
          ) : saved ? (
            <><Check className="size-4" /> Saved</>
          ) : (
            <><Save className="size-4" /> Save all plans</>
          )}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}
      {inversions.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-300">
            <AlertTriangle className="size-4" /> Check your feature ladder
          </div>
          <ul className="mt-1.5 space-y-1 text-xs text-amber-200/80">
            {inversions.map((w) => <li key={w}>· {w}</li>)}
          </ul>
        </div>
      )}

      {/* Currency + FX */}
      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <span className="text-slate-500">Display currency</span>
          <select
            value={currency}
            onChange={(e) => handleCurrency(e.target.value)}
            className="h-9 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-slate-100 focus:border-teal-400/60 focus:outline-none"
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code} className="bg-slate-800">
                {c.symbol} — {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span className="text-slate-500">Paystack rate</span>
          <span>1 {currency} =</span>
          <input
            type="number" min={0} step="0.01" value={rate}
            onChange={(e) => setRate(e.target.value)}
            className="h-9 w-20 rounded-lg border border-white/10 bg-white/5 px-2 text-sm text-slate-100 focus:border-teal-400/60 focus:outline-none"
          />
          <span>GHS</span>
        </div>
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={yearlyOpen} onChange={(e) => setYearlyOpen(e.target.checked)} className="accent-teal-400" />
          Show yearly prices
        </label>
      </div>

      {/* ── Plan cards ── */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((p) => {
          const unlimitedMembers = p.memberLimit < 0;
          const unlimitedSeats = p.teamUsers < 0;
          return (
            <div
              key={p.id}
              className={`relative rounded-2xl border p-4 ${
                p.featured ? "border-amber-400/40 bg-amber-400/[0.04]" : "border-white/10 bg-white/[0.03]"
              }`}
            >
              <button
                onClick={() => setFeatured(p.id)}
                title="Mark as most popular"
                className={`absolute right-3 top-3 grid size-7 place-items-center rounded-lg border transition-colors ${
                  p.featured ? "border-amber-400/50 bg-amber-400/15 text-amber-300" : "border-white/10 text-slate-500 hover:text-amber-300"
                }`}
              >
                <Star className="size-4" fill={p.featured ? "currentColor" : "none"} />
              </button>

              <FieldLabel>Name</FieldLabel>
              <input value={p.name} onChange={(e) => patch(p.id, { name: e.target.value })} className={cell} />

              <FieldLabel className="mt-3">Price ({currency} / mo)</FieldLabel>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">{symbol}</span>
                <input
                  type="number" min={0} step="0.01" value={p.monthly}
                  onChange={(e) => patch(p.id, { monthly: Number(e.target.value) || 0 })}
                  className={cell + " pl-7"}
                />
              </div>

              {yearlyOpen && (
                <>
                  <FieldLabel className="mt-3">Price ({currency} / yr)</FieldLabel>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">{symbol}</span>
                    <input
                      type="number" min={0} step="0.01" value={p.yearly}
                      onChange={(e) => patch(p.id, { yearly: Number(e.target.value) || 0 })}
                      className={cell + " pl-7"}
                    />
                  </div>
                </>
              )}

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div>
                  <FieldLabel>Max members</FieldLabel>
                  {unlimitedMembers ? (
                    <button onClick={() => patch(p.id, { memberLimit: 1000 })} className={unlimitedBtn}>
                      <InfinityIcon className="size-3.5" /> Unlimited
                    </button>
                  ) : (
                    <div className="flex items-center gap-1">
                      <input
                        type="number" min={0} value={p.memberLimit}
                        onChange={(e) => patch(p.id, { memberLimit: Number(e.target.value) || 0 })}
                        className={cell}
                      />
                      <button onClick={() => patch(p.id, { memberLimit: -1 })} title="Set unlimited" className={miniInfinity}>
                        <InfinityIcon className="size-4" />
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <FieldLabel>Max admins</FieldLabel>
                  {unlimitedSeats ? (
                    <button onClick={() => patch(p.id, { teamUsers: 15 })} className={unlimitedBtn}>
                      <InfinityIcon className="size-3.5" /> Unlimited
                    </button>
                  ) : (
                    <div className="flex items-center gap-1">
                      <input
                        type="number" min={0} value={p.teamUsers}
                        onChange={(e) => patch(p.id, { teamUsers: Number(e.target.value) || 0 })}
                        className={cell}
                      />
                      <button onClick={() => patch(p.id, { teamUsers: -1 })} title="Set unlimited" className={miniInfinity}>
                        <InfinityIcon className="size-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <FieldLabel className="mt-3">Members label (on the card)</FieldLabel>
              <input
                value={p.membersLabel} onChange={(e) => patch(p.id, { membersLabel: e.target.value })}
                className={cell} placeholder="Up to 250 members"
              />

              <FieldLabel className="mt-3">Button text</FieldLabel>
              <input value={p.cta} onChange={(e) => patch(p.id, { cta: e.target.value })} className={cell} />

              <FieldLabel className="mt-3">Tagline</FieldLabel>
              <textarea
                value={p.tagline} onChange={(e) => patch(p.id, { tagline: e.target.value })}
                rows={2}
                className="w-full resize-y rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 focus:border-teal-400/60 focus:outline-none"
              />

              <BulletEditor
                items={p.marketingFeatures}
                onChange={(items) => patch(p.id, { marketingFeatures: items })}
              />
            </div>
          );
        })}
      </div>

      {/* ── Feature matrix ── */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        <div className="border-b border-white/10 p-5">
          <h3 className="text-sm font-bold text-slate-100">Features by tier</h3>
          <p className="text-xs text-slate-500">
            Tap a cell to switch a feature on or off for that plan. Core features are always on.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="p-4 text-left font-semibold text-slate-400">Feature</th>
                {plans.map((p) => (
                  <th key={p.id} className="p-4 text-center">
                    <span className="font-bold text-slate-100">{p.name}</span>
                    {p.featured && <Star className="ml-1 inline size-3 text-amber-300" fill="currentColor" />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FEATURE_GROUPS.map((g) => (
                <FeatureGroupRows
                  key={g.label}
                  group={g}
                  plans={plans}
                  onToggle={toggle}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        Turning a feature off immediately locks that section for churches on the plan — existing data is
        never deleted. Member and admin limits are enforced across the app.
      </p>
    </div>
  );
}

/* ── matrix rows for one group ── */
function FeatureGroupRows({
  group, plans, onToggle,
}: {
  group: { label: string; keys: string[] };
  plans: EditablePlan[];
  onToggle: (id: PlanId, key: string) => void;
}) {
  return (
    <>
      <tr className="bg-white/[0.02]">
        <td colSpan={plans.length + 1} className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-teal-400/80">
          {group.label}
        </td>
      </tr>
      {group.keys.map((k) => {
        const core = isCore(k);
        return (
          <tr key={k} className="border-b border-white/[0.06] last:border-0 hover:bg-white/[0.02]">
            <td className="px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-200">{label(k)}</span>
                {core && (
                  <span className="rounded bg-slate-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-400">
                    Core
                  </span>
                )}
              </div>
              {FEATURE_DESC[k] && <div className="text-[11px] text-slate-500">{FEATURE_DESC[k]}</div>}
            </td>
            {plans.map((p) => {
              const on = core || p.features.includes(k);
              return (
                <td key={p.id} className="px-4 py-2.5 text-center">
                  <button
                    onClick={() => onToggle(p.id, k)}
                    disabled={core}
                    aria-label={`${on ? "Disable" : "Enable"} ${label(k)} on ${p.name}`}
                    className={`grid size-6 place-items-center rounded-md border transition-colors ${
                      on
                        ? core
                          ? "cursor-default border-emerald-500/40 bg-emerald-500/20 text-emerald-400/70"
                          : "border-emerald-500/50 bg-emerald-500/80 text-white hover:bg-emerald-500"
                        : "border-white/15 bg-transparent text-transparent hover:border-white/40"
                    }`}
                  >
                    <Check className="size-3.5" strokeWidth={3} />
                  </button>
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}

/* ── small pieces ── */

const unlimitedBtn =
  "flex h-10 w-full items-center justify-center gap-1 rounded-lg border border-teal-400/40 bg-teal-400/10 text-xs font-medium text-teal-300";
const miniInfinity =
  "grid h-10 w-9 shrink-0 place-items-center rounded-lg border border-white/10 text-slate-500 hover:bg-white/5 hover:text-teal-300";

function FieldLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <label className={`mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500 ${className}`}>{children}</label>;
}

function BulletEditor({ items, onChange }: { items: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...items, v]); setDraft("");
  };
  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-300"
      >
        <span>Selling points ({items.length})</span>
        <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {items.map((it, i) => (
            <div key={`${it}-${i}`} className="flex items-center gap-1.5">
              <input
                value={it}
                onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
                className="h-8 w-full rounded-md border border-white/10 bg-white/5 px-2 text-xs text-slate-100 focus:border-teal-400/60 focus:outline-none"
              />
              <button
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                className="grid size-7 shrink-0 place-items-center rounded-md border border-white/10 text-slate-500 hover:bg-red-500/10 hover:text-red-300"
              >×</button>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <input
              value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
              placeholder="Add a selling point…"
              className="h-8 w-full rounded-md border border-white/10 bg-white/5 px-2 text-xs text-slate-100 focus:border-teal-400/60 focus:outline-none"
            />
            <button onClick={add} className="grid size-7 shrink-0 place-items-center rounded-md border border-white/10 text-slate-300 hover:bg-white/5">+</button>
          </div>
        </div>
      )}
    </div>
  );
}
