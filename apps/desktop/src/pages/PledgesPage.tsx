import { useEffect, useState, useMemo } from "react";
import {
  Plus, Loader2, Target, Trash2, HandCoins, TrendingUp, Pencil,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Modal } from "../components/ui/Modal";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatCurrency, formatDate, cn } from "../lib/utils";
import { v4 as uuid } from "uuid";

export function PledgesPage() {
  const { session, showToast, syncVersion } = useAppStore();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [pledges, setPledges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [showPledgeForm, setShowPledgeForm] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<any>(null);
  const [editingPledge, setEditingPledge] = useState<any>(null);

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  async function loadData() {
    setLoading(true);
    const cid = session!.churchId;
    const [c, p] = await Promise.all([
      db.rawQuery("SELECT * FROM campaign WHERE church_id = ? ORDER BY ends_at ASC", [cid]),
      db.rawQuery("SELECT p.*, c.name as campaign_name FROM pledge p LEFT JOIN campaign c ON p.campaign_id = c.id WHERE p.church_id = ? ORDER BY p.due_at ASC LIMIT 500", [cid]),
    ]);
    setCampaigns(c);
    setPledges(p);
    setLoading(false);
  }

  const stats = useMemo(() => {
    const totalPledged = pledges.reduce((s, p) => s + (p.amount || 0), 0);
    const totalFulfilled = pledges.reduce((s, p) => s + (p.fulfilled || 0), 0);
    const pct = totalPledged > 0 ? Math.round((totalFulfilled / totalPledged) * 100) : 0;
    return { campaigns: campaigns.length, pledges: pledges.length, totalPledged, totalFulfilled, pct };
  }, [campaigns, pledges]);

  async function handleDeleteCampaign(id: string) {
    if (!confirm("Delete this campaign?")) return;
    setCampaigns((prev) => prev.filter((c) => c.id !== id));
    showToast("Campaign deleted");
    await db.delete("campaign", id);
  }

  return (
    <PageShell title="Pledges">
      <PageHeader title="Pledges & Campaigns" description="Track campaigns, pledges, and fulfilment progress.">
        <div className="flex gap-2">
          <button onClick={() => setShowCampaignForm(true)} className="btn-ghost btn-sm">
            <Target className="size-3.5" /> New Campaign
          </button>
          <button onClick={() => setShowPledgeForm(true)} className="btn-primary btn-sm">
            <Plus className="size-3.5" /> Record Pledge
          </button>
        </div>
      </PageHeader>

      <div className="mb-5 grid grid-cols-4 gap-3">
        <StatCard label="Campaigns" value={stats.campaigns} icon={Target} color="bg-primary-soft text-primary-bright" />
        <StatCard label="Pledges" value={stats.pledges} icon={HandCoins} color="bg-success/10 text-success" />
        <StatCard label="Total Pledged" value={formatCurrency(stats.totalPledged)} icon={TrendingUp} color="bg-gold/10 text-gold" />
        <StatCard label="Fulfilled" value={`${stats.pct}%`} icon={TrendingUp} color="bg-info/10 text-info" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>
      ) : (
        <>
          {/* Campaigns */}
          {campaigns.length > 0 && (
            <div className="mb-6">
              <h3 className="mb-3 text-sm font-bold text-ink uppercase tracking-wider">Campaigns</h3>
              <div className="grid gap-3 grid-cols-3">
                {campaigns.map((c) => {
                  const pct = c.goal > 0 ? Math.round(((c.raised || 0) / c.goal) * 100) : 0;
                  return (
                    <div key={c.id} className="card p-4">
                      <div className="flex items-start justify-between">
                        <h4 className="font-bold text-ink">{c.name}</h4>
                        <div className="flex gap-1">
                          <button onClick={() => { setEditingCampaign(c); setShowCampaignForm(true); }} className="grid size-6 place-items-center rounded-lg text-ink-faint hover:bg-primary-soft hover:text-primary-bright" title="Edit"><Pencil className="size-3" /></button>
                          <button onClick={() => handleDeleteCampaign(c.id)} className="grid size-6 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger"><Trash2 className="size-3" /></button>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span className="text-success font-bold">{formatCurrency(c.raised || 0)}</span>
                        <span className="text-ink-faint">of {formatCurrency(c.goal)}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
                        <div className="h-full rounded-full bg-gradient-to-r from-success to-success/70" style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                      {c.ends_at && <p className="mt-2 text-[11px] text-ink-faint">Ends: {formatDate(c.ends_at)}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pledges table */}
          <h3 className="mb-3 text-sm font-bold text-ink uppercase tracking-wider">Pledges</h3>
          <div className="card p-0 overflow-hidden">
            {pledges.length === 0 ? (
              <div className="py-12 text-center">
                <HandCoins className="mx-auto size-8 text-ink-faint/30" />
                <p className="mt-2 text-sm text-ink-muted">No pledges recorded yet</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface-2/50">
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Donor</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Campaign</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Pledged</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Fulfilled</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Due</th>
                    <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Progress</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {pledges.map((p) => {
                    const pct = p.amount > 0 ? Math.round(((p.fulfilled || 0) / p.amount) * 100) : 0;
                    return (
                      <tr key={p.id} className="hover:bg-surface-2/50">
                        <td className="px-4 py-3 font-medium text-ink">{p.donor_name}</td>
                        <td className="px-4 py-3 text-ink-muted">{p.campaign_name || "—"}</td>
                        <td className="px-4 py-3 text-right font-bold text-ink">{formatCurrency(p.amount)}</td>
                        <td className="px-4 py-3 text-right font-bold text-success">{formatCurrency(p.fulfilled || 0)}</td>
                        <td className="px-4 py-3 text-xs text-ink-faint">{p.due_at ? formatDate(p.due_at) : "—"}</td>
                        <td className="px-4 py-3">
                          <div className="mx-auto w-16 h-1.5 overflow-hidden rounded-full bg-surface-3">
                            <div className={cn("h-full rounded-full", pct >= 100 ? "bg-success" : "bg-primary-bright")} style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      <Modal open={showCampaignForm} onClose={() => { setShowCampaignForm(false); setEditingCampaign(null); }} title={editingCampaign ? "Edit Campaign" : "Create Campaign"}>
        <CampaignForm churchId={session!.churchId} existing={editingCampaign} onClose={() => { setShowCampaignForm(false); setEditingCampaign(null); }} onSaved={() => { setShowCampaignForm(false); setEditingCampaign(null); loadData(); }} />
      </Modal>
      <Modal open={showPledgeForm} onClose={() => { setShowPledgeForm(false); setEditingPledge(null); }} title={editingPledge ? "Edit Pledge" : "Record Pledge"}>
        <PledgeForm churchId={session!.churchId} campaigns={campaigns} existing={editingPledge} onClose={() => { setShowPledgeForm(false); setEditingPledge(null); }} onSaved={() => { setShowPledgeForm(false); setEditingPledge(null); loadData(); }} />
      </Modal>
    </PageShell>
  );
}

function CampaignForm({ churchId, existing, onClose, onSaved }: { churchId: string; existing?: any; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: existing?.name || "", goal: existing?.goal != null ? String(existing.goal) : "",
    ends_at: existing?.ends_at || "",
  });
  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const data = { name: form.name.trim(), goal: Number(form.goal) || 0, ends_at: form.ends_at || null };
    if (existing) {
      await db.update("campaign", existing.id, data);
      showToast("Campaign updated");
    } else {
      await db.insert("campaign", { id: uuid(), church_id: churchId, ...data, raised: 0 });
      showToast("Campaign created");
    }
    setSaving(false); onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Campaign Name *</label><input value={form.name} onChange={set("name")} className="input" required placeholder="e.g. Building Fund" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Goal (GHS) *</label><input type="number" value={form.goal} onChange={set("goal")} className="input" required placeholder="10000" /></div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">End Date</label><input type="date" value={form.ends_at} onChange={set("ends_at")} className="input" /></div>
      </div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving && <Loader2 className="size-4 whq-spin" />}{saving ? "Saving..." : existing ? "Update" : "Create"}</button>
      </div>
    </form>
  );
}

function PledgeForm({ churchId, campaigns, existing, onClose, onSaved }: { churchId: string; campaigns: any[]; existing?: any; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    donor_name: existing?.donor_name || "", amount: existing?.amount != null ? String(existing.amount) : "",
    campaign_id: existing?.campaign_id || "", due_at: existing?.due_at || "",
  });
  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const data = {
      donor_name: form.donor_name.trim(), amount: Number(form.amount) || 0,
      campaign_id: form.campaign_id || null, due_at: form.due_at || null,
    };
    if (existing) {
      await db.update("pledge", existing.id, data);
      showToast("Pledge updated");
    } else {
      await db.insert("pledge", { id: uuid(), church_id: churchId, ...data, fulfilled: 0 });
      showToast("Pledge recorded");
    }
    setSaving(false); onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Donor Name *</label><input value={form.donor_name} onChange={set("donor_name")} className="input" required placeholder="Full name" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Amount (GHS) *</label><input type="number" value={form.amount} onChange={set("amount")} className="input" required placeholder="500" /></div>
        <div><label className="block text-xs font-medium text-ink-muted mb-1">Campaign</label>
          <select value={form.campaign_id} onChange={set("campaign_id")} className="input">
            <option value="">— None —</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Due Date</label><input type="date" value={form.due_at} onChange={set("due_at")} className="input" /></div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving && <Loader2 className="size-4 whq-spin" />}{saving ? "Saving..." : existing ? "Update" : "Record Pledge"}</button>
      </div>
    </form>
  );
}
