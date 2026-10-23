import { Wallet, MessageSquareText, TrendingUp, Gift } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getRevenueOverview } from "@/lib/data/revenue";
import { AdminShell, AdminCard } from "@/components/admin/admin-shell";
import { RecordPlanForm, SmsCostForm } from "@/components/admin/record-plan-form";
import { SMS_RATE } from "@/config/sms";

export const metadata = { title: "Revenue" };

const money = (n: number) => `₵${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function AdminRevenuePage() {
  const sa = await requireSuperAdmin();
  const [rev, churches] = await Promise.all([
    getRevenueOverview(),
    db.church.findMany({ where: { isDemo: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const max = Math.max(1, ...rev.months.map((m) => m.subscriptions + m.sms));
  const margin = rev.sms.revenue > 0 ? Math.round((rev.sms.profit / rev.sms.revenue) * 100) : 0;
  const perCreditProfit = SMS_RATE.D - rev.costPerCredit;

  const kpis = [
    { label: "Subscriptions received", value: money(rev.subscriptions.total), hint: `${money(rev.subscriptions.thisMonth)} this month · ${rev.subscriptions.paidCount} payments`, icon: Wallet },
    { label: "SMS sales", value: money(rev.sms.revenue), hint: `${money(rev.sms.thisMonth)} this month · ${rev.sms.creditsSold.toLocaleString()} credits sold`, icon: MessageSquareText },
    { label: "SMS profit", value: money(rev.sms.profit), hint: `${margin}% margin at ${money(rev.costPerCredit)} per credit cost`, icon: TrendingUp },
    { label: "Given away", value: `${rev.subscriptions.grantedCount} plans`, hint: `${money(rev.subscriptions.grantedValueGhs)} list value · ${rev.sms.grantedCredits.toLocaleString()} free credits`, icon: Gift },
  ];

  return (
    <AdminShell email={sa.email}>
      <div className="mb-6">
        <h1 className="text-lg font-bold tracking-tight">Revenue</h1>
        <p className="text-sm text-slate-400">What you earn from subscriptions and SMS, and your SMS profit against what the provider charges you.</p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <AdminCard key={k.label} className="p-4">
            <k.icon className="mb-2 size-5 text-teal-400" />
            <div className="text-2xl font-bold tracking-tight">{k.value}</div>
            <div className="text-xs text-slate-400">{k.label}</div>
            <div className="mt-0.5 text-[11px] text-slate-500">{k.hint}</div>
          </AdminCard>
        ))}
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <AdminCard className="p-5">
          <div className="mb-4 text-sm font-semibold text-slate-200">Last 12 months</div>
          <div className="flex h-44 items-end gap-2">
            {rev.months.map((m) => {
              const total = m.subscriptions + m.sms;
              return (
                <div key={m.key} className="flex flex-1 flex-col items-center gap-1.5" title={`${m.label}: subscriptions ${money(m.subscriptions)}, SMS ${money(m.sms)}`}>
                  <div className="flex w-full flex-1 flex-col-reverse items-stretch">
                    <div className="w-full rounded-b-sm bg-teal-400" style={{ height: `${(m.subscriptions / max) * 100}%` }} />
                    <div className="w-full rounded-t-md bg-sky-400/80" style={{ height: `${(m.sms / max) * 100}%` }} />
                  </div>
                  <div className="text-[10px] text-slate-500">{m.label}</div>
                  <div className="-mt-1 text-[10px] font-medium text-slate-400">{total > 0 ? Math.round(total).toLocaleString() : ""}</div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex gap-4 text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5"><i className="size-2 rounded-sm bg-teal-400" /> Subscriptions</span>
            <span className="flex items-center gap-1.5"><i className="size-2 rounded-sm bg-sky-400/80" /> SMS</span>
          </div>
        </AdminCard>

        <AdminCard className="p-5">
          <div className="mb-3 text-sm font-semibold text-slate-200">SMS profit, worked out</div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-400">Churches paid you</dt><dd className="font-medium">{money(rev.sms.revenue)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">The credits sold cost you ({rev.sms.creditsSold.toLocaleString()} x {money(rev.costPerCredit)})</dt><dd className="font-medium">- {money(rev.sms.creditsSold * rev.costPerCredit)}</dd></div>
            <div className="flex justify-between border-t border-white/10 pt-2"><dt className="font-medium text-slate-200">Profit</dt><dd className="font-bold text-teal-300">{money(rev.sms.profit)}</dd></div>
            <div className="flex justify-between text-xs"><dt className="text-slate-500">This month</dt><dd className="text-slate-300">{money(rev.sms.profitThisMonth)}</dd></div>
            <div className="flex justify-between text-xs"><dt className="text-slate-500">Standard price per credit vs cost</dt><dd className="text-slate-300">₵{SMS_RATE.D.toFixed(4)} - ₵{rev.costPerCredit.toFixed(4)} = ₵{perCreditProfit.toFixed(4)}</dd></div>
            <div className="flex justify-between text-xs"><dt className="text-slate-500">Credits churches have actually sent</dt><dd className="text-slate-300">{rev.sms.creditsUsed.toLocaleString()} (cost {money(rev.sms.costOfSent)})</dd></div>
          </dl>
          {rev.sms.estimatedTopups > 0 && (
            <p className="mt-3 text-[11px] text-slate-500">{rev.sms.estimatedTopups} older top-up{rev.sms.estimatedTopups === 1 ? "" : "s"} did not record the amount paid, so they are priced at the standard rate.</p>
          )}
          <div className="mt-4 border-t border-white/10 pt-4"><SmsCostForm initial={rev.costPerCredit} /></div>
        </AdminCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminCard className="p-5">
          <div className="mb-1 text-sm font-semibold text-slate-200">Give a church a plan, or record a payment you received</div>
          <p className="mb-4 text-xs text-slate-400">For a church that paid you directly, or one you are giving a plan to. Choose any length, up to 10 years. It appears in the church&apos;s billing history.</p>
          <RecordPlanForm churches={churches} />
        </AdminCard>

        <AdminCard className="p-5">
          <div className="mb-3 text-sm font-semibold text-slate-200">Latest money in</div>
          {rev.recent.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing yet.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {rev.recent.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate text-slate-200">{r.church}</div>
                    <div className="truncate text-xs text-slate-500">
                      {r.kind} · <span className="capitalize">{r.label}</span> · {new Date(r.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-medium text-slate-100">{r.source === "granted" ? "Gift" : money(r.amountGhs)}</div>
                    <div className="text-[11px] text-slate-500">{r.source === "offline" ? "paid directly" : r.source === "granted" ? "free" : r.source === "estimated" ? "estimated" : "Paystack"}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </AdminCard>
      </div>
    </AdminShell>
  );
}
