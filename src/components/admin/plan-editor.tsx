"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Save, Check, DollarSign, Star, Plus, X, Infinity as InfinityIcon,
  ChevronDown, ChevronRight, AlertTriangle,
} from "lucide-react";
import { updatePlanDefinitions } from "@/app/actions/admin";
import { ALL_FEATURES, FEATURE_LABELS, PLAN_IDS, type PlanId } from "@/lib/plan-gate";
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

/** Feature keys grouped for the checkbox grid. Anything not listed lands in "Other". */
const FEATURE_GROUPS: { label: string; keys: string[] }[] = [
  { label: "Core", keys: ["dashboard", "people", "attendance", "events", "giving", "reports", "directory", "calendar", "birthdays", "departments", "leaders", "notices", "groups", "households", "visitors", "prayer-requests", "children-forms", "teens-forms"] },
  { label: "Growth", keys: ["sms", "reminders", "form-builder", "import-export", "member-ids", "qr-codes", "custom-roles", "harvest", "pledges", "recurring-giving", "auto-receipts", "data-migration", "follow-ups", "sermons", "devotionals", "testimonies"] },
  { label: "Advanced", keys: ["automations", "volunteers", "rosters", "volunteer-scheduling", "engagement-scoring", "advanced-reports", "welfare", "counseling", "auto-inactive", "bookings"] },
  { label: "Finance & scale", keys: ["accounting", "budgets", "expenses", "fund-accounting", "assets", "api-access", "audit-log"] },
];

const label = (k: string) => FEATURE_LABELS[k] ?? k;

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
  const [plans, setPlans] = useState<EditablePlan[]>(() => planList.map((p) => ({ ...p })));
  const [open, setOpen] = useState<PlanId | null>("starter");
  const [saving, startSave] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = (id: PlanId, changes: Partial<EditablePlan>) =>
    setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, ...changes } : p)));

  function toggleFeature(id: PlanId, key: string) {
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

  /** Warn when a cheaper plan unlocks something a dearer one doesn't. */
  const inversions = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < PLAN_IDS.length - 1; i++) {
      const lower = plans.find((p) => p.id === PLAN_IDS[i]);
      const higher = plans.find((p) => p.id === PLAN_IDS[i + 1]);
      if (!lower || !higher) continue;
      const missing = lower.features.filter((f) => !higher.features.includes(f));
      if (missing.length) {
        out.push(`${higher.name} is missing ${missing.length} feature${missing.length > 1 ? "s" : ""} that ${lower.name} has (${missing.slice(0, 3).map(label).join(", ")}${missing.length > 3 ? "…" : ""})`);
      }
    }
    return out;
  }, [plans]);

  function handleSave() {
    setSaved(false); setError(null);
    startSave(async () => {
      const res = await updatePlanDefinitions({
        currency, currencySymbol: symbol,
        usdToGhsRate: Number(rate) || undefined,
        plans: plans.map((p) => ({ ...p })),
      });
      if (res && !res.ok) { setError(res.error ?? "Could not save."); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    });
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100">Plans &amp; pricing</h2>
          <p className="max-w-2xl text-sm text-slate-400">
            One save updates the pricing page, sign-up, billing and what each plan actually unlocks
            inside the app.
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
      <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-center gap-3">
          <DollarSign className="size-5 text-teal-400" />
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Currency &amp; billing</h3>
            <p className="text-xs text-slate-500">Prices display in this currency; Paystack charges the cedi equivalent.</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select
            value={currency}
            onChange={(e) => handleCurrency(e.target.value)}
            className="h-10 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-slate-100 focus:border-teal-400/60 focus:outline-none"
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code} className="bg-slate-800">
                {c.symbol} — {c.name} ({c.code})
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span>1 {currency} =</span>
            <input
              type="number" min={0} step="0.01" value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="h-10 w-24 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-slate-100 focus:border-teal-400/60 focus:outline-none"
            />
            <span>GHS at checkout</span>
          </div>
        </div>
      </div>

      {/* Plans */}
      <div className="space-y-3">
        {plans.map((p) => {
          const isOpen = open === p.id;
          const unlimitedMembers = p.memberLimit < 0;
          const unlimitedSeats = p.teamUsers < 0;
          return (
            <div key={p.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
              {/* Summary row */}
              <div className="flex flex-wrap items-center gap-3 p-4">
                <button
                  onClick={() => setOpen(isOpen ? null : p.id)}
                  className="flex flex-1 items-center gap-3 text-left"
                >
                  {isOpen ? <ChevronDown className="size-4 text-slate-500" /> : <ChevronRight className="size-4 text-slate-500" />}
                  <span className="font-semibold text-slate-100">{p.name}</span>
                  {p.featured && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                      <Star className="size-3" /> Most popular
                    </span>
                  )}
                  <span className="text-xs text-slate-500">
                    {p.features.length} features · {unlimitedMembers ? "unlimited" : p.memberLimit} members
                  </span>
                </button>

                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-500">{symbol}</label>
                  <input
                    type="number" min={0} step="0.01" value={p.monthly}
                    onChange={(e) => patch(p.id, { monthly: Number(e.target.value) || 0 })}
                    className="h-9 w-24 rounded-lg border border-white/10 bg-white/5 px-2 text-sm text-slate-100 focus:border-teal-400/60 focus:outline-none"
                  />
                  <span className="text-xs text-slate-500">/mo</span>
                  <input
                    type="number" min={0} step="0.01" value={p.yearly}
                    onChange={(e) => patch(p.id, { yearly: Number(e.target.value) || 0 })}
                    className="h-9 w-24 rounded-lg border border-white/10 bg-white/5 px-2 text-sm text-slate-100 focus:border-teal-400/60 focus:outline-none"
                  />
                  <span className="text-xs text-slate-500">/yr</span>
                </div>
              </div>

              {isOpen && (
                <div className="space-y-5 border-t border-white/10 p-5">
                  {/* Copy + limits */}
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Plan name">
                      <input value={p.name} onChange={(e) => patch(p.id, { name: e.target.value })} className={inputCls} />
                    </Field>
                    <Field label="Tagline">
                      <input value={p.tagline} onChange={(e) => patch(p.id, { tagline: e.target.value })} className={inputCls} />
                    </Field>
                    <Field label="Members label (shown on the card)">
                      <input value={p.membersLabel} onChange={(e) => patch(p.id, { membersLabel: e.target.value })} className={inputCls} placeholder="Up to 250 members" />
                    </Field>
                    <Field label="Button text">
                      <input value={p.cta} onChange={(e) => patch(p.id, { cta: e.target.value })} className={inputCls} />
                    </Field>
                    <Field label="Member limit (enforced)">
                      <div className="flex items-center gap-2">
                        <input
                          type="number" min={0} disabled={unlimitedMembers}
                          value={unlimitedMembers ? "" : p.memberLimit}
                          onChange={(e) => patch(p.id, { memberLimit: Number(e.target.value) || 0 })}
                          className={inputCls + " disabled:opacity-40"}
                        />
                        <Toggle
                          on={unlimitedMembers}
                          onClick={() => patch(p.id, { memberLimit: unlimitedMembers ? 1000 : -1 })}
                          label="Unlimited"
                        />
                      </div>
                    </Field>
                    <Field label="Team seats (enforced)">
                      <div className="flex items-center gap-2">
                        <input
                          type="number" min={0} disabled={unlimitedSeats}
                          value={unlimitedSeats ? "" : p.teamUsers}
                          onChange={(e) => patch(p.id, { teamUsers: Number(e.target.value) || 0 })}
                          className={inputCls + " disabled:opacity-40"}
                        />
                        <Toggle
                          on={unlimitedSeats}
                          onClick={() => patch(p.id, { teamUsers: unlimitedSeats ? 15 : -1 })}
                          label="Unlimited"
                        />
                      </div>
                    </Field>
                  </div>

                  <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-slate-300">
                    <input
                      type="radio" name="featured" checked={p.featured}
                      onChange={() => setFeatured(p.id)}
                      className="accent-amber-400"
                    />
                    Highlight this plan as “Most popular”
                  </label>

                  {/* Marketing bullets */}
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Selling points on the pricing card
                    </h4>
                    <BulletEditor
                      items={p.marketingFeatures}
                      onChange={(items) => patch(p.id, { marketingFeatures: items })}
                    />
                  </div>

                  {/* Feature access */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        What this plan unlocks ({p.features.length}/{ALL_FEATURES.length})
                      </h4>
                      <div className="flex gap-2">
                        <button
                          onClick={() => patch(p.id, { features: [...ALL_FEATURES] })}
                          className="rounded-lg border border-white/10 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-white/5"
                        >Select all</button>
                        <button
                          onClick={() => patch(p.id, { features: [] })}
                          className="rounded-lg border border-white/10 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-white/5"
                        >Clear</button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {FEATURE_GROUPS.map((g) => (
                        <div key={g.label}>
                          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-teal-400/80">{g.label}</div>
                          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                            {g.keys.map((k) => {
                              const on = p.features.includes(k);
                              return (
                                <label
                                  key={k}
                                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                                    on
                                      ? "border-teal-400/40 bg-teal-400/10 text-slate-100"
                                      : "border-white/10 text-slate-400 hover:bg-white/5"
                                  }`}
                                >
                                  <input
                                    type="checkbox" checked={on}
                                    onChange={() => toggleFeature(p.id, k)}
                                    className="accent-teal-400"
                                  />
                                  {label(k)}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-slate-500">
        Member and seat limits are enforced in the app. Unchecking a feature immediately locks that
        section for churches on the plan — existing data is never deleted.
      </p>
    </div>
  );
}

/* ── small pieces ── */

const inputCls =
  "h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-slate-100 focus:border-teal-400/60 focus:outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-slate-500">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button" onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-2 text-[11px] transition-colors ${
        on ? "border-teal-400/40 bg-teal-400/10 text-teal-300" : "border-white/10 text-slate-400 hover:bg-white/5"
      }`}
    >
      <InfinityIcon className="size-3" /> {label}
    </button>
  );
}

function BulletEditor({ items, onChange }: { items: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...items, v]);
    setDraft("");
  };
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={`${it}-${i}`} className="flex items-center gap-2">
          <input
            value={it}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
            className={inputCls}
          />
          <button
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/10 text-slate-500 hover:bg-red-500/10 hover:text-red-300"
            aria-label="Remove"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="Add a selling point…"
          className={inputCls}
        />
        <button
          onClick={add}
          className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/10 text-slate-300 hover:bg-white/5"
          aria-label="Add"
        >
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  );
}
