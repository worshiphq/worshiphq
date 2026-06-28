"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Plus, Trash2, Pencil, Send, Download, Calendar, Settings2,
  Smartphone, CreditCard, Banknote, Users, UserPlus,
  CheckCircle2, Target, Wheat, Crown, X, Check, AlertTriangle, MessageSquare,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Input, Label } from "@/components/ui/input";
import { StatCard } from "@/components/app/stat-card";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFeedback } from "@/components/ui/feedback";
import { setHarvestDate, recordHarvestContributions, createVisitorForHarvest, deleteHarvestContribution, editHarvestContribution, deleteHarvest, saveHarvestTemplate, type HarvestEntry } from "@/app/actions/harvest";
import { formatCurrency } from "@/config/brand";
import { formatDate, cn } from "@/lib/utils";
import type { HarvestData, HarvestContributionRow } from "@/lib/data/harvest";

const methods = ["MTN MoMo", "Telecel Cash", "AirtelTigo", "Card", "Cash"] as const;
const methodIcon: Record<string, typeof Smartphone> = {
  "MTN MoMo": Smartphone, "Telecel Cash": Smartphone, AirtelTigo: Smartphone, Card: CreditCard, Cash: Banknote,
};

type LocalEntry = {
  personId: string | null;
  name: string;
  phone: string;
  type: "member" | "visitor";
  amount: string;
  method: string;
};

export function HarvestClient({
  harvest,
  contributions,
  totalRaised,
  contributorCount,
  memberCount,
  visitorCount,
  members,
  year,
  canWrite,
  harvestTemplate,
}: HarvestData & { year: number; canWrite: boolean; harvestTemplate: string | null }) {
  const [tab, setTab] = useState<"record" | "contributions" | "report">(harvest ? "contributions" : "record");
  const [selectedYear, setSelectedYear] = useState(year);
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear + 1 - i);
  const needsRefresh = selectedYear !== year;

  return (
    <div className="space-y-5">
      {/* Year selector */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
          <Calendar className="size-4 text-ink-faint" />
          <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className="bg-transparent text-sm font-medium outline-none">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        {needsRefresh && (
          <a href={`/app/harvest?year=${selectedYear}`}>
            <Button size="sm" variant="secondary">Load {selectedYear}</Button>
          </a>
        )}
        {harvest && <span className="text-sm text-ink-muted">{harvest.title} — {harvest.date ? formatDate(harvest.date) : "Date not set"}</span>}
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total raised" value={totalRaised} prefix="₵" icon={Wheat} />
        <StatCard label="Contributors" value={contributorCount} icon={Users} />
        <StatCard label="Members" value={memberCount} icon={Crown} />
        <StatCard label="Visitors" value={visitorCount} icon={UserPlus} />
      </div>

      {/* Goal progress */}
      {harvest?.goal && harvest.goal > 0 && (
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="size-5 text-primary-bright" />
              <span className="font-display text-sm font-semibold">Goal: {formatCurrency(harvest.goal)}</span>
            </div>
            <span className="text-sm font-semibold text-success">{Math.min(100, Math.round((totalRaised / harvest.goal) * 100))}%</span>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, (totalRaised / harvest.goal) * 100)}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-xs text-ink-faint">
            <span>{formatCurrency(totalRaised)} raised</span>
            <span>{formatCurrency(Math.max(0, harvest.goal - totalRaised))} remaining</span>
          </div>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
        {(canWrite ? [
          { id: "record" as const, label: harvest ? "Add contributions" : "Setup harvest", icon: harvest ? Plus : Settings2 },
          { id: "contributions" as const, label: "Contributions", icon: Users },
          { id: "report" as const, label: "Report", icon: Download },
        ] : [
          { id: "contributions" as const, label: "Contributions", icon: Users },
          { id: "report" as const, label: "Report", icon: Download },
        ]).map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn("flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
              tab === t.id ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink")}>
            <t.icon className="size-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "record" && canWrite && !harvest && <HarvestSetup year={year} />}
      {tab === "record" && canWrite && harvest && (
        <>
          <HarvestEditBar harvest={harvest} year={year} />
          <HarvestTemplateEditor template={harvestTemplate} />
          <ContributionRecorder members={members} year={year} />
        </>
      )}
      {tab === "contributions" && <ContributionsList contributions={contributions} canWrite={canWrite} />}
      {tab === "report" && <HarvestReport contributions={contributions} totalRaised={totalRaised} contributorCount={contributorCount} memberCount={memberCount} visitorCount={visitorCount} harvest={harvest} year={year} />}
    </div>
  );
}

/* ────── Harvest Setup ────── */

function HarvestSetup({ year }: { year: number }) {
  const { toast } = useFeedback();
  const handleSetup = async (fd: FormData) => {
    const res = await setHarvestDate(fd);
    if (!res.ok) toast(res.error ?? "Failed", "error");
  };
  return (
    <Card className="p-6">
      <h3 className="font-display text-lg font-semibold">Setup {year} Harvest</h3>
      <p className="mt-1 text-sm text-ink-muted">Set the harvest date and optional fundraising goal before recording contributions.</p>
      <form action={handleSetup} className="mt-5 space-y-4">
        <input type="hidden" name="year" value={year} />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="title">Harvest title</Label>
            <Input id="title" name="title" defaultValue="Annual Harvest" placeholder="Annual Harvest" />
          </div>
          <div>
            <Label htmlFor="date">Harvest date</Label>
            <Input id="date" name="date" type="date" />
          </div>
        </div>
        <div>
          <Label htmlFor="goal">Goal amount (optional)</Label>
          <Input id="goal" name="goal" type="number" min="0" step="0.01" placeholder="e.g. 50000" />
        </div>
        <SubmitButton successMessage="Harvest created">Create harvest</SubmitButton>
      </form>
    </Card>
  );
}

/* ────── Harvest Edit / Delete Bar ────── */

function HarvestEditBar({ harvest, year }: { harvest: NonNullable<HarvestData["harvest"]>; year: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const { toast } = useFeedback();

  const handleDelete = () => {
    startTransition(async () => {
      const res = await deleteHarvest(year);
      if (!res.ok) toast(res.error ?? "Failed to delete harvest", "error");
      else toast("Harvest deleted", "success");
      setConfirming(false);
      router.refresh();
    });
  };

  return (
    <Card className="flex items-center justify-between p-4">
      <div className="flex items-center gap-3">
        <Settings2 className="size-5 text-ink-faint" />
        <div>
          <h4 className="text-sm font-semibold">{harvest.title}</h4>
          <p className="text-xs text-ink-faint">
            {harvest.date ? formatDate(harvest.date) : "No date set"}
            {harvest.goal ? ` · Goal: ${formatCurrency(harvest.goal)}` : ""}
          </p>
        </div>
      </div>
      {!confirming ? (
        <Button variant="ghost" size="sm" onClick={() => setConfirming(true)} className="text-danger hover:bg-danger/10">
          <Trash2 className="size-4" /> Delete harvest
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-xs text-danger">
            <AlertTriangle className="size-3.5" /> Delete all contributions?
          </span>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
            <X className="size-4" /> Cancel
          </Button>
          <Button size="sm" onClick={handleDelete} disabled={pending} className="bg-danger text-white hover:bg-danger/90">
            {pending ? <div className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Trash2 className="size-4" />}
            Confirm
          </Button>
        </div>
      )}
    </Card>
  );
}

/* ────── Harvest Template Editor ────── */

const DEFAULT_HARVEST_TEMPLATE = "Dear {name}, thank you for your harvest contribution of GHS {amount} to {church}. God bless you abundantly!";

function HarvestTemplateEditor({ template }: { template: string | null }) {
  const [show, setShow] = useState(false);
  const [text, setText] = useState(template || DEFAULT_HARVEST_TEMPLATE);
  const [saving, startTransition] = useTransition();
  const { toast } = useFeedback();

  const handleSave = () => {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("template", text);
      const res = await saveHarvestTemplate(fd);
      if (res.ok) toast("Harvest message template saved", "success");
      else toast(res.error ?? "Failed to save", "error");
    });
  };

  return (
    <div>
      <button
        onClick={() => setShow(!show)}
        className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
      >
        <MessageSquare className="size-4" />
        {show ? "Hide" : "Edit"} harvest receipt message
      </button>
      {show && (
        <Card className="mt-3 p-4 space-y-3">
          <div>
            <Label className="text-sm font-medium">SMS receipt template</Label>
            <p className="text-xs text-ink-faint mt-0.5">
              Use {"{name}"}, {"{amount}"}, and {"{church}"} as placeholders.
            </p>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/25 resize-none"
          />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save template"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setText(DEFAULT_HARVEST_TEMPLATE)}>
              Reset to default
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ────── Contribution Recorder ────── */

function ContributionRecorder({ members, year }: { members: HarvestData["members"]; year: number }) {
  const router = useRouter();
  const [entries, setEntries] = useState<LocalEntry[]>([]);
  const [search, setSearch] = useState("");
  const [showList, setShowList] = useState(false);
  const [method, setMethod] = useState<string>("Cash");
  const [showVisitorForm, setShowVisitorForm] = useState(false);
  const [pending, startTransition] = useTransition();
  const { toast, showBusy, hideBusy } = useFeedback();

  const filtered = useMemo(() => {
    if (!search.trim()) return members.slice(0, 20);
    const q = search.toLowerCase();
    return members.filter((m) => `${m.firstName} ${m.lastName}`.toLowerCase().includes(q)).slice(0, 20);
  }, [members, search]);

  const addMember = (m: typeof members[0]) => {
    setEntries((prev) => [...prev, {
      personId: m.id,
      name: `${m.firstName} ${m.lastName}`,
      phone: m.phone ?? "",
      type: "member",
      amount: "",
      method,
    }]);
    setSearch("");
    setShowList(false);
  };

  const addVisitor = async (fd: FormData) => {
    const res = await createVisitorForHarvest(fd);
    if (res.ok && res.person) {
      setEntries((prev) => [...prev, {
        personId: res.person!.id,
        name: `${res.person!.firstName} ${res.person!.lastName}`,
        phone: res.person!.phone ?? "",
        type: "visitor",
        amount: "",
        method,
      }]);
      setShowVisitorForm(false);
      toast("Visitor added", "success");
    } else {
      toast(res.error ?? "Failed", "error");
    }
  };

  const updateAmount = (idx: number, val: string) => setEntries((prev) => prev.map((e, i) => i === idx ? { ...e, amount: val } : e));
  const updateMethod = (idx: number, val: string) => setEntries((prev) => prev.map((e, i) => i === idx ? { ...e, method: val } : e));
  const removeEntry = (idx: number) => setEntries((prev) => prev.filter((_, i) => i !== idx));

  const totalAmount = entries.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const validEntries = entries.filter((e) => Number(e.amount) > 0);

  const handleSubmit = () => {
    if (!validEntries.length) { toast("Add at least one entry with an amount", "error"); return; }
    showBusy("Recording contributions & sending receipts…");
    startTransition(async () => {
      const batch: HarvestEntry[] = validEntries.map((e) => ({
        personId: e.personId,
        donorName: e.name,
        donorPhone: e.phone,
        donorType: e.type,
        amount: Number(e.amount),
        method: e.method,
      }));
      const result = await recordHarvestContributions(year, batch);
      hideBusy();
      if (result.ok) {
        toast(`${result.recorded} recorded, ${result.smsSent} receipts sent${result.insufficientCredits ? " (credits ran out)" : ""}`, result.insufficientCredits ? "error" : "success");
        setEntries([]);
        router.refresh();
      } else {
        toast(result.error ?? "Failed", "error");
      }
    });
  };

  return (
    <Card className="p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="font-display text-lg font-semibold">Record harvest contributions</h3>
          <p className="text-sm text-ink-muted">Add church members or visitors. SMS receipts sent automatically.</p>
        </div>
        <Badge variant="outline">{entries.length} entries</Badge>
      </div>

      {/* Default method */}
      <div className="mb-4">
        <label className="mb-1.5 block text-sm font-medium text-ink-muted">Default payment method</label>
        <div className="flex flex-wrap gap-2">
          {methods.map((m) => {
            const Icon = methodIcon[m];
            return (
              <button key={m} type="button" onClick={() => setMethod(m)}
                className={cn("flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                  method === m ? "border-primary/50 bg-primary/10 text-ink" : "border-line text-ink-muted hover:bg-surface-2")}>
                <Icon className="size-3.5" /> {m}
              </button>
            );
          })}
        </div>
      </div>

      {/* Add person */}
      <div className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5">
            <Search className="size-4 text-ink-faint" />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setShowList(true); }} onFocus={() => setShowList(true)}
              placeholder="Search church member…" className="flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint" />
          </div>
          {showList && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowList(false)} />
              <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-xl border border-line bg-surface shadow-xl">
                {filtered.length === 0 ? (
                  <div className="p-4 text-center text-sm text-ink-faint">No members found</div>
                ) : filtered.map((m) => (
                  <button key={m.id} onClick={() => addMember(m)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-surface-2">
                    <Avatar name={`${m.firstName} ${m.lastName}`} src={m.photoUrl ?? undefined} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{m.firstName} {m.lastName}</div>
                      {m.phone && <div className="text-xs text-ink-faint">{m.phone}</div>}
                    </div>
                    <Plus className="size-4 text-ink-faint" />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <Button variant="secondary" onClick={() => setShowVisitorForm(!showVisitorForm)}>
          <UserPlus className="size-4" /> Visitor
        </Button>
      </div>

      {/* Visitor form */}
      {showVisitorForm && (
        <Card className="mb-4 border-primary/20 bg-primary/5 p-4">
          <h4 className="mb-3 text-sm font-semibold">Add visitor</h4>
          <form action={addVisitor} className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div><Label htmlFor="vFirstName">First name</Label><Input id="vFirstName" name="firstName" required placeholder="Kwame" /></div>
              <div><Label htmlFor="vLastName">Last name</Label><Input id="vLastName" name="lastName" required placeholder="Mensah" /></div>
              <div><Label htmlFor="vPhone">Phone</Label><Input id="vPhone" name="phone" placeholder="024XXXXXXX" /></div>
            </div>
            <div className="flex gap-2">
              <SubmitButton size="sm" pendingLabel="Adding…" successMessage="">Add visitor</SubmitButton>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowVisitorForm(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {/* Entries list */}
      {entries.length > 0 && (
        <div className="mb-4 space-y-2">
          {entries.map((entry, idx) => (
            <div key={idx} className="flex items-center gap-3 rounded-xl border border-line bg-surface-2/50 px-4 py-3">
              <Avatar name={entry.name} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{entry.name}</span>
                  <Badge variant={entry.type === "member" ? "success" : "warning"} className="text-[10px]">
                    {entry.type === "member" ? "Member" : "Visitor"}
                  </Badge>
                </div>
                {entry.phone && <div className="text-xs text-ink-faint">{entry.phone}</div>}
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink-faint">₵</span>
                  <input type="number" min="1" step="0.01" value={entry.amount} onChange={(e) => updateAmount(idx, e.target.value)} placeholder="0.00"
                    className="w-28 rounded-lg border border-line bg-surface py-2 pl-7 pr-3 text-right text-sm font-medium outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/25" />
                </div>
                <select value={entry.method} onChange={(e) => updateMethod(idx, e.target.value)} className="rounded-lg border border-line bg-surface px-2 py-2 text-xs outline-none">
                  {methods.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <button onClick={() => removeEntry(idx)} className="grid size-8 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger">
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Submit */}
      {entries.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-5 py-4">
          <div>
            <div className="text-sm text-ink-muted">{validEntries.length} valid entries</div>
            <div className="font-display text-2xl font-bold">{formatCurrency(totalAmount, { decimals: true })}</div>
          </div>
          <Button onClick={handleSubmit} disabled={pending || !validEntries.length} size="lg">
            {pending ? (<><div className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Sending…</>) : (<><Send className="size-4" /> Record & send receipts</>)}
          </Button>
        </div>
      )}

      {entries.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-line p-8 text-center">
          <Wheat className="mx-auto mb-3 size-10 text-ink-faint" />
          <p className="text-sm font-medium text-ink-muted">No entries yet</p>
          <p className="mt-1 text-xs text-ink-faint">Search members or add visitors to start recording harvest contributions</p>
        </div>
      )}
    </Card>
  );
}

/* ────── Contributions List ────── */

function ContributionsList({ contributions, canWrite }: { contributions: HarvestContributionRow[]; canWrite: boolean }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editName, setEditName] = useState("");
  const [pending, startTransition] = useTransition();
  const { toast } = useFeedback();

  const startEdit = (c: HarvestContributionRow) => {
    setEditingId(c.id);
    setEditAmount(String(c.amount));
    setEditName(c.donorName);
    setDeletingId(null);
  };

  const cancelEdit = () => { setEditingId(null); setEditAmount(""); setEditName(""); };

  const saveEdit = (id: string) => {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("amount", editAmount);
      fd.set("donorName", editName);
      const res = await editHarvestContribution(id, fd);
      if (!res.ok) toast(res.error ?? "Failed to update", "error");
      else { toast("Contribution updated", "success"); cancelEdit(); router.refresh(); }
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const res = await deleteHarvestContribution(id);
      if (!res.ok) toast(res.error ?? "Failed to delete", "error");
      else toast("Contribution deleted", "success");
      setDeletingId(null);
      router.refresh();
    });
  };

  if (contributions.length === 0) {
    return (
      <Card className="p-10 text-center">
        <Wheat className="mx-auto mb-3 size-10 text-ink-faint" />
        <p className="text-sm text-ink-muted">No contributions recorded yet.</p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line p-5">
        <h3 className="font-display text-lg font-semibold">All contributions</h3>
        <Badge variant="outline">{contributions.length} total</Badge>
      </div>
      <div className="divide-y divide-line-soft">
        {contributions.map((c) => {
          const Icon = methodIcon[c.method] ?? Banknote;
          const isEditing = editingId === c.id;
          const isDeleting = deletingId === c.id;

          if (isEditing) {
            return (
              <div key={c.id} className="flex items-center gap-3 bg-primary/5 px-5 py-3">
                <Avatar name={c.donorName} src={c.photoUrl ?? undefined} size="sm" />
                <div className="min-w-0 flex-1">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/25"
                    placeholder="Donor name"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-faint">GHS</span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      className="w-28 rounded-lg border border-line bg-surface py-1.5 pl-10 pr-3 text-right text-sm font-medium outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/25"
                    />
                  </div>
                  <button onClick={() => saveEdit(c.id)} disabled={pending}
                    className="grid size-8 place-items-center rounded-lg text-success hover:bg-success/10">
                    {pending ? <div className="size-4 animate-spin rounded-full border-2 border-success border-t-transparent" /> : <Check className="size-4" />}
                  </button>
                  <button onClick={cancelEdit}
                    className="grid size-8 place-items-center rounded-lg text-ink-faint hover:bg-surface-2">
                    <X className="size-4" />
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div key={c.id} className="flex items-center gap-3 px-5 py-3">
              <Avatar name={c.donorName} src={c.photoUrl ?? undefined} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{c.donorName}</span>
                  <Badge variant={c.donorType === "member" ? "success" : "warning"} className="text-[10px]">
                    {c.donorType === "member" ? "Member" : "Visitor"}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-ink-faint">
                  <Icon className="size-3" /> {c.method} · {formatDate(c.date)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="text-sm font-semibold text-success">{formatCurrency(c.amount, { decimals: true })}</div>
                  {c.receiptSent && <div className="flex items-center gap-1 text-xs text-success"><CheckCircle2 className="size-3" /> Sent</div>}
                </div>
                {canWrite && !isDeleting && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => startEdit(c)} title="Edit contribution"
                      className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-primary/10 hover:text-primary">
                      <Pencil className="size-3.5" />
                    </button>
                    <button onClick={() => { setDeletingId(c.id); setEditingId(null); }} title="Delete contribution"
                      className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )}
                {canWrite && isDeleting && (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-danger">Delete?</span>
                    <button onClick={() => handleDelete(c.id)} disabled={pending}
                      className="grid size-7 place-items-center rounded-lg text-danger hover:bg-danger/10">
                      {pending ? <div className="size-3.5 animate-spin rounded-full border-2 border-danger border-t-transparent" /> : <Check className="size-3.5" />}
                    </button>
                    <button onClick={() => setDeletingId(null)}
                      className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-surface-2">
                      <X className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ────── Harvest Report ────── */

function HarvestReport({
  contributions, totalRaised, contributorCount, memberCount, visitorCount, harvest, year,
}: {
  contributions: HarvestContributionRow[];
  totalRaised: number;
  contributorCount: number;
  memberCount: number;
  visitorCount: number;
  harvest: HarvestData["harvest"];
  year: number;
}) {
  const byDonor = new Map<string, { name: string; type: string; total: number; count: number }>();
  for (const c of contributions) {
    const key = c.personId ?? c.donorName;
    const existing = byDonor.get(key);
    if (existing) { existing.total += c.amount; existing.count++; }
    else byDonor.set(key, { name: c.donorName, type: c.donorType, total: c.amount, count: 1 });
  }
  const donorList = [...byDonor.values()].sort((a, b) => b.total - a.total);

  const memberTotal = contributions.filter((c) => c.donorType === "member").reduce((s, c) => s + c.amount, 0);
  const visitorTotal = contributions.filter((c) => c.donorType === "visitor").reduce((s, c) => s + c.amount, 0);

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg font-semibold">{harvest?.title ?? "Harvest"} Report — {year}</h3>
            <p className="text-sm text-ink-muted">{contributorCount} contributors · {formatCurrency(totalRaised)} raised</p>
          </div>
          <a href={`/api/export/harvest?year=${year}`}>
            <Button variant="secondary" size="sm"><Download className="size-4" /> Export CSV</Button>
          </a>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-line bg-surface-2/50 p-4 text-center">
            <div className="text-sm text-ink-muted">Total raised</div>
            <div className="mt-1 font-display text-2xl font-bold text-success">{formatCurrency(totalRaised, { decimals: true })}</div>
          </div>
          <div className="rounded-xl border border-line bg-surface-2/50 p-4 text-center">
            <div className="text-sm text-ink-muted">From members</div>
            <div className="mt-1 font-display text-2xl font-bold">{formatCurrency(memberTotal, { decimals: true })}</div>
          </div>
          <div className="rounded-xl border border-line bg-surface-2/50 p-4 text-center">
            <div className="text-sm text-ink-muted">From visitors</div>
            <div className="mt-1 font-display text-2xl font-bold">{formatCurrency(visitorTotal, { decimals: true })}</div>
          </div>
          <div className="rounded-xl border border-line bg-surface-2/50 p-4 text-center">
            <div className="text-sm text-ink-muted">{harvest?.goal ? "Goal progress" : "Avg contribution"}</div>
            <div className="mt-1 font-display text-2xl font-bold">
              {harvest?.goal ? `${Math.round((totalRaised / harvest.goal) * 100)}%` : formatCurrency(contributorCount ? Math.round(totalRaised / contributorCount) : 0)}
            </div>
          </div>
        </div>
      </Card>

      {/* Top contributors */}
      {donorList.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-line p-5">
            <h3 className="font-display text-lg font-semibold">Contributor summary</h3>
            <p className="text-sm text-ink-muted">Ranked by total contribution</p>
          </div>
          <div className="divide-y divide-line-soft">
            {donorList.map((d, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3">
                <span className="grid size-7 place-items-center rounded-full bg-surface-2 text-xs font-semibold text-ink-faint">{i + 1}</span>
                <Avatar name={d.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{d.name}</span>
                    <Badge variant={d.type === "member" ? "success" : "warning"} className="text-[10px]">
                      {d.type === "member" ? "Member" : "Visitor"}
                    </Badge>
                  </div>
                  <div className="text-xs text-ink-faint">{d.count} {d.count === 1 ? "contribution" : "contributions"}</div>
                </div>
                <div className="font-display font-semibold text-success">{formatCurrency(d.total, { decimals: true })}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
