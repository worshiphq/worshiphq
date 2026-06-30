import { useEffect, useState, useMemo } from "react";
import {
  Plus, Loader2, MessageSquare, Trash2, Search, Send, Clock, CheckCircle2, Pencil,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Modal } from "../components/ui/Modal";
import { db } from "../lib/api";
import { requireOnline } from "../lib/net";
import { useAppStore } from "../stores/app-store";
import { formatDate, cn } from "../lib/utils";
import { v4 as uuid } from "uuid";

export function CommunicationsPage() {
  const { session, showToast, syncVersion } = useAppStore();
  const [comms, setComms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  async function loadData() {
    setLoading(true);
    const rows = await db.rawQuery("SELECT * FROM communication WHERE church_id = ? ORDER BY created_at DESC LIMIT 500", [session!.churchId]);
    setComms(rows);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (!search) return comms;
    const q = search.toLowerCase();
    return comms.filter((c) => c.name?.toLowerCase().includes(q) || c.channel?.toLowerCase().includes(q));
  }, [comms, search]);

  const stats = useMemo(() => {
    const sent = comms.filter((c) => c.status === "sent").length;
    const draft = comms.filter((c) => c.status === "draft").length;
    const totalSent = comms.reduce((s, c) => s + (c.sent || 0), 0);
    return { total: comms.length, sent, draft, totalSent };
  }, [comms]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this communication?")) return;
    setComms((prev) => prev.filter((c) => c.id !== id));
    showToast("Deleted");
    await db.delete("communication", id);
  }

  async function handleSend(id: string) {
    const ok = await requireOnline("send this message");
    if (!ok) return;
    showToast("Sending requires syncing to the web app. Sync now and send from the web.", "info");
    window.api?.openExternal("https://worshiphq.app/app/communications");
  }

  const statusIcon = (s: string) => {
    if (s === "sent") return <CheckCircle2 className="size-3.5 text-success" />;
    if (s === "scheduled") return <Clock className="size-3.5 text-gold" />;
    return <MessageSquare className="size-3.5 text-ink-faint" />;
  };

  return (
    <PageShell title="Communications">
      <PageHeader title="Communications" description="Manage messages, SMS campaigns, and announcements.">
        <button onClick={() => setShowForm(true)} className="btn-primary btn-sm">
          <Plus className="size-3.5" /> New Message
        </button>
      </PageHeader>

      <div className="mb-5 grid grid-cols-4 gap-3">
        <StatCard label="Total Messages" value={stats.total} icon={MessageSquare} color="bg-primary-soft text-primary-bright" />
        <StatCard label="Sent" value={stats.sent} icon={Send} color="bg-success/10 text-success" />
        <StatCard label="Drafts" value={stats.draft} icon={Clock} color="bg-gold/10 text-gold" />
        <StatCard label="Delivered" value={stats.totalSent} icon={CheckCircle2} color="bg-info/10 text-info" />
      </div>

      <div className="mb-4 relative max-w-xs">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} className="input h-9 pl-9" placeholder="Search communications..." />
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <MessageSquare className="mx-auto size-10 text-ink-faint/30" />
            <p className="mt-3 text-sm font-medium text-ink">{search ? "No messages match" : "No communications yet"}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2/50">
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Name</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Channel</th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Status</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Sent</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Date</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-surface-2/50">
                  <td className="px-4 py-3 font-medium text-ink">{c.name}</td>
                  <td className="px-4 py-3"><span className="rounded-md bg-surface-3 px-2 py-0.5 text-[11px] font-medium text-ink-muted">{c.channel || "SMS"}</span></td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1">
                      {statusIcon(c.status)}
                      <span className={cn("text-xs font-medium",
                        c.status === "sent" ? "text-success" : c.status === "scheduled" ? "text-gold" : "text-ink-faint"
                      )}>{c.status || "draft"}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-ink">{c.sent || 0}</td>
                  <td className="px-4 py-3 text-xs text-ink-faint">{formatDate(c.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {c.status === "draft" && (
                        <>
                          <button onClick={() => handleSend(c.id)} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-primary-soft hover:text-primary-bright" title="Send">
                            <Send className="size-3.5" />
                          </button>
                          <button onClick={() => { setEditing(c); setShowForm(true); }} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-primary-soft hover:text-primary-bright" title="Edit">
                            <Pencil className="size-3.5" />
                          </button>
                        </>
                      )}
                      <button onClick={() => handleDelete(c.id)} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger"><Trash2 className="size-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={showForm} onClose={() => { setShowForm(false); setEditing(null); }} title={editing ? "Edit Message" : "New Message"}>
        <CommForm churchId={session!.churchId} existing={editing} onClose={() => { setShowForm(false); setEditing(null); }} onSaved={() => { setShowForm(false); setEditing(null); loadData(); }} />
      </Modal>
    </PageShell>
  );
}

function CommForm({ churchId, existing, onClose, onSaved }: { churchId: string; existing?: any; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: existing?.name || "", channel: existing?.channel || "SMS",
    body: existing?.body || "",
  });
  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const data = { name: form.name.trim(), channel: form.channel, body: form.body || null };
    if (existing) {
      await db.update("communication", existing.id, data);
      showToast("Message updated");
    } else {
      await db.insert("communication", { id: uuid(), church_id: churchId, ...data, status: "draft", sent: 0 });
      showToast("Message created as draft");
    }
    setSaving(false); onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Name *</label><input value={form.name} onChange={set("name")} className="input" required placeholder="e.g. Sunday reminder" /></div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Channel</label>
        <select value={form.channel} onChange={set("channel")} className="input">
          <option>SMS</option><option>Email</option><option>WhatsApp</option><option>Push</option>
        </select>
      </div>
      <div><label className="block text-xs font-medium text-ink-muted mb-1">Message Body</label><textarea value={form.body} onChange={set("body")} className="input" rows={4} placeholder="Type your message..." /></div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving && <Loader2 className="size-4 whq-spin" />}{saving ? "Saving..." : existing ? "Update" : "Create Draft"}</button>
      </div>
    </form>
  );
}
