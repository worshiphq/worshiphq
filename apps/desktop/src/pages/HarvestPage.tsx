import { useEffect, useState, useMemo } from "react";
import {
  Plus, Loader2, Wheat, Trash2, Pencil, Search, Calendar, Download, Users,
  UserPlus, Target, Send, Smartphone, CreditCard, Banknote, CheckCircle2,
  Check, X, Settings2, MessageSquare, ChevronLeft, Crown,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Avatar } from "../components/ui/Avatar";
import { Modal } from "../components/ui/Modal";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatCurrency, formatDate, cn, safeNum } from "../lib/utils";
import { v4 as uuid } from "uuid";

const METHODS = ["Cash", "MTN_MoMo", "Telecel_Cash", "AirtelTigo", "Card"];
const methodIcons: Record<string, any> = { Cash: Banknote, MTN_MoMo: Smartphone, Telecel_Cash: Smartphone, AirtelTigo: Smartphone, Card: CreditCard };
const methodLabel = (m: string) => (m || "Cash").replace(/_/g, " ");
const DEFAULT_HARVEST_TEMPLATE = "Dear {name}, thank you for your harvest contribution of GHS {amount} to {church}. God bless you abundantly!";

export function HarvestPage() {
  const { session, showToast, syncVersion } = useAppStore();
  const [harvests, setHarvests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [yearFilter, setYearFilter] = useState("");

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  async function loadData() {
    setLoading(true);
    const rows = await db.rawQuery("SELECT * FROM harvest WHERE church_id = ? ORDER BY year DESC, date DESC", [session!.churchId]);
    setHarvests(rows);
    setLoading(false);
  }

  const harvestYears = useMemo(() => [...new Set(harvests.map((h) => String(h.year || new Date(h.date || "").getFullYear())).filter((y) => y && y !== "NaN"))].sort().reverse(), [harvests]);

  const displayHarvests = useMemo(() => {
    if (!yearFilter) return harvests;
    return harvests.filter((h) => String(h.year || new Date(h.date || "").getFullYear()) === yearFilter);
  }, [harvests, yearFilter]);

  const stats = useMemo(() => ({
    count: displayHarvests.length,
    totalGoal: displayHarvests.reduce((s, h) => s + (h.goal || 0), 0),
    totalRaised: displayHarvests.reduce((s, h) => s + (h.raised || 0), 0),
  }), [displayHarvests]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this harvest and all its contributions?")) return;
    const contribs = await db.rawQuery("SELECT id FROM harvest_contribution WHERE harvest_id = ?", [id]);
    for (const c of contribs) {
      await db.delete("harvest_contribution", c.id);
    }
    setHarvests((prev) => prev.filter((h) => h.id !== id));
    showToast("Deleted");
    await db.delete("harvest", id);
  }

  const openHarvest = harvests.find((h) => h.id === openId);
  if (openHarvest) {
    return <HarvestDetail harvest={openHarvest} churchId={session!.churchId} onBack={() => { setOpenId(null); loadData(); }} onChanged={loadData} />;
  }

  return (
    <PageShell title="Harvest">
      <PageHeader title="Harvest" description="Track annual harvest campaigns, contributions, and reports.">
        {harvestYears.length > 1 && (
          <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className="input h-9 w-32 text-sm">
            <option value="">All Years</option>
            {harvestYears.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        )}
        <button onClick={() => setShowForm(true)} className="btn-primary btn-sm"><Plus className="size-3.5" /> New Harvest</button>
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Harvests" value={stats.count} icon={Wheat} color="text-primary-bright" />
        <StatCard label="Total Goal" value={formatCurrency(stats.totalGoal)} icon={Target} color="text-gold" />
        <StatCard label="Total Raised" value={formatCurrency(stats.totalRaised)} icon={Wheat} color="text-success" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>
      ) : displayHarvests.length === 0 ? (
        <div className="py-16 text-center">
          <Wheat className="mx-auto size-10 text-ink-faint/30" />
          <p className="mt-3 text-sm font-medium text-ink">No harvest campaigns yet</p>
          <button onClick={() => setShowForm(true)} className="btn-primary btn-sm mt-4"><Plus className="size-3.5" /> New Harvest</button>
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-2">
          {displayHarvests.map((h) => {
            const pct = h.goal > 0 ? Math.round(((h.raised || 0) / h.goal) * 100) : 0;
            return (
              <div key={h.id} className="card p-4">
                <div className="flex items-start justify-between">
                  <button onClick={() => setOpenId(h.id)} className="text-left">
                    <h3 className="font-bold text-ink hover:text-primary-bright">{h.title}</h3>
                    <p className="text-xs text-ink-faint">{h.year}{h.date ? ` · ${formatDate(h.date)}` : ""}</p>
                  </button>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditing(h); setShowForm(true); }} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-primary-soft hover:text-primary-bright" title="Edit"><Pencil className="size-3.5" /></button>
                    <button onClick={() => handleDelete(h.id)} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger"><Trash2 className="size-3.5" /></button>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-success font-bold">{formatCurrency(h.raised || 0)}</span>
                  <span className="text-ink-faint">of {formatCurrency(h.goal)}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-3">
                  <div className={cn("h-full rounded-full transition-all", pct >= 100 ? "bg-success" : "bg-gradient-to-r from-gold to-gold/70")} style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <button onClick={() => setOpenId(h.id)} className="text-[11px] font-medium text-primary-bright hover:underline">Manage contributions →</button>
                  <p className="text-[11px] text-ink-faint">{pct}% of goal</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={showForm} onClose={() => { setShowForm(false); setEditing(null); }} title={editing ? "Edit Harvest" : "New Harvest"}>
        <HarvestForm churchId={session!.churchId} existing={editing} onClose={() => { setShowForm(false); setEditing(null); }} onSaved={() => { setShowForm(false); setEditing(null); loadData(); }} />
      </Modal>
    </PageShell>
  );
}

function HarvestForm({ churchId, existing, onClose, onSaved }: { churchId: string; existing?: any; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: existing?.title || "Annual Harvest", year: existing?.year != null ? String(existing.year) : String(new Date().getFullYear()),
    goal: existing?.goal != null ? String(existing.goal) : "", date: existing?.date || "",
  });
  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const data = { title: form.title.trim(), year: Number(form.year), goal: Number(form.goal) || null, date: form.date || null };
    if (existing) { await db.update("harvest", existing.id, data); showToast("Harvest updated"); }
    else { await db.insert("harvest", { id: uuid(), church_id: churchId, ...data, raised: 0 }); showToast("Harvest created"); }
    setSaving(false); onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Title *</label><input value={form.title} onChange={set("title")} className="input" required placeholder="e.g. Annual Harvest" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Year</label><input type="number" value={form.year} onChange={set("year")} className="input" /></div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Goal (GHS)</label><input type="number" step="0.01" value={form.goal} onChange={set("goal")} className="input" /></div>
      </div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Date</label><input type="date" value={form.date} onChange={set("date")} className="input" /></div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving && <Loader2 className="size-4 whq-spin" />}{saving ? "Saving..." : existing ? "Update" : "Create"}</button>
      </div>
    </form>
  );
}

/* ─────────────── Harvest detail (contributions) ─────────────── */

function HarvestDetail({ harvest, churchId, onBack, onChanged }: { harvest: any; churchId: string; onBack: () => void; onChanged: () => void }) {
  const { showToast, syncVersion } = useAppStore();
  const [tab, setTab] = useState<"record" | "contributions" | "report">("contributions");
  const [contributions, setContributions] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [church, setChurch] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [harvest.id, syncVersion]);

  async function load() {
    setLoading(true);
    const [c, m, ch] = await Promise.all([
      db.rawQuery("SELECT c.*, p.photo_url FROM harvest_contribution c LEFT JOIN person p ON c.person_id = p.id WHERE c.harvest_id = ? ORDER BY c.date DESC", [harvest.id]),
      db.rawQuery("SELECT id, first_name, last_name, phone, photo_url FROM person WHERE church_id = ? AND status IN ('active','visitor') ORDER BY first_name", [churchId]),
      db.getById("church", churchId),
    ]);
    setContributions(c); setMembers(m); setChurch(ch); setLoading(false);
  }

  const totalRaised = contributions.reduce((s, c) => s + (safeNum(c.amount)), 0);
  const memberCount = contributions.filter((c) => c.donor_type === "member").length;
  const visitorCount = contributions.filter((c) => c.donor_type === "visitor").length;
  const contributorCount = new Set(contributions.map((c) => c.person_id ?? c.donor_name)).size;

  /** Keep harvest.raised in sync after each mutation. */
  async function syncRaised() {
    const rows = await db.rawQuery("SELECT COALESCE(SUM(amount),0) AS total FROM harvest_contribution WHERE harvest_id = ?", [harvest.id]);
    await db.update("harvest", harvest.id, { raised: rows[0]?.total || 0 });
    onChanged();
  }

  return (
    <PageShell title="Harvest">
      <button onClick={onBack} className="mb-3 flex items-center gap-1 text-sm text-ink-muted hover:text-ink"><ChevronLeft className="size-4" /> All harvests</button>
      <PageHeader title={harvest.title} description={`${harvest.year}${harvest.date ? ` · ${formatDate(harvest.date)}` : ""}`} />

      <div className="mb-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total raised" value={formatCurrency(totalRaised)} icon={Wheat} color="text-success" />
        <StatCard label="Contributors" value={contributorCount} icon={Users} color="text-primary-bright" />
        <StatCard label="Members" value={memberCount} icon={Crown} color="text-gold" />
        <StatCard label="Visitors" value={visitorCount} icon={UserPlus} color="text-info" />
      </div>

      {harvest.goal > 0 && (
        <div className="card mb-5 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><Target className="size-5 text-primary-bright" /><span className="text-sm font-bold text-ink">Goal: {formatCurrency(harvest.goal)}</span></div>
            <span className="text-sm font-semibold text-success">{Math.min(100, Math.round((totalRaised / harvest.goal) * 100))}%</span>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-primary-bright transition-all" style={{ width: `${Math.min(100, (totalRaised / harvest.goal) * 100)}%` }} /></div>
          <div className="mt-1 flex justify-between text-xs text-ink-faint"><span>{formatCurrency(totalRaised)} raised</span><span>{formatCurrency(Math.max(0, harvest.goal - totalRaised))} remaining</span></div>
        </div>
      )}

      <div className="mb-5 flex gap-1 rounded-xl bg-surface-2 p-1">
        {[
          { id: "record" as const, label: "Add contributions", icon: Plus },
          { id: "contributions" as const, label: "Contributions", icon: Users },
          { id: "report" as const, label: "Report", icon: Download },
        ].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn("flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors", tab === t.id ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink")}>
            <t.icon className="size-4" /> {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>
      ) : tab === "record" ? (
        <>
          <HarvestTemplateEditor church={church} churchId={churchId} />
          <ContributionRecorder harvest={harvest} churchId={churchId} members={members} onRecorded={async () => { await syncRaised(); await load(); }} onMemberAdded={load} />
        </>
      ) : tab === "contributions" ? (
        <ContributionsList contributions={contributions} onChanged={async () => { await syncRaised(); await load(); }} />
      ) : (
        <HarvestReport contributions={contributions} totalRaised={totalRaised} contributorCount={contributorCount} memberCount={memberCount} visitorCount={visitorCount} harvest={harvest} />
      )}
    </PageShell>
  );
}

function HarvestTemplateEditor({ church, churchId }: { church: any; churchId: string }) {
  const { showToast } = useAppStore();
  const [show, setShow] = useState(false);
  const [text, setText] = useState(church?.harvest_receipt_template || DEFAULT_HARVEST_TEMPLATE);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await db.update("church", churchId, { harvest_receipt_template: text });
    setSaving(false); showToast("Harvest message template saved"); setShow(false);
  }

  return (
    <div className="mb-4">
      <button onClick={() => setShow(!show)} className="flex items-center gap-2 text-sm font-medium text-primary-bright hover:underline"><MessageSquare className="size-4" /> {show ? "Hide" : "Edit"} harvest receipt message</button>
      {show && (
        <div className="card mt-3 p-4 space-y-3">
          <div><label className="text-sm font-medium text-ink">SMS receipt template</label><p className="text-xs text-ink-faint mt-0.5">Use {"{name}"}, {"{amount}"}, and {"{church}"} as placeholders. Sending requires online — will sync.</p></div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className="input resize-none" />
          <div className="flex items-center gap-2">
            <button onClick={save} disabled={saving} className="btn-primary btn-sm">{saving && <Loader2 className="size-4 whq-spin" />}{saving ? "Saving..." : "Save template"}</button>
            <button onClick={() => setText(DEFAULT_HARVEST_TEMPLATE)} className="btn-ghost btn-sm">Reset to default</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ContributionRecorder({ harvest, churchId, members, onRecorded, onMemberAdded }: {
  harvest: any; churchId: string; members: any[]; onRecorded: () => void; onMemberAdded: () => void;
}) {
  const { showToast } = useAppStore();
  const [entries, setEntries] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [showList, setShowList] = useState(false);
  const [method, setMethod] = useState("Cash");
  const [saving, setSaving] = useState(false);
  const [showVisitor, setShowVisitor] = useState(false);
  const [vForm, setVForm] = useState({ firstName: "", lastName: "", phone: "" });
  const [addingV, setAddingV] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return members.slice(0, 20);
    const q = search.toLowerCase();
    return members.filter((m) => `${m.first_name} ${m.last_name}`.toLowerCase().includes(q)).slice(0, 20);
  }, [members, search]);

  const addMember = (m: any) => {
    if (entries.some((e) => e.personId === m.id)) { showToast("Already added"); return; }
    setEntries((p) => [...p, { personId: m.id, name: `${m.first_name} ${m.last_name}`, phone: m.phone || "", type: "member", amount: "", method }]);
    setSearch(""); setShowList(false);
  };

  async function addVisitor(e: React.FormEvent) {
    e.preventDefault();
    if (!vForm.firstName.trim() || !vForm.lastName.trim()) { showToast("Name is required"); return; }
    setAddingV(true);
    // Try match existing person by name
    const existing = await db.rawQuery("SELECT id, phone FROM person WHERE church_id = ? AND LOWER(first_name)=LOWER(?) AND LOWER(last_name)=LOWER(?) LIMIT 1", [churchId, vForm.firstName.trim(), vForm.lastName.trim()]);
    let personId: string; let phone = vForm.phone.trim();
    if (existing.length) { personId = existing[0].id; phone = phone || existing[0].phone || ""; }
    else {
      // Generate a member id from church prefix + seq (best effort; sequence increment is a DATA-HANDLER NEED for true parity)
      const ch = await db.getById("church", churchId);
      const seq = (ch?.member_seq || 0) + 1;
      const prefix = ch?.member_prefix || (ch?.name || "MEM").slice(0, 3).toUpperCase();
      const memberId = `${prefix}-${String(seq).padStart(4, "0")}`;
      personId = uuid();
      await db.insert("person", { id: personId, church_id: churchId, member_id: memberId, first_name: vForm.firstName.trim(), last_name: vForm.lastName.trim(), phone: phone || null, status: "visitor" });
      await db.update("church", churchId, { member_seq: seq });
      onMemberAdded();
    }
    setEntries((p) => [...p, { personId, name: `${vForm.firstName.trim()} ${vForm.lastName.trim()}`, phone, type: "visitor", amount: "", method }]);
    setVForm({ firstName: "", lastName: "", phone: "" }); setShowVisitor(false); setAddingV(false);
    showToast("Visitor added");
  }

  const updateAmount = (i: number, v: string) => setEntries((p) => p.map((e, idx) => idx === i ? { ...e, amount: v } : e));
  const updateMethod = (i: number, v: string) => setEntries((p) => p.map((e, idx) => idx === i ? { ...e, method: v } : e));
  const removeEntry = (i: number) => setEntries((p) => p.filter((_, idx) => idx !== i));
  const totalAmount = entries.reduce((s, e) => s + (safeNum(e.amount)), 0);
  const validEntries = entries.filter((e) => safeNum(e.amount) > 0);

  async function handleSubmit() {
    if (!validEntries.length) { showToast("Add at least one entry with an amount"); return; }
    setSaving(true);
    for (const e of validEntries) {
      await db.insert("harvest_contribution", {
        id: uuid(), harvest_id: harvest.id, church_id: churchId, person_id: e.personId || null,
        donor_name: e.name, donor_phone: e.phone || null, donor_type: e.type, amount: safeNum(e.amount),
        method: e.method, receipt_sent: 0, date: new Date().toISOString().slice(0, 10),
      });
    }
    setSaving(false);
    showToast(`${validEntries.length} recorded. SMS receipts require online — will sync.`);
    setEntries([]); onRecorded();
  }

  return (
    <div className="card p-6">
      <div className="mb-5 flex items-center justify-between">
        <div><h3 className="text-lg font-bold text-ink">Record harvest contributions</h3><p className="text-sm text-ink-muted">Add church members or visitors.</p></div>
        <span className="badge">{entries.length} entries</span>
      </div>

      <div className="mb-4">
        <label className="mb-1.5 block text-sm font-medium text-ink-muted">Default payment method</label>
        <div className="flex flex-wrap gap-2">
          {METHODS.map((m) => { const Icon = methodIcons[m]; return (
            <button key={m} type="button" onClick={() => setMethod(m)} className={cn("flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors", method === m ? "border-primary/50 bg-primary/10 text-ink" : "border-line text-ink-muted hover:bg-surface-2")}><Icon className="size-3.5" /> {methodLabel(m)}</button>
          ); })}
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5">
            <Search className="size-4 text-ink-faint" />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setShowList(true); }} onFocus={() => setShowList(true)} placeholder="Search church member…" className="flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint" />
          </div>
          {showList && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowList(false)} />
              <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-xl border border-line bg-surface shadow-xl">
                {filtered.length === 0 ? (<div className="p-4 text-center text-sm text-ink-faint">No members found</div>) : filtered.map((m) => (
                  <button key={m.id} onClick={() => addMember(m)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-surface-2">
                    <Avatar name={`${m.first_name} ${m.last_name}`} src={m.photo_url} size="sm" />
                    <div className="min-w-0 flex-1"><div className="font-medium">{m.first_name} {m.last_name}</div>{m.phone && <div className="text-xs text-ink-faint">{m.phone}</div>}</div>
                    <Plus className="size-4 text-ink-faint" />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <button onClick={() => setShowVisitor(!showVisitor)} className="btn-secondary"><UserPlus className="size-4" /> Visitor</button>
      </div>

      {showVisitor && (
        <form onSubmit={addVisitor} className="card mb-4 border-primary/20 bg-primary/5 p-4 space-y-3">
          <h4 className="text-sm font-semibold text-ink">Add visitor</h4>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <div><label className="block text-xs font-medium text-ink-muted mb-1">First name</label><input value={vForm.firstName} onChange={(e) => setVForm((f) => ({ ...f, firstName: e.target.value }))} className="input" required placeholder="Kwame" /></div>
            <div><label className="block text-xs font-medium text-ink-muted mb-1">Last name</label><input value={vForm.lastName} onChange={(e) => setVForm((f) => ({ ...f, lastName: e.target.value }))} className="input" required placeholder="Mensah" /></div>
            <div><label className="block text-xs font-medium text-ink-muted mb-1">Phone</label><input value={vForm.phone} onChange={(e) => setVForm((f) => ({ ...f, phone: e.target.value }))} className="input" placeholder="024XXXXXXX" /></div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={addingV} className="btn-primary btn-sm">{addingV && <Loader2 className="size-4 whq-spin" />}{addingV ? "Adding..." : "Add visitor"}</button>
            <button type="button" onClick={() => setShowVisitor(false)} className="btn-ghost btn-sm">Cancel</button>
          </div>
        </form>
      )}

      {entries.length > 0 && (
        <div className="mb-4 space-y-2">
          {entries.map((entry, idx) => (
            <div key={idx} className="flex items-center gap-3 rounded-xl border border-line bg-surface-2/50 px-4 py-3">
              <Avatar name={entry.name} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><span className="text-sm font-medium">{entry.name}</span><span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", entry.type === "member" ? "bg-success/10 text-success" : "bg-gold/10 text-gold")}>{entry.type === "member" ? "Member" : "Visitor"}</span></div>
                {entry.phone && <div className="text-xs text-ink-faint">{entry.phone}</div>}
              </div>
              <div className="flex items-center gap-2">
                <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink-faint">₵</span><input type="number" min="1" step="0.01" value={entry.amount} onChange={(e) => updateAmount(idx, e.target.value)} placeholder="0.00" className="w-28 rounded-lg border border-line bg-surface py-2 pl-7 pr-3 text-right text-sm font-medium outline-none focus:border-primary/50" /></div>
                <select value={entry.method} onChange={(e) => updateMethod(idx, e.target.value)} className="rounded-lg border border-line bg-surface px-2 py-2 text-xs outline-none">{METHODS.map((m) => <option key={m} value={m}>{methodLabel(m)}</option>)}</select>
                <button onClick={() => removeEntry(idx)} className="grid size-8 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger"><Trash2 className="size-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {entries.length > 0 ? (
        <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-5 py-4">
          <div><div className="text-sm text-ink-muted">{validEntries.length} valid entries</div><div className="text-2xl font-bold text-ink">{formatCurrency(totalAmount)}</div></div>
          <button onClick={handleSubmit} disabled={saving || !validEntries.length} className="btn-primary">{saving ? <Loader2 className="size-4 whq-spin" /> : <Send className="size-4" />}{saving ? "Saving..." : "Record contributions"}</button>
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-line p-8 text-center"><Wheat className="mx-auto mb-3 size-10 text-ink-faint" /><p className="text-sm font-medium text-ink-muted">No entries yet</p><p className="mt-1 text-xs text-ink-faint">Search members or add visitors to start recording</p></div>
      )}
    </div>
  );
}

function ContributionsList({ contributions, onChanged }: { contributions: any[]; onChanged: () => void }) {
  const { showToast } = useAppStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);

  const startEdit = (c: any) => { setEditingId(c.id); setEditAmount(String(c.amount)); setEditName(c.donor_name); };
  const cancel = () => { setEditingId(null); setEditAmount(""); setEditName(""); };

  async function saveEdit(id: string) {
    setBusy(true);
    await db.update("harvest_contribution", id, { amount: Number(editAmount) || 0, donor_name: editName.trim() });
    setBusy(false); showToast("Contribution updated"); cancel(); onChanged();
  }
  async function handleDelete(id: string) {
    if (!confirm("Delete this contribution?")) return;
    setBusy(true); await db.delete("harvest_contribution", id); setBusy(false); showToast("Contribution deleted"); onChanged();
  }

  if (contributions.length === 0) {
    return <div className="card p-10 text-center"><Wheat className="mx-auto mb-3 size-10 text-ink-faint/30" /><p className="text-sm text-ink-muted">No contributions recorded yet.</p></div>;
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line p-5"><h3 className="text-lg font-bold text-ink">All contributions</h3><span className="badge">{contributions.length} total</span></div>
      <div className="divide-y divide-line-soft">
        {contributions.map((c) => {
          const Icon = methodIcons[c.method] ?? Banknote;
          if (editingId === c.id) {
            return (
              <div key={c.id} className="flex items-center gap-3 bg-primary/5 px-5 py-3">
                <Avatar name={c.donor_name} src={c.photo_url} size="sm" />
                <div className="min-w-0 flex-1"><input value={editName} onChange={(e) => setEditName(e.target.value)} className="input h-9" placeholder="Donor name" /></div>
                <div className="flex items-center gap-2">
                  <div className="relative"><span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-faint">GHS</span><input type="number" min="0.01" step="0.01" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} className="w-28 rounded-lg border border-line bg-surface py-1.5 pl-10 pr-3 text-right text-sm font-medium outline-none focus:border-primary/50" /></div>
                  <button onClick={() => saveEdit(c.id)} disabled={busy} className="grid size-8 place-items-center rounded-lg text-success hover:bg-success/10">{busy ? <Loader2 className="size-4 whq-spin" /> : <Check className="size-4" />}</button>
                  <button onClick={cancel} className="grid size-8 place-items-center rounded-lg text-ink-faint hover:bg-surface-2"><X className="size-4" /></button>
                </div>
              </div>
            );
          }
          return (
            <div key={c.id} className="flex items-center gap-3 px-5 py-3">
              <Avatar name={c.donor_name} src={c.photo_url} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><span className="text-sm font-medium">{c.donor_name}</span><span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", c.donor_type === "member" ? "bg-success/10 text-success" : "bg-gold/10 text-gold")}>{c.donor_type === "member" ? "Member" : "Visitor"}</span></div>
                <div className="flex items-center gap-1.5 text-xs text-ink-faint"><Icon className="size-3" /> {methodLabel(c.method)} · {formatDate(c.date)}</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right"><div className="text-sm font-semibold text-success">{formatCurrency(c.amount)}</div>{c.receipt_sent ? <div className="flex items-center gap-1 text-xs text-success"><CheckCircle2 className="size-3" /> Sent</div> : null}</div>
                <div className="flex items-center gap-1">
                  <button onClick={() => startEdit(c)} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-primary-soft hover:text-primary-bright" title="Edit"><Pencil className="size-3.5" /></button>
                  <button onClick={() => handleDelete(c.id)} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger"><Trash2 className="size-3.5" /></button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HarvestReport({ contributions, totalRaised, contributorCount, memberCount, visitorCount, harvest }: {
  contributions: any[]; totalRaised: number; contributorCount: number; memberCount: number; visitorCount: number; harvest: any;
}) {
  const { showToast } = useAppStore();
  const byDonor = new Map<string, { name: string; type: string; total: number; count: number }>();
  for (const c of contributions) {
    const key = c.person_id ?? c.donor_name;
    const ex = byDonor.get(key);
    if (ex) { ex.total += c.amount; ex.count++; } else byDonor.set(key, { name: c.donor_name, type: c.donor_type, total: c.amount, count: 1 });
  }
  const donorList = [...byDonor.values()].sort((a, b) => b.total - a.total);
  const memberTotal = contributions.filter((c) => c.donor_type === "member").reduce((s, c) => s + c.amount, 0);
  const visitorTotal = contributions.filter((c) => c.donor_type === "visitor").reduce((s, c) => s + c.amount, 0);

  function exportCSV() {
    const headers = ["Donor Name", "Total Given", "Contributions"];
    const csvRows = donorList.map((d) => [d.name, String(d.total), String(d.count)]);
    const csv = [headers, ...csvRows].map((r) => r.map((c) => `"${(c || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `harvest-report-${harvest.title.replace(/\s+/g, "-").toLowerCase()}-${harvest.year}.csv`;
    a.click(); URL.revokeObjectURL(url);
    showToast("CSV exported");
  }

  return (
    <div className="space-y-4">
      <div className="card p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-ink">{harvest.title} Report — {harvest.year}</h3>
            <p className="text-sm text-ink-muted">{contributorCount} contributors · {formatCurrency(totalRaised)} raised</p>
          </div>
          {donorList.length > 0 && (
            <button onClick={exportCSV} className="btn-secondary btn-sm">
              <Download className="size-3.5" /> Export CSV
            </button>
          )}
        </div>
        <div className="mt-5 grid grid-cols-4 gap-4">
          <div className="rounded-xl border border-line bg-surface-2/50 p-4 text-center"><div className="text-sm text-ink-muted">Total raised</div><div className="mt-1 text-2xl font-bold text-success">{formatCurrency(totalRaised)}</div></div>
          <div className="rounded-xl border border-line bg-surface-2/50 p-4 text-center"><div className="text-sm text-ink-muted">From members</div><div className="mt-1 text-2xl font-bold text-ink">{formatCurrency(memberTotal)}</div></div>
          <div className="rounded-xl border border-line bg-surface-2/50 p-4 text-center"><div className="text-sm text-ink-muted">From visitors</div><div className="mt-1 text-2xl font-bold text-ink">{formatCurrency(visitorTotal)}</div></div>
          <div className="rounded-xl border border-line bg-surface-2/50 p-4 text-center"><div className="text-sm text-ink-muted">{harvest.goal ? "Goal progress" : "Avg contribution"}</div><div className="mt-1 text-2xl font-bold text-ink">{harvest.goal ? `${Math.round((totalRaised / harvest.goal) * 100)}%` : formatCurrency(contributorCount ? Math.round(totalRaised / contributorCount) : 0)}</div></div>
        </div>
      </div>

      {donorList.length > 0 && (
        <div className="card overflow-hidden">
          <div className="border-b border-line p-5"><h3 className="text-lg font-bold text-ink">Contributor summary</h3><p className="text-sm text-ink-muted">Ranked by total contribution</p></div>
          <div className="divide-y divide-line-soft">
            {donorList.map((d, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3">
                <span className="grid size-7 place-items-center rounded-full bg-surface-2 text-xs font-semibold text-ink-faint">{i + 1}</span>
                <Avatar name={d.name} size="sm" />
                <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-sm font-medium">{d.name}</span><span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", d.type === "member" ? "bg-success/10 text-success" : "bg-gold/10 text-gold")}>{d.type === "member" ? "Member" : "Visitor"}</span></div><div className="text-xs text-ink-faint">{d.count} {d.count === 1 ? "contribution" : "contributions"}</div></div>
                <div className="font-semibold text-success">{formatCurrency(d.total)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
