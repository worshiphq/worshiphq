import { useEffect, useState, useMemo } from "react";
import {
  Plus, Search, Loader2, Trash2, HandCoins, X, Wallet,
  Banknote, CreditCard, Smartphone, PiggyBank,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Avatar } from "../components/ui/Avatar";
import { Modal } from "../components/ui/Modal";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatCurrency, formatDate, cn } from "../lib/utils";
import { v4 as uuid } from "uuid";

const METHODS = ["Cash", "MTN_MoMo", "Telecel_Cash", "AirtelTigo", "Card"];

const methodIcons: Record<string, any> = {
  Cash: Banknote,
  MTN_MoMo: Smartphone,
  Telecel_Cash: Smartphone,
  AirtelTigo: Smartphone,
  Card: CreditCard,
};

export function GivingPage() {
  const { session, showToast, syncVersion } = useAppStore();
  const [gifts, setGifts] = useState<any[]>([]);
  const [people, setPeople] = useState<any[]>([]);
  const [funds, setFunds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [methodFilter, setMethodFilter] = useState("");

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  async function loadData() {
    setLoading(true);
    const cid = session!.churchId;
    const [g, p, f] = await Promise.all([
      db.rawQuery(`SELECT g.*, p.first_name, p.last_name, p.photo_url FROM gift g LEFT JOIN person p ON g.person_id = p.id WHERE g.church_id = ? ORDER BY g.date DESC LIMIT 500`, [cid]),
      db.rawQuery("SELECT id, first_name, last_name FROM person WHERE church_id = ? ORDER BY first_name", [cid]),
      db.rawQuery("SELECT * FROM fund WHERE church_id = ?", [cid]),
    ]);
    setGifts(g);
    setPeople(p);
    setFunds(f);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    let list = gifts;
    if (methodFilter) list = list.filter((g) => g.method === methodFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (g) =>
          (g.first_name || "").toLowerCase().includes(q) ||
          (g.last_name || "").toLowerCase().includes(q) ||
          (g.donor_name || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [gifts, search, methodFilter]);

  const stats = useMemo(() => {
    const total = gifts.reduce((s, g) => s + (g.amount || 0), 0);
    const thisMonth = gifts.filter((g) => {
      const d = new Date(g.date);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const monthTotal = thisMonth.reduce((s, g) => s + (g.amount || 0), 0);
    const avgGift = gifts.length ? total / gifts.length : 0;
    return { total, monthTotal, count: gifts.length, avgGift };
  }, [gifts]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this gift record?")) return;
    setGifts((prev) => prev.filter((g) => g.id !== id));
    showToast("Gift deleted");
    await db.delete("gift", id);
  }

  return (
    <PageShell title="Giving">
      <PageHeader title="Giving" description="Track tithes, offerings, and donations.">
        <button onClick={() => setShowForm(true)} className="btn-primary btn-sm">
          <Plus className="size-3.5" /> Record Gift
        </button>
      </PageHeader>

      {/* Stat cards */}
      <div className="mb-5 grid grid-cols-4 gap-3">
        <StatCard label="Total Giving" value={formatCurrency(stats.total)} icon={HandCoins} color="bg-gold/10 text-gold" />
        <StatCard label="This Month" value={formatCurrency(stats.monthTotal)} icon={Wallet} color="bg-success/10 text-success" />
        <StatCard label="Total Gifts" value={stats.count} icon={PiggyBank} color="bg-primary-soft text-primary-bright" />
        <StatCard label="Avg. Gift" value={formatCurrency(stats.avgGift)} icon={Banknote} color="bg-info/10 text-info" />
      </div>

      {/* Filters bar */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setMethodFilter("")}
            className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
              !methodFilter ? "bg-primary/10 text-primary-bright shadow-sm" : "text-ink-muted hover:bg-surface-2"
            )}>All</button>
          {METHODS.map((m) => (
            <button key={m} onClick={() => setMethodFilter(m)}
              className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
                methodFilter === m ? "bg-primary/10 text-primary-bright shadow-sm" : "text-ink-muted hover:bg-surface-2"
              )}>{m.replace("_", " ")}</button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            className="input h-9 pl-9 w-56" placeholder="Search gifts..." />
        </div>
      </div>

      {/* Gift list */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-6 text-primary-bright whq-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <HandCoins className="mx-auto size-10 text-ink-faint/30" />
            <p className="mt-3 text-sm font-medium text-ink">{search || methodFilter ? "No gifts match your filter" : "No gifts recorded yet"}</p>
            <p className="mt-1 text-xs text-ink-muted">Sync to pull data or record a gift manually.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2/50">
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Donor</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Amount</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Method</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Date</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {filtered.map((g) => {
                const name = g.first_name ? `${g.first_name} ${g.last_name}` : g.donor_name || "Anonymous";
                const MethodIcon = methodIcons[g.method] || Banknote;
                return (
                  <tr key={g.id} className="transition-colors hover:bg-surface-2/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={name} src={g.photo_url} size="sm" />
                        <span className="font-medium text-ink">{name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-bold text-success">{formatCurrency(g.amount)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-ink-muted">
                        <MethodIcon className="size-3.5" />
                        {g.method?.replace("_", " ")}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-faint">{formatDate(g.date)}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleDelete(g.id)}
                        className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger">
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Record Gift">
        <GiftForm
          churchId={session!.churchId}
          people={people}
          funds={funds}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); loadData(); }}
        />
      </Modal>
    </PageShell>
  );
}

function GiftForm({ churchId, people, funds, onClose, onSaved }: {
  churchId: string; people: any[]; funds: any[]; onClose: () => void; onSaved: () => void;
}) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    person_id: "", donor_name: "", fund_id: "", amount: "", method: "Cash",
    date: new Date().toISOString().slice(0, 10),
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) return;
    setSaving(true);
    await db.insert("gift", {
      id: uuid(), church_id: churchId, person_id: form.person_id || null,
      donor_name: form.donor_name || null, fund_id: form.fund_id || null,
      amount: Number(form.amount), method: form.method, date: form.date,
    });
    showToast("Gift recorded");
    setSaving(false);
    onSaved();
  }

  const set = (key: string) => (e: any) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-ink-muted mb-1">Member</label>
        <select value={form.person_id} onChange={set("person_id")} className="input">
          <option value="">— Select member or enter name below —</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
        </select>
      </div>
      {!form.person_id && (
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Donor Name</label>
          <input value={form.donor_name} onChange={set("donor_name")} className="input" placeholder="Visitor / external donor" />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Amount (GHS) *</label>
          <input type="number" step="0.01" value={form.amount} onChange={set("amount")} className="input" required />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Method</label>
          <select value={form.method} onChange={set("method")} className="input">
            {METHODS.map((m) => <option key={m} value={m}>{m.replace("_", " ")}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Fund</label>
          <select value={form.fund_id} onChange={set("fund_id")} className="input">
            <option value="">General</option>
            {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Date</label>
          <input type="date" value={form.date} onChange={set("date")} className="input" />
        </div>
      </div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">
          {saving && <Loader2 className="size-4 whq-spin" />}
          {saving ? "Saving..." : "Record Gift"}
        </button>
      </div>
    </form>
  );
}
