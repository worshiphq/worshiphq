import { useEffect, useState, useMemo } from "react";
import { Search, Plus, UserPlus, Download, Upload, Loader2, Trash2, Edit3, X } from "lucide-react";
import { PageShell } from "../components/PageShell";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { cn, formatDate } from "../lib/utils";
import { v4 as uuid } from "uuid";

type Tab = "all" | "active" | "inactive";

export function PeoplePage() {
  const { session, showToast } = useAppStore();
  const [people, setPeople] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (session?.churchId) loadPeople();
  }, [session?.churchId]);

  async function loadPeople() {
    setLoading(true);
    const rows = await db.rawQuery(
      "SELECT * FROM person WHERE church_id = ? ORDER BY first_name, last_name",
      [session!.churchId]
    );
    setPeople(rows);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    let list = people;
    if (tab !== "all") list = list.filter((p) => p.status === tab);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.first_name.toLowerCase().includes(q) ||
          p.last_name.toLowerCase().includes(q) ||
          (p.phone || "").includes(q) ||
          (p.email || "").toLowerCase().includes(q) ||
          (p.member_id || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [people, tab, search]);

  const counts = useMemo(() => ({
    all: people.length,
    active: people.filter((p) => p.status === "active").length,
    inactive: people.filter((p) => p.status === "inactive").length,
  }), [people]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this member?")) return;
    setPeople((prev) => prev.filter((p) => p.id !== id));
    showToast("Member deleted");
    await db.delete("person", id);
  }

  function handleEdit(id: string) {
    setEditingId(id);
    setShowForm(true);
  }

  return (
    <PageShell title="People">
      {/* Toolbar */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9"
            placeholder="Search members..."
          />
        </div>
        <div className="flex rounded-xl border border-line bg-surface overflow-hidden">
          {(["all", "active", "inactive"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                tab === t ? "bg-primary-soft text-primary-bright" : "text-ink-muted hover:bg-surface-3"
              )}
            >
              {t} ({counts[t]})
            </button>
          ))}
        </div>
        <button
          onClick={() => { setEditingId(null); setShowForm(true); }}
          className="btn-primary"
        >
          <Plus className="size-4" /> Add Member
        </button>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-6 text-primary-bright whq-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <UserPlus className="mx-auto size-10 text-ink-faint/40" />
            <p className="mt-3 text-sm text-ink-muted">
              {search ? "No members match your search" : "No members yet"}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left">
                <th className="px-4 py-2.5 text-[11px] font-semibold text-ink-muted">Name</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold text-ink-muted">Member ID</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold text-ink-muted">Phone</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold text-ink-muted">Status</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold text-ink-muted">Joined</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold text-ink-muted w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-surface-2/50 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="grid size-7 shrink-0 place-items-center rounded-full bg-primary-soft text-[10px] font-bold text-primary-bright">
                        {p.first_name[0]}{p.last_name[0]}
                      </div>
                      <div>
                        <p className="font-medium text-ink">{p.first_name} {p.last_name}</p>
                        {p.email && <p className="text-[11px] text-ink-faint">{p.email}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-ink-muted font-mono text-xs">{p.member_id || "—"}</td>
                  <td className="px-4 py-2.5 text-ink-muted">{p.phone || "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      p.status === "active" ? "bg-success/10 text-success" : "bg-surface-3 text-ink-faint"
                    )}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-ink-faint text-xs">{p.joined_at ? formatDate(p.joined_at) : "—"}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1">
                      <button onClick={() => handleEdit(p.id)} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-surface-3 hover:text-ink">
                        <Edit3 className="size-3.5" />
                      </button>
                      <button onClick={() => handleDelete(p.id)} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger">
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <PersonForm
          churchId={session!.churchId}
          editId={editingId}
          onClose={() => { setShowForm(false); setEditingId(null); }}
          onSaved={() => { setShowForm(false); setEditingId(null); loadPeople(); }}
        />
      )}
    </PageShell>
  );
}

function PersonForm({
  churchId,
  editId,
  onClose,
  onSaved,
}: {
  churchId: string;
  editId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    gender: "",
    status: "active",
    location: "",
    occupation: "",
    marital_status: "",
    birthday: "",
    notes: "",
  });

  useEffect(() => {
    if (editId) {
      db.getById("person", editId).then((p) => {
        if (p) {
          setForm({
            first_name: p.first_name || "",
            last_name: p.last_name || "",
            email: p.email || "",
            phone: p.phone || "",
            gender: p.gender || "",
            status: p.status || "active",
            location: p.location || "",
            occupation: p.occupation || "",
            marital_status: p.marital_status || "",
            birthday: p.birthday || "",
            notes: p.notes || "",
          });
        }
      });
    }
  }, [editId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.first_name || !form.last_name) return;

    setSaving(true);

    if (editId) {
      await db.update("person", editId, form);
      showToast("Member updated");
    } else {
      await db.insert("person", {
        id: uuid(),
        church_id: churchId,
        ...form,
      });
      showToast("Member added");
    }

    setSaving(false);
    onSaved();
  }

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl border border-line bg-surface p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">{editId ? "Edit Member" : "Add Member"}</h2>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-lg hover:bg-surface-3">
            <X className="size-4 text-ink-faint" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">First Name *</label>
              <input value={form.first_name} onChange={set("first_name")} className="input" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Last Name *</label>
              <input value={form.last_name} onChange={set("last_name")} className="input" required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Email</label>
              <input type="email" value={form.email} onChange={set("email")} className="input" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Phone</label>
              <input value={form.phone} onChange={set("phone")} className="input" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Gender</label>
              <select value={form.gender} onChange={set("gender")} className="input">
                <option value="">—</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Status</label>
              <select value={form.status} onChange={set("status")} className="input">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Marital Status</label>
              <select value={form.marital_status} onChange={set("marital_status")} className="input">
                <option value="">—</option>
                <option value="Single">Single</option>
                <option value="Married">Married</option>
                <option value="Divorced">Divorced</option>
                <option value="Widowed">Widowed</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Location</label>
              <input value={form.location} onChange={set("location")} className="input" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Occupation</label>
              <input value={form.occupation} onChange={set("occupation")} className="input" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Birthday (MM-DD)</label>
            <input value={form.birthday} onChange={set("birthday")} className="input" placeholder="03-15" />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Notes</label>
            <textarea value={form.notes} onChange={set("notes")} className="input min-h-[60px] resize-none" />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving && <Loader2 className="size-4 whq-spin" />}
              {saving ? "Saving..." : editId ? "Update" : "Add Member"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
