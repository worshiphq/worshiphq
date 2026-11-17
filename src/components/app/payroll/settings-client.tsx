"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, RotateCcw, CalendarDays, Trash2, History } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useFeedback } from "@/components/ui/feedback";
import { savePayrollSettings, saveHoliday, deleteHoliday } from "@/app/actions/payroll";
import { DEFAULT_PAYROLL_RULES, RATES_BANNER, ACCOUNTANT_NOTE } from "@/lib/payroll/defaults";
import { PayeBandsEditor, type BandSetView } from "./paye-bands-editor";
import { BusyButton } from "./busy-button";
import { field, fmtDay } from "./ui";

export interface SettingsView {
  statutoryMode: string; ssnitEmployeePct: number; ssnitEmployerPct: number; tier1Pct: number; tier2Pct: number; ssnitMonthlyCap: number | null;
  workingDaysRule: string; fixedWorkingDays: number; postingMode: string; salaryCategory: string; ssnitCategory: string; payeCategory: string;
  deductionsCategory: string; loansCategory: string; defaultAccountId: string | null; employerSsnitNo: string | null; employerTin: string | null;
  makerChecker: string; portalOn: boolean; smsShowAmounts: boolean; payslipNote: string | null; staffNoPrefix: string;
  selfClockOn: boolean; remindersOn: boolean; budgetLinkOn: boolean;
  bonusTaxMode: string; bonusRatePct: number; bonusCapPct: number; overtimeTaxMode: string; overtimeLowPct: number; overtimeHighPct: number; overtimeQualifyMax: number | null;
}

function Section({ id, title, text, children }: { id?: string; title: string; text?: string; children: React.ReactNode }) {
  return (
    <Card id={id} className="p-5">
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      {text && <p className="mt-0.5 text-sm text-ink-muted">{text}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </Card>
  );
}
function Check({ name, label, hint, defaultChecked }: { name: string; label: string; hint?: string; defaultChecked: boolean }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 hover:bg-surface-2/40">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 size-4" />
      <span><span className="block text-sm font-medium">{label}</span>{hint && <span className="block text-xs text-ink-muted">{hint}</span>}</span>
    </label>
  );
}
function Pct({ name, label, value }: { name: string; label: string; value: number }) {
  return <div><Label htmlFor={`ps-${name}`}>{label}</Label><div className="relative"><Input id={`ps-${name}`} name={name} inputMode="decimal" defaultValue={String(value)} className="pr-8" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-faint">%</span></div></div>;
}

export function PayrollSettingsClient({ settings: s, accounts, bandSets, holidays, events }: {
  settings: SettingsView; accounts: { id: string; name: string }[]; bandSets: BandSetView[];
  holidays: { id: string; date: string; name: string }[]; events: { id: string; actorName: string | null; detail: string | null; at: string }[];
}) {
  const form = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [formKey, setFormKey] = useState(0);
  const [hDate, setHDate] = useState("");
  const [hName, setHName] = useState("");
  const { toast } = useFeedback();
  const router = useRouter();
  const d = DEFAULT_PAYROLL_RULES;

  const restore = () => {
    const f = form.current;
    if (!f) return;
    const set = (n: string, v: string) => { const el = f.elements.namedItem(n) as HTMLInputElement | null; if (el) el.value = v; };
    set("ssnitEmployeePct", String(d.ssnitEePct)); set("ssnitEmployerPct", String(d.ssnitErPct)); set("tier1Pct", String(d.tier1Pct)); set("tier2Pct", String(d.tier2Pct)); set("ssnitMonthlyCap", "");
    toast("Usual Ghana rates filled in. Save to keep them.", "info");
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" />
        <p>{RATES_BANNER} WorshipHQ works out pay from the rates you set here; it does not give tax advice.</p>
      </div>

      <form key={formKey} ref={form} className="space-y-5" action={(fd) => start(async () => {
        const r = await savePayrollSettings(fd);
        if (r.ok) { toast(r.message ?? "Saved", "success"); for (const w of r.warnings ?? []) toast(w, "info"); router.refresh(); } else toast(r.error, "error");
      })}>
        <Section title="Statutory deductions" text={ACCOUNTANT_NOTE}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 rounded-xl border border-line p-3 text-sm"><input type="radio" name="statutoryMode" value="ghana" defaultChecked={s.statutoryMode !== "none"} /> Ghana (SSNIT and PAYE)</label>
            <label className="flex items-center gap-2 rounded-xl border border-line p-3 text-sm"><input type="radio" name="statutoryMode" value="none" defaultChecked={s.statutoryMode === "none"} /> None (outside Ghana)</label>
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <Pct name="ssnitEmployeePct" label="SSNIT employee" value={s.ssnitEmployeePct} />
            <Pct name="ssnitEmployerPct" label="SSNIT employer" value={s.ssnitEmployerPct} />
            <Pct name="tier1Pct" label="Tier 1 (to SSNIT)" value={s.tier1Pct} />
            <Pct name="tier2Pct" label="Tier 2 (trustee)" value={s.tier2Pct} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="ps-cap">Monthly SSNIT cap (GHS, optional)</Label><Input id="ps-cap" name="ssnitMonthlyCap" inputMode="decimal" defaultValue={s.ssnitMonthlyCap ?? ""} placeholder="No cap" /><p className="mt-1 text-xs text-ink-faint">The maximum insurable earnings change every year. Leave empty for no cap.</p></div>
            <div className="flex items-end"><Button type="button" variant="ghost" onClick={restore}><RotateCcw className="size-4" /> Restore usual Ghana rates</Button></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="ps-essnit">Employer SSNIT number</Label><Input id="ps-essnit" name="employerSsnitNo" defaultValue={s.employerSsnitNo ?? ""} /></div>
            <div><Label htmlFor="ps-etin">Employer TIN</Label><Input id="ps-etin" name="employerTin" defaultValue={s.employerTin ?? ""} /></div>
          </div>
        </Section>

        <Section title="Bonus and overtime tax" text={`Ghana taxes some bonuses and overtime at special flat rates. Off by default: bonus and overtime are taxed as normal income. ${ACCOUNTANT_NOTE}`}>
          <div className="grid gap-4 sm:grid-cols-3">
            <div><Label htmlFor="ps-btm">Bonus</Label><select id="ps-btm" name="bonusTaxMode" defaultValue={s.bonusTaxMode} className={field}><option value="normal">Normal income</option><option value="ghana">Flat rate up to a share of annual basic</option></select></div>
            <Pct name="bonusRatePct" label="Bonus flat rate" value={s.bonusRatePct} />
            <Pct name="bonusCapPct" label="Up to this share of annual basic" value={s.bonusCapPct} />
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <div><Label htmlFor="ps-otm">Overtime</Label><select id="ps-otm" name="overtimeTaxMode" defaultValue={s.overtimeTaxMode} className={field}><option value="normal">Normal income</option><option value="ghana">Flat rates for junior staff</option></select></div>
            <Pct name="overtimeLowPct" label="Up to half of basic" value={s.overtimeLowPct} />
            <Pct name="overtimeHighPct" label="Above half of basic" value={s.overtimeHighPct} />
            <div><Label htmlFor="ps-otq">Qualifies if basic is at most (GHS)</Label><Input id="ps-otq" name="overtimeQualifyMax" inputMode="decimal" defaultValue={s.overtimeQualifyMax ?? ""} /></div>
          </div>
        </Section>

        <Section id="ledger" title="Books" text="Where payroll shows in Expenses and Accounting. Staff names never appear there: payroll is recorded under the payee Payroll.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="ps-acc">Default account</Label><select id="ps-acc" name="defaultAccountId" defaultValue={s.defaultAccountId ?? ""} className={field}><option value="">Choose each time</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
            <div><Label htmlFor="ps-pm">When to record SSNIT and PAYE</Label><select id="ps-pm" name="postingMode" defaultValue={s.postingMode} className={field}><option value="split">When they are paid over (recommended)</option><option value="together">Everything on pay day</option></select></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {([["salaryCategory", "Net pay category", s.salaryCategory], ["ssnitCategory", "SSNIT category", s.ssnitCategory], ["payeCategory", "PAYE category", s.payeCategory], ["deductionsCategory", "Deductions paid over", s.deductionsCategory], ["loansCategory", "Staff loans category", s.loansCategory]] as const).map(([n, l, v]) => (
              <div key={n}><Label htmlFor={`ps-${n}`}>{l}</Label><Input id={`ps-${n}`} name={n} defaultValue={v} /></div>
            ))}
          </div>
          <Check name="budgetLinkOn" label="Also record staff costs in department budgets" hint="When a department has an approved budget for the year. Its budget leaders will then see that department's total staff cost." defaultChecked={s.budgetLinkOn} />
        </Section>

        <Section title="Approval">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-start gap-2 rounded-xl border border-line p-3 text-sm"><input type="radio" name="makerChecker" value="auto" defaultChecked={s.makerChecker !== "always"} className="mt-0.5" /><span>Another person must approve when you have more than one payroll manager<span className="block text-xs text-ink-muted">A lone manager can approve, marked Self-approved.</span></span></label>
            <label className="flex items-start gap-2 rounded-xl border border-line p-3 text-sm"><input type="radio" name="makerChecker" value="always" defaultChecked={s.makerChecker === "always"} className="mt-0.5" /><span>Always need a second person</span></label>
          </div>
        </Section>

        <Section title="Working days" text="Used to work out unpaid leave.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="ps-wdr">Working days in a month</Label><select id="ps-wdr" name="workingDaysRule" defaultValue={s.workingDaysRule} className={field}><option value="weekdays">Monday to Friday, less public holidays</option><option value="fixed">A fixed number</option></select></div>
            <div><Label htmlFor="ps-fwd">Fixed number</Label><Input id="ps-fwd" name="fixedWorkingDays" inputMode="numeric" defaultValue={s.fixedWorkingDays} /></div>
          </div>
        </Section>

        <Section title="Payslips and staff">
          <div><Label htmlFor="ps-note">Payslip footer note</Label><Textarea id="ps-note" name="payslipNote" className="min-h-16" defaultValue={s.payslipNote ?? ""} placeholder="e.g. Thank you for serving with us." /></div>
          <Check name="smsShowAmounts" label="Show the amount in payslip texts" hint="Texts are kept in your SMS records, which some team members can see." defaultChecked={s.smsShowAmounts} />
          <Check name="portalOn" label="Staff portal (My pay)" hint="Staff can sign in to see their payslips and request leave." defaultChecked={s.portalOn} />
          <Check name="selfClockOn" label="Staff can clock in and out from My pay" defaultChecked={s.selfClockOn} />
          <Check name="remindersOn" label="Remind payroll managers before SSNIT and PAYE are due" defaultChecked={s.remindersOn} />
          <div className="max-w-xs"><Label htmlFor="ps-pre">Staff number prefix</Label><Input id="ps-pre" name="staffNoPrefix" defaultValue={s.staffNoPrefix} /></div>
        </Section>

        <div className="sticky bottom-3 z-10 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setFormKey((k) => k + 1)}>Undo changes</Button>
          <Button type="submit" disabled={pending} className="shadow-lg">{pending ? <><Spinner size="sm" /> Saving settings…</> : "Save settings"}</Button>
        </div>
      </form>

      <PayeBandsEditor sets={bandSets} canManage />

      <Section title="Public holidays" text="Not counted as working days or as leave days.">
        <div className="flex flex-wrap items-end gap-2">
          <div><Label htmlFor="ho-d">Date</Label><Input id="ho-d" type="date" value={hDate} onChange={(e) => setHDate(e.target.value)} /></div>
          <div className="flex-1"><Label htmlFor="ho-n">Name</Label><Input id="ho-n" value={hName} onChange={(e) => setHName(e.target.value)} placeholder="e.g. Founders' Day" /></div>
          <BusyButton pendingLabel="Adding…" run={() => saveHoliday(hDate, hName)} onDone={(r) => { if (r.ok) { setHDate(""); setHName(""); } }}><CalendarDays className="size-4" /> Add</BusyButton>
        </div>
        <ul className="divide-y divide-line-soft">
          {holidays.map((h) => (
            <li key={h.id} className="flex items-center justify-between py-2 text-sm"><span>{fmtDay(h.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })} · {h.name}</span>
              <BusyButton size="sm" variant="ghost" className="h-8 px-2" aria-label={`Remove ${h.name}`} pendingLabel="Removing…" run={() => deleteHoliday(h.id)}><Trash2 className="size-4" /></BusyButton></li>
          ))}
          {holidays.length === 0 && <li className="py-2 text-sm text-ink-muted">None added.</li>}
        </ul>
      </Section>

      <Section title="Payroll activity" text="A permanent record of who did what. Amounts and ID numbers are never written here.">
        <ul className="space-y-2 text-sm">
          {events.map((e) => <li key={e.id} className="flex items-start gap-2"><History className="mt-0.5 size-4 shrink-0 text-ink-faint" /><span>{e.detail}<span className="block text-xs text-ink-faint">{e.actorName ?? "Someone"} · {new Date(e.at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span></span></li>)}
          {events.length === 0 && <li className="text-ink-muted">Nothing yet.</li>}
        </ul>
      </Section>
    </div>
  );
}
