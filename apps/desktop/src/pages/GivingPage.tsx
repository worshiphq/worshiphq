import { useEffect, useState, useMemo } from "react";
import { Plus, Search, Loader2, Trash2, HandCoins, X } from "lucide-react";
import { PageShell } from "../components/PageShell";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { formatCurrency, formatDate, cn } from "../lib/utils";
import { v4 as uuid } from "uuid";

const METHODS = ["Cash", "MTN_MoMo", "Telecel_Cash", "AirtelTigo", "Card"];

export function GivingPage() {
  const { session, showToast } = useAppStore();
  const [gifts, setGifts] = useState<any[]>([]);
  const [people, setPeople] = useState<any[]>([]);
  const [funds, setFunds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId]);

  async function loadData() {
    setLoading(true);
    const cid = session!.churchId;
    const [g, p, f] = await Promise.all([
      db.rawQuery(`SELECT g.*, p.first_name, p.last_name FROM gift g LEFT JOIN person p ON g.person_id = p.id WHERE g.church_id = ? ORDER BY g.date DESC LIMIT 200`, [cid]),
      db.rawQuery("SELECT id, first_name, last_name FROM person WHERE church_id = ? ORDER BY first_name", [cid]),
      db.rawQuery("SELECT * FROM fund WHERE church_id = ?", [cid]),
    ]);
    setGifts(g);
    setPeople(p);
    setFunds(f);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (!search) return gifts;
    const q = search.toLowerCase();
    return gifts.filter(
      (g) =>
        (g.first_name || "").toLowerCase().includes(q) ||
        (g.last_name || "").toLowerCase().includes(q) ||
        (g.donor_name || "").toLowerCase().includes(q)
    );
  }, [gifts, search]);

  const totalGiving = useMemo(() => filtered.reduce((s, g) => s + (g.amount || 0), 0), [filtered]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this gift record?")) return;
    setGifts((prev) => prev.filter((g) => g.id !== id));
    showToast("Gift deleted");
    await db.delete("gift", id);
  }

  return (
    <PageShell title="Giving">
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} className="input pl-9" placeholder="Search gifts..." />
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-gold/10 px-3 py-1.5">
          <HandCoins className="size-4 text-gold" />
          <span className="text-sm font-bold text-gold">{formatCurrency(totalGiving)}</span>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          <Plus className="size-4" /> Record Gift
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-6 text-primary-bright whq-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <HandCoins className="mx-auto size-10 text-ink-faint/40" />
            <p className="mt-3 text-sm text-ink-muted">No gifts recorded yet</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left">
                <th className="px-4 py-2.5 text-[11px] font-semibold text-ink-muted">Donor</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold text-ink-muted">Amount</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold text-ink-muted">Method</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold text-ink-muted">Date</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold text-ink-muted w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((g) => (
                <tr key={g.id} className="hover:bg-surface-2/50">
                  <td className="px-4 py-2.5 font-medium text-ink">
                    {g.first_name ? `${g.first_name} ${g.last_name}` : g.donor_name || "Anonymous"}
                  </td>
                  <td className="px-4 py-2.5 font-semibold text-success">{formatCurrency(g.amount)}</td>
                  <td className="px-4 py-2.5 text-ink-muted">{g.method}</td>
                  <td className="px-4 py-2.5 text-ink-faint text-xs">{formatDate(g.date)}</td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => handleDelete(g.id)} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger">
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <GiftForm
          churchId={session!.churchId}
          people={people}
          funds={funds}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); loadData(); }}
        />
      )}
    </PageShell>
  );
}

function GiftForm({ churchId, people, funds, onClose, onSaved }: {
  churchId: string; people: any[]; funds: any[]; onClose: () => void; onSaved: () => void;
}) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    person_id: "",
    donor_name: "",
    fund_id: "",
    amount: "",
    method: "Cash",
    date: new Date().toISOString().slice(0, 10),
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) return;

    setSaving(true);
    await db.insert("gift", {
      id: uuid(),
      church_id: churchId,
      person_id: form.person_id || null,
      donor_name: form.donor_name || null,
      fund_id: form.fund_id || null,
      amount: Number(form.amount),
      method: form.method,
      date: form.date,
    });
    showToast("Gift recorded");
    setSaving(false);
    onSaved();
  }

  const set = (key: string) => (e: any) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">Record Gift</h2>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-lg hover:bg-surface-3">
            <X className="size-4 text-ink-faint" />
          </button>
        </div>
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
      </div>
    </div>
  );
}
