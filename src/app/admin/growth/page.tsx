import { Users, UserPlus, Activity, Search, MousePointerClick, Eye, TrendingUp, TrendingDown, Globe2, Megaphone } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth";
import { AdminShell, AdminCard } from "@/components/admin/admin-shell";
import { getInAppUsage } from "@/lib/data/growth";
import { getGa4Report, getSearchReport, serviceAccountEmail, type Result } from "@/lib/integrations/google-data";
import { env } from "@/lib/env";
import { GA_MEASUREMENT_ID } from "@/components/marketing/site-analytics";

export const metadata = { title: "Growth" };

const n = (v: number) => Math.round(v).toLocaleString("en-GH");
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

/** "+12%" against the period before, coloured up or down. */
function Change({ now, before }: { now: number; before: number }) {
  if (!before && !now) return null;
  if (!before) return <span className="text-[11px] text-teal-300">new</span>;
  const d = Math.round(((now - before) / before) * 100);
  const Icon = d >= 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] ${d >= 0 ? "text-teal-300" : "text-rose-300"}`}>
      <Icon className="size-3" /> {d >= 0 ? "+" : ""}{d}% vs previous
    </span>
  );
}

function Kpi({ icon: Icon, label, value, hint }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; hint?: React.ReactNode }) {
  return (
    <AdminCard className="p-4">
      <Icon className="mb-2 size-5 text-teal-400" />
      <div className="text-2xl font-bold tracking-tight">{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
      {hint && <div className="mt-0.5 text-[11px] text-slate-500">{hint}</div>}
    </AdminCard>
  );
}

/** Simple bar chart: one bar per day. */
function Bars({ data, color = "bg-teal-400" }: { data: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex h-32 items-end gap-[3px]">
      {data.map((d) => (
        <div key={d.label} className="flex h-full flex-1 flex-col justify-end" title={`${d.label}: ${n(d.value)}`}>
          <div className={`w-full rounded-t-sm ${color}`} style={{ height: `${Math.max(d.value ? 4 : 0, (d.value / max) * 100)}%` }} />
        </div>
      ))}
    </div>
  );
}

/** A ranked list with a bar behind each row. */
function Ranked({ rows, empty }: { rows: { label: string; value: number; sub?: string }[]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-slate-500">{empty}</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.label} className="relative overflow-hidden rounded-lg px-2.5 py-1.5 text-sm">
          <span className="absolute inset-y-0 left-0 rounded-lg bg-teal-400/10" style={{ width: `${(r.value / max) * 100}%` }} />
          <span className="relative flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-slate-200">{r.label}{r.sub && <span className="ml-2 text-[11px] text-slate-500">{r.sub}</span>}</span>
            <span className="shrink-0 font-medium tabular-nums">{n(r.value)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-3">
        <h2 className="text-base font-semibold text-slate-100">{title}</h2>
        {sub && <p className="text-xs text-slate-400">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

/** Shown in place of a Google section that is not connected yet, saying exactly what is missing. */
function NotReady({ result, what, accessFor }: { result: Result<unknown>; what: string; accessFor: string }) {
  if (result.ok) return null;
  const email = serviceAccountEmail();
  return (
    <AdminCard className="border-dashed p-5 text-sm text-slate-300">
      {result.reason === "not-configured" ? (
        <>The {what} numbers appear here once the Google service account{what === "website" ? " and GA4 property number are" : " is"} added to the site settings.</>
      ) : result.reason === "no-access" ? (
        <>Google refused access. In {accessFor}, add <b className="text-slate-100">{email ?? "the service account email"}</b> as a user with read access.</>
      ) : (
        <>Google returned an error: <span className="text-rose-300">{result.message}</span></>
      )}
    </AdminCard>
  );
}

export default async function AdminGrowthPage() {
  const sa = await requireSuperAdmin();
  const [usage, ga, gsc] = await Promise.all([getInAppUsage(), getGa4Report(), getSearchReport()]);
  const gaTagOn = !!(env.NEXT_PUBLIC_GA_ID ?? GA_MEASUREMENT_ID);
  const fmtDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GH", { day: "numeric", month: "short" });
  const gaDay = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;

  return (
    <AdminShell email={sa.email} isOwner={sa.role === "owner"}>
      <div className="mb-6">
        <h1 className="text-lg font-bold tracking-tight">Growth</h1>
        <p className="text-sm text-slate-400">
          Who finds WorshipHQ, how they find it, and what churches do once they are in. Website and Google numbers cover the last 28 days and refresh every few hours; WorshipHQ numbers refresh every 30 minutes.
        </p>
      </div>

      {/* ── 1. The headline ───────────────────────────────────── */}
      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Eye} label="Website visitors (28 days)" value={ga.ok ? n(ga.data.totals.users) : "-"} hint={ga.ok ? <Change now={ga.data.totals.users} before={ga.data.prevTotals.users} /> : "Not connected yet"} />
        <Kpi icon={Search} label="Google search clicks (28 days)" value={gsc.ok ? n(gsc.data.totals.clicks) : "-"} hint={gsc.ok ? `${n(gsc.data.totals.impressions)} times shown in Google` : "Not connected yet"} />
        <Kpi icon={UserPlus} label="New churches (30 days)" value={n(usage.signups.d30)} hint={<><Change now={usage.signups.d30} before={usage.signups.prev30} /> · {n(usage.signups.d7)} this week · {n(usage.signups.today)} today</>} />
        <Kpi icon={Activity} label="Churches active this week" value={n(usage.active.d7)} hint={`${n(usage.active.d1)} today · ${n(usage.active.d30)} this month · of ${n(usage.churches)}`} />
      </div>

      {/* ── 2. Sign-up funnel ─────────────────────────────────── */}
      <Section title="From visitor to paying church" sub="Website visitors are from Google Analytics (last 28 days). The rest are the churches that signed up in the last 30 days, and what they went on to do.">
        <AdminCard className="p-5">
          {(() => {
            const steps = [
              { label: "Visited the website", value: ga.ok ? ga.data.totals.users : null },
              { label: "Opened the sign-up page", value: ga.ok ? ga.data.totals.signUpViews : null },
              { label: "Created a church", value: usage.funnel.signedUp },
              { label: "Added members", value: usage.funnel.addedMembers },
              { label: "Took attendance", value: usage.funnel.tookAttendance },
              { label: "Paid for a plan", value: usage.funnel.paid },
            ];
            const top = Math.max(1, ...steps.map((s) => s.value ?? 0));
            return (
              <ol className="space-y-2">
                {steps.map((s, i) => {
                  const prev = steps.slice(0, i).reverse().find((p) => p.value != null)?.value ?? null;
                  return (
                    <li key={s.label} className="grid grid-cols-[1fr_auto] items-center gap-3 text-sm sm:grid-cols-[13rem_1fr_6rem]">
                      <span className="text-slate-300">{s.label}</span>
                      <span className="order-3 col-span-2 h-2.5 overflow-hidden rounded-full bg-white/5 sm:order-none sm:col-span-1">
                        <span className="block h-full rounded-full bg-teal-400" style={{ width: `${s.value == null ? 0 : Math.max(2, (s.value / top) * 100)}%` }} />
                      </span>
                      <span className="text-right tabular-nums">
                        {s.value == null ? <span className="text-slate-500">-</span> : <b>{n(s.value)}</b>}
                        {s.value != null && prev ? <span className="ml-1.5 text-[11px] text-slate-500">{pct(s.value, prev)}%</span> : null}
                      </span>
                    </li>
                  );
                })}
              </ol>
            );
          })()}
        </AdminCard>
      </Section>

      {/* ── 3. Website ────────────────────────────────────────── */}
      <Section title="Website" sub={gaTagOn ? "Visitors to worshiphq.app, from Google Analytics. Only the public site is measured, never church dashboards." : "Tracking is not on yet: the GA4 measurement ID still needs adding to the site settings."}>
        {ga.ok ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <AdminCard className="p-5 lg:col-span-2">
              <div className="mb-3 flex items-baseline justify-between text-sm">
                <span className="font-semibold text-slate-200">Visitors per day</span>
                <span className="text-xs text-slate-400">{n(ga.data.totals.sessions)} visits · {n(ga.data.totals.views)} page views · {n(ga.data.totals.newUsers)} first-timers</span>
              </div>
              <Bars data={ga.data.daily.map((d) => ({ label: fmtDay(gaDay(d.date)), value: d.users }))} />
            </AdminCard>
            <AdminCard className="p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200"><Megaphone className="size-4 text-teal-400" /> Where visitors came from</div>
              <Ranked rows={ga.data.sources.map((s) => ({ label: s.source === "(direct)" ? "Typed the address or a saved link" : s.source, sub: s.channel, value: s.sessions }))} empty="No visits yet." />
            </AdminCard>
            <AdminCard className="p-5">
              <div className="mb-3 text-sm font-semibold text-slate-200">Most visited pages</div>
              <Ranked rows={ga.data.pages.map((p) => ({ label: p.path, value: p.views }))} empty="No page views yet." />
            </AdminCard>
            <AdminCard className="p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200"><Globe2 className="size-4 text-teal-400" /> Where visitors are</div>
              <Ranked rows={ga.data.places.map((p) => ({ label: p.city && p.city !== "(not set)" ? `${p.city}, ${p.country}` : p.country, value: p.users }))} empty="No visitors yet." />
            </AdminCard>
            <AdminCard className="p-5">
              <div className="mb-3 text-sm font-semibold text-slate-200">Devices</div>
              <Ranked rows={ga.data.devices.map((d) => ({ label: d.device.replace(/^./, (c) => c.toUpperCase()), value: d.users }))} empty="No visitors yet." />
            </AdminCard>
          </div>
        ) : (
          <NotReady result={ga} what="website" accessFor="Google Analytics (Admin, Property access management)" />
        )}
      </Section>

      {/* ── 4. Google search ──────────────────────────────────── */}
      <Section title="Google search" sub="What people typed into Google before seeing or clicking WorshipHQ, from Search Console. Google reports this about 2 days late.">
        {gsc.ok ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <AdminCard className="p-5 lg:col-span-2">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-semibold text-slate-200">Clicks from Google per day</span>
                <span className="text-xs text-slate-400">
                  {n(gsc.data.totals.clicks)} clicks · shown {n(gsc.data.totals.impressions)} times · {(gsc.data.totals.ctr * 100).toFixed(1)}% clicked · average position {gsc.data.totals.position ? gsc.data.totals.position.toFixed(1) : "-"}
                </span>
              </div>
              <Bars data={gsc.data.daily.map((d) => ({ label: fmtDay(d.date), value: d.clicks }))} color="bg-sky-400/80" />
            </AdminCard>
            <AdminCard className="p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200"><MousePointerClick className="size-4 text-teal-400" /> What people searched</div>
              {gsc.data.queries.length ? (
                <table className="w-full text-sm">
                  <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <tr><th className="pb-2 font-medium">Search</th><th className="pb-2 text-right font-medium">Shown</th><th className="pb-2 text-right font-medium">Clicks</th><th className="pb-2 text-right font-medium">Position</th></tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {gsc.data.queries.map((q) => (
                      <tr key={q.query}>
                        <td className="max-w-[14rem] truncate py-1.5 text-slate-200">{q.query}</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-400">{n(q.impressions)}</td>
                        <td className="py-1.5 text-right tabular-nums">{n(q.clicks)}</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-400">{q.position.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="text-sm text-slate-500">No searches yet. A new site takes a few days to a few weeks to appear.</p>}
            </AdminCard>
            <AdminCard className="p-5">
              <div className="mb-3 text-sm font-semibold text-slate-200">Pages Google sends people to</div>
              <Ranked rows={gsc.data.pages.map((p) => ({ label: p.page, sub: `shown ${n(p.impressions)}`, value: p.clicks }))} empty="No clicks yet." />
              <div className="mb-3 mt-6 text-sm font-semibold text-slate-200">Searchers' countries</div>
              <Ranked rows={gsc.data.countries.map((c) => ({ label: c.country, sub: `shown ${n(c.impressions)}`, value: c.clicks }))} empty="No clicks yet." />
            </AdminCard>
          </div>
        ) : (
          <NotReady result={gsc} what="Google search" accessFor="Search Console (Settings, Users and permissions)" />
        )}
      </Section>

      {/* ── 5. Inside WorshipHQ ───────────────────────────────── */}
      <Section title="Inside WorshipHQ" sub="From WorshipHQ's own records. Demo and test churches are never counted.">
        <div className="grid gap-4 lg:grid-cols-2">
          <AdminCard className="p-5 lg:col-span-2">
            <div className="mb-3 flex items-baseline justify-between text-sm">
              <span className="font-semibold text-slate-200">New churches per day</span>
              <span className="text-xs text-slate-400">{n(usage.signups.d30)} in 30 days · {n(usage.churches)} in total</span>
            </div>
            <Bars data={usage.daily.map((d) => ({ label: fmtDay(d.date), value: d.signups }))} />
          </AdminCard>
          <AdminCard className="p-5">
            <div className="mb-1 text-sm font-semibold text-slate-200">How churches heard about WorshipHQ</div>
            <p className="mb-3 text-[11px] text-slate-500">Asked at sign-up. The small number is the last 30 days.</p>
            <Ranked rows={usage.heardFrom.map((h) => ({ label: h.source, sub: h.d30 ? `${n(h.d30)} this month` : undefined, value: h.all }))} empty="No answers yet." />
          </AdminCard>
          <AdminCard className="p-5">
            <div className="mb-1 text-sm font-semibold text-slate-200">Features used (last 30 days)</div>
            <p className="mb-3 text-[11px] text-slate-500">Ordered by how many churches used each one. The number is how many times.</p>
            <Ranked rows={usage.features.map((f) => ({ label: f.label, sub: `${n(f.churches)} ${f.churches === 1 ? "church" : "churches"}`, value: f.d30 }))} empty="Nothing used yet this month." />
          </AdminCard>
          <AdminCard className="p-5">
            <div className="mb-3 text-sm font-semibold text-slate-200">Plans</div>
            <Ranked rows={usage.plans.map((p) => ({ label: p.plan.replace(/^./, (c) => c.toUpperCase()), value: p.churches }))} empty="No subscriptions." />
            <div className="mb-3 mt-6 text-sm font-semibold text-slate-200">Where churches are</div>
            <Ranked rows={usage.places.map((p) => ({ label: p.place, value: p.churches }))} empty="No churches yet." />
          </AdminCard>
          <AdminCard className="p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200"><Users className="size-4 text-teal-400" /> Newest churches</div>
            <ul className="divide-y divide-white/5 text-sm">
              {usage.recent.map((c) => (
                <li key={`${c.name}-${c.createdAt}`} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-slate-200">{c.name}</span>
                    <span className="text-[11px] text-slate-500">{[c.city, c.country].filter(Boolean).join(", ")}{c.heardFrom ? ` · via ${c.heardFrom}` : ""}</span>
                  </span>
                  <span className="shrink-0 text-right text-[11px] text-slate-400">
                    {new Date(c.createdAt).toLocaleDateString("en-GH", { day: "numeric", month: "short" })}
                    <span className="block">{n(c.members)} members</span>
                  </span>
                </li>
              ))}
            </ul>
          </AdminCard>
        </div>
      </Section>
    </AdminShell>
  );
}
