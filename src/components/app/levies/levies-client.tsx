"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, FileText, GitBranch, LayoutDashboard, ListChecks, Rows3, Settings2, Sparkles, Wallet } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import type { RuleDraft } from "@/app/actions/levies";
import type { LeviesPageData, RecordView, RuleView } from "@/lib/levies/view-types";
import { cn } from "@/lib/utils";
import { OverviewView } from "./overview";
import { RecordsView } from "./records";
import { RulesView } from "./rules";
import { SettingsView } from "./settings";
import { BranchesView } from "./branches";
import { RecordSheet } from "./record-sheet";
import { PaymentDialog } from "./payment-dialog";
import { StatementDialog } from "./statement-dialog";
import { RuleWizard, draftFromRule, emptyDraft } from "./rule-wizard";
import { TemplatePicker } from "./template-picker";
import { ghs } from "./shared";

export type LevyTab = "overview" | "records" | "rules" | "branches" | "settings";

export function LeviesClient({ data, initialTab, canPublishSchedule }: { data: LeviesPageData; initialTab: LevyTab; canPublishSchedule: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [navPending, startNav] = useTransition();
  const showBranches = data.isParent;
  const [tab, setTab] = useState<LevyTab>(initialTab === "branches" && !showBranches ? "overview" : initialTab);
  const [focusMonth, setFocusMonth] = useState<string | null>(null);
  const [openRec, setOpenRec] = useState<string | null>(null);
  const [pay, setPay] = useState<{ key: number; recs: RecordView[] } | null>(null);
  const [wizard, setWizard] = useState<{ key: number; draft: RuleDraft; editing: RuleView | null } | null>(null);
  const [templates, setTemplates] = useState<"template" | "parent" | null>(null);
  const [statement, setStatement] = useState(false);

  const owing = data.records.filter((r) => r.left > 0 && r.status !== "counting").sort((a, b) => (a.startYmd < b.startYmd ? -1 : 1));
  const goYear = (y: number) => startNav(() => router.replace(`${pathname}?y=${y}&tab=${tab}`, { scroll: false }));
  const switchTab = (t: LevyTab) => { setTab(t); if (t !== "records") setFocusMonth(null); window.history.replaceState(null, "", `${pathname}?y=${data.year}&tab=${t}`); };
  const record = openRec ? data.records.find((r) => r.id === openRec) ?? null : null;
  const thisYear = Number(data.todayYmd.slice(0, 4));

  const tabs: { id: LevyTab; label: string; icon: typeof Rows3 }[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "records", label: "Records", icon: Rows3 },
    { id: "rules", label: "Rules", icon: ListChecks },
    ...(showBranches ? [{ id: "branches" as const, label: "Branches", icon: GitBranch }] : []),
    { id: "settings", label: "Settings", icon: Settings2 },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Levies</h1>
          <p className="mt-1.5 max-w-xl text-sm text-ink-muted">What your church sends to head office, the district and others: worked out from your giving, explained line by line, and tracked until it is paid.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1">
            <button type="button" onClick={() => goYear(data.year - 1)} className="grid size-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-2" aria-label="Previous year"><ChevronLeft className="size-4" /></button>
            <span className="flex min-w-14 items-center justify-center gap-1.5 text-sm font-semibold tabular-nums">{navPending && <Spinner size="sm" />}{data.year}</span>
            <button type="button" onClick={() => goYear(data.year + 1)} disabled={data.year >= thisYear} className="grid size-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-2 disabled:opacity-40" aria-label="Next year"><ChevronRight className="size-4" /></button>
          </div>
          <button type="button" onClick={() => setStatement(true)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-elevated px-3.5 text-sm font-semibold hover:bg-surface-2"><FileText className="size-4" /> Statement</button>
          {data.access.manage && (
            <button type="button" disabled={!owing.length} onClick={() => setPay({ key: Date.now(), recs: owing })} title={owing.length ? `${ghs(owing.reduce((t, r) => t + r.left, 0))} owing` : "Nothing owing"}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50"><Wallet className="size-4" /> Record payment</button>
          )}
        </div>
      </div>

      {data.parent && data.parent.schedule.length > 0 && data.access.manage && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/25 bg-primary/5 p-3.5 text-sm">
          <Sparkles className="size-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1"><b>{data.parent.name}</b> suggests {data.parent.schedule.length} lev{data.parent.schedule.length === 1 ? "y" : "ies"}. Review and add the ones you pay.{!data.parent.shares && " Switch on sharing levies in Settings, Linked churches, so they can see what you have paid."}</span>
          <button type="button" onClick={() => setTemplates("parent")} className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white">Review and add</button>
        </div>
      )}

      {/* Tabs */}
      <div className="-mx-1 overflow-x-auto px-1">
        <div className="inline-flex min-w-full gap-1 rounded-xl bg-surface-2 p-1 sm:min-w-0">
          {tabs.map((t) => (
            <button key={t.id} type="button" onClick={() => switchTab(t.id)} className={cn("flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors", tab === t.id ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink")}>
              <t.icon className="size-4" /> {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className={cn("transition-opacity", navPending && "opacity-60")}>
        {tab === "overview" && (
          <OverviewView data={data} onTemplates={() => setTemplates("template")} onAdd={() => setWizard({ key: Date.now(), draft: emptyDraft(data.todayYmd), editing: null })}
            onPay={(recs) => setPay({ key: Date.now(), recs })} onJump={(m) => { setFocusMonth(m); switchTab("records"); setFocusMonth(m); }} />
        )}
        {tab === "records" && <RecordsView data={data} focusMonth={focusMonth} onOpen={(r) => setOpenRec(r.id)} onPay={(recs) => setPay({ key: Date.now(), recs })} />}
        {tab === "rules" && (
          <RulesView data={data} onTemplates={() => setTemplates("template")} onAdd={() => setWizard({ key: Date.now(), draft: emptyDraft(data.todayYmd), editing: null })}
            onEdit={(r) => setWizard({ key: Date.now(), draft: draftFromRule(r, data.todayYmd), editing: r })} />
        )}
        {tab === "branches" && showBranches && <BranchesView data={data} canPublish={canPublishSchedule} />}
        {tab === "settings" && <SettingsView data={data} />}
      </div>

      {record && (
        <RecordSheet rec={record} rule={data.rules.find((r) => r.id === record.ruleId)} changes={data.changes} access={data.access}
          onClose={() => setOpenRec(null)} onPay={() => { setPay({ key: Date.now(), recs: [record] }); setOpenRec(null); }} />
      )}
      {pay && <PaymentDialog key={pay.key} open onClose={() => setPay(null)} records={pay.recs} accounts={data.accounts} todayYmd={data.todayYmd} r2Ready={data.r2Ready} />}
      {wizard && (
        <RuleWizard key={wizard.key} open onClose={() => setWizard(null)} initial={wizard.draft} editing={wizard.editing} streams={data.streams} rules={data.rules}
          parentName={data.parent?.name ?? null} todayYmd={data.todayYmd} />
      )}
      {templates && <TemplatePicker open onClose={() => setTemplates(null)} streams={data.streams} todayYmd={data.todayYmd} parent={templates === "parent" ? data.parent : null} />}
      {statement && <StatementDialog open onClose={() => setStatement(false)} year={data.year} todayYmd={data.todayYmd} payees={[...new Set(data.rules.map((r) => r.payee))]} />}
    </div>
  );
}
