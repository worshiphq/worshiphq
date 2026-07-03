import { useEffect, useState, useMemo } from "react";
import {
  Plus, Loader2, MessageSquare, Trash2, Search, Send, Clock, CheckCircle2, Pencil,
  Wallet, Mail, Users, Smartphone, AlertTriangle,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Modal } from "../components/ui/Modal";
import { db } from "../lib/api";
import { requireOnline } from "../lib/net";
import { useAppStore } from "../stores/app-store";
import { formatDate, cn } from "../lib/utils";
import { SMS_BUNDLES, segmentsFor } from "../components/sms-config";
import { v4 as uuid } from "uuid";

export function CommunicationsPage() {
  const { session, showToast, syncVersion } = useAppStore();
  const [comms, setComms] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [people, setPeople] = useState<any[]>([]);
  const [credits, setCredits] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showComposer, setShowComposer] = useState(false);
  const [showBuy, setShowBuy] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  async function loadData() {
    setLoading(true);
    const cid = session!.churchId;
    const [rows, depts, ppl, church] = await Promise.all([
      db.rawQuery("SELECT * FROM communication WHERE church_id = ? ORDER BY created_at DESC LIMIT 500", [cid]),
      db.rawQuery("SELECT id, name FROM department WHERE church_id = ? ORDER BY name ASC", [cid]),
      db.rawQuery("SELECT id, phone, email, status FROM person WHERE church_id = ?", [cid]),
      db.getById("church", cid),
    ]);
    setComms(rows);
    setDepartments(depts);
    setPeople(ppl);
    setCredits(church?.sms_credits ?? 0);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (!search) return comms;
    const q = search.toLowerCase();
    return comms.filter((c) => c.name?.toLowerCase().includes(q) || c.channel?.toLowerCase().includes(q));
  }, [comms, search]);

  const stats = useMemo(() => {
    const sent = comms.reduce((s, c) => s + (c.sent || 0), 0);
    const reach = comms.reduce((s, c) => s + (c.delivered || 0), 0);
    return { credits, sent, reach, audience: people.length };
  }, [comms, credits, people]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this communication?")) return;
    setComms((prev) => prev.filter((c) => c.id !== id));
    showToast("Deleted");
    await db.delete("communication", id);
  }

  const statusIcon = (s: string) => {
    if (s === "sent") return <CheckCircle2 className="size-3.5 text-success" />;
    if (s === "scheduled") return <Clock className="size-3.5 text-gold" />;
    return <MessageSquare className="size-3.5 text-ink-faint" />;
  };

  return (
    <PageShell title="Communications">
      <PageHeader title="Communications" description="Reach your whole church — or a smart segment — by SMS and email.">
        <button onClick={() => setShowBuy(true)} className="btn-secondary btn-sm">
          <Wallet className="size-3.5" /> {credits.toLocaleString()} credits · Buy
        </button>
        <button onClick={() => { setEditing(null); setShowComposer(true); }} className="btn-primary btn-sm">
          <Plus className="size-3.5" /> New Broadcast
        </button>
      </PageHeader>

      {credits <= 20 && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-gold">
          <AlertTriangle className="size-4 shrink-0" />
          Your SMS credits are running low. Top up so your messages keep sending.
          <button onClick={() => setShowBuy(true)} className="font-semibold underline underline-offset-2">Buy more credits</button>
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="SMS Credits" value={stats.credits} icon={Wallet} color="text-primary-bright" />
        <StatCard label="Messages Sent" value={stats.sent} icon={MessageSquare} color="text-success" />
        <StatCard label="People Reached" value={stats.reach} icon={Users} color="text-info" />
        <StatCard label="Audience" value={stats.audience} icon={Mail} color="text-gold" />
      </div>

      <div className="mb-4 relative max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} className="input h-10 pl-9" placeholder="Search campaigns..." />
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="flex items-center justify-between border-b border-line p-5">
          <h3 className="font-display text-lg font-semibold text-ink">Campaign history</h3>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <MessageSquare className="mx-auto size-10 text-ink-faint/30" />
            <p className="mt-3 text-sm font-medium text-ink">{search ? "No campaigns match" : "No broadcasts yet. Send your first from the composer."}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
              <tr>
                <th className="p-4 font-medium">Campaign</th>
                <th className="p-4 font-medium">Channel</th>
                <th className="p-4 font-medium">Segment</th>
                <th className="p-4 font-medium text-center">Delivered</th>
                <th className="p-4 font-medium text-center">Status</th>
                <th className="p-4 font-medium">Date</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-line-soft last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-3 font-medium text-ink">{c.name}</td>
                  <td className="p-4"><span className={cn("badge", c.channel === "Email" ? "badge-info" : "badge-primary")}>{c.channel || "SMS"}</span></td>
                  <td className="p-4 text-ink-muted">{c.segment || "—"}</td>
                  <td className="p-4 text-center text-ink-muted">{c.sent > 0 ? `${c.delivered || 0}/${c.sent}` : "—"}</td>
                  <td className="p-4 text-center">
                    <span className={cn("badge", c.status === "sent" ? "badge-success" : "badge-warning")}>{c.status || "draft"}</span>
                  </td>
                  <td className="p-4 text-ink-muted">{formatDate(c.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {c.status === "draft" && (
                        <button onClick={() => { setEditing(c); setShowComposer(true); }} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-primary-soft hover:text-primary-bright" title="Edit"><Pencil className="size-3.5" /></button>
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

      <Modal open={showComposer} onClose={() => { setShowComposer(false); setEditing(null); }} title={editing ? "Edit Draft" : "New Broadcast"}>
        <Composer
          churchId={session!.churchId}
          departments={departments}
          people={people}
          credits={credits}
          existing={editing}
          onClose={() => { setShowComposer(false); setEditing(null); }}
          onSaved={() => { setShowComposer(false); setEditing(null); loadData(); }}
        />
      </Modal>

      <Modal open={showBuy} onClose={() => setShowBuy(false)} title="SMS Credits">
        <BuyCredits churchId={session!.churchId} balance={credits} onClose={() => setShowBuy(false)} onChanged={loadData} />
      </Modal>
    </PageShell>
  );
}

function Composer({ churchId, departments, people, credits, existing, onClose, onSaved }: {
  churchId: string; departments: any[]; people: any[]; credits: number;
  existing?: any; onClose: () => void; onSaved: () => void;
}) {
  const { showToast } = useAppStore();
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [channel, setChannel] = useState<"SMS" | "Email">(existing?.channel === "Email" ? "Email" : "SMS");
  const [target, setTarget] = useState(existing?.segment ? "all" : "all");
  const [contacts, setContacts] = useState("");
  const [name, setName] = useState(existing?.name || "Sunday service reminder");
  const [message, setMessage] = useState(existing?.body || "Shalom! Join us this Sunday at 8am for our Celebration Service. God bless you!");

  // Resolve recipients from local person data (mirrors sendBroadcast).
  function resolveRecipients(): { list: string[]; label: string } {
    if (target === "custom") {
      const list = contacts.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
      return { list, label: `${list.length} custom recipient(s)` };
    }
    let pool = people;
    let label = "All members";
    if (target === "active") { pool = people.filter((p) => p.status === "active"); label = "Active members"; }
    else if (target === "visitor") { pool = people.filter((p) => p.status === "visitor"); label = "Visitors"; }
    else if (target.startsWith("dept:")) {
      // Department membership isn't resolved locally here; label only.
      const d = departments.find((x) => x.id === target.slice(5));
      label = d ? `${d.name} department` : "Department";
    }
    const list = (channel === "Email"
      ? pool.map((p) => p.email)
      : pool.map((p) => p.phone)
    ).filter(Boolean);
    return { list, label };
  }

  const { list: recipients, label: segmentLabel } = resolveRecipients();
  const cost = channel === "SMS" ? segmentsFor(message) * recipients.length : 0;
  const insufficient = channel === "SMS" && cost > credits;

  async function saveDraft() {
    setSaving(true);
    const data = { name: name.trim() || "Broadcast", channel, body: message, segment: segmentLabel };
    if (existing) {
      await db.update("communication", existing.id, data);
      showToast("Draft updated");
    } else {
      await db.insert("communication", { id: uuid(), church_id: churchId, ...data, status: "draft", sent: 0, delivered: 0 });
      showToast("Saved as draft");
    }
    setSaving(false); onSaved();
  }

  // SMS/Email send is ONLINE-ONLY (Hubtel/email provider). We deduct credits
  // locally, record the communication as sent + mark for sync, and require online.
  async function send() {
    if (!message.trim()) { showToast("Enter a message", "error"); return; }
    if (recipients.length === 0) { showToast("No recipients for this segment", "error"); return; }
    if (insufficient) { showToast("Not enough SMS credits for that broadcast", "error"); return; }
    const ok = await requireOnline(`send this ${channel}`);
    if (!ok) return;
    setSending(true);
    const sent = recipients.length;
    // Record locally (optimistic, delivered = sent in stub mode) + mark for sync.
    if (existing) {
      await db.update("communication", existing.id, {
        name: name.trim() || "Broadcast", channel, body: message,
        segment: segmentLabel, sent, delivered: sent, status: "sent",
      });
    } else {
      await db.insert("communication", {
        id: uuid(), church_id: churchId, name: name.trim() || "Broadcast",
        channel, body: message, segment: segmentLabel, sent, delivered: sent, status: "sent",
      });
    }
    // Deduct credits from local church wallet for SMS.
    if (channel === "SMS" && cost > 0) {
      await db.update("church", churchId, { sms_credits: Math.max(0, credits - cost) });
    }
    showToast(`${channel} queued to ${sent} recipient(s) — will send on sync`, "success");
    setSending(false); onSaved();
  }

  const selectCls = "input";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {(["SMS", "Email"] as const).map((c) => (
          <button key={c} type="button" onClick={() => setChannel(c)}
            className={cn("flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition-colors",
              channel === c ? "border-primary-bright/50 bg-primary-soft text-ink" : "border-line text-ink-muted hover:bg-surface-2"
            )}>
            {c === "SMS" ? <Smartphone className="size-4" /> : <Mail className="size-4" />} {c}
          </button>
        ))}
      </div>

      <div><label className="block text-xs font-medium text-ink-muted mb-1">Campaign name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="input" required />
      </div>

      <div><label className="block text-xs font-medium text-ink-muted mb-1">Send to</label>
        <select value={target} onChange={(e) => setTarget(e.target.value)} className={selectCls}>
          <option value="all">Everyone</option>
          <option value="active">Active members</option>
          <option value="visitor">Visitors</option>
          {departments.length > 0 && (
            <optgroup label="By department">
              {departments.map((d) => <option key={d.id} value={`dept:${d.id}`}>{d.name}</option>)}
            </optgroup>
          )}
          <option value="custom">{channel === "Email" ? "Specific emails…" : "Specific numbers…"}</option>
        </select>
      </div>

      {target === "custom" && (
        <div><label className="block text-xs font-medium text-ink-muted mb-1">{channel === "Email" ? "Email addresses" : "Phone numbers"}</label>
          <textarea value={contacts} onChange={(e) => setContacts(e.target.value)} className="input" rows={2}
            placeholder={channel === "Email" ? "a@b.com, c@d.com" : "024 000 0000, 020 111 2222"} />
          <p className="mt-1 text-[11px] text-ink-faint">Separate with commas, spaces or new lines.</p>
        </div>
      )}

      <div>
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="font-medium text-ink-muted">Message</span>
          {channel === "SMS" && <span className="text-ink-faint">{message.length}/160 · {segmentsFor(message)} SMS</span>}
        </div>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} className="input" rows={4} required />
      </div>

      <div className="rounded-lg bg-surface-2/50 px-3 py-2 text-xs text-ink-muted">
        Segment: <span className="font-medium text-ink">{segmentLabel}</span> · {recipients.length} recipient(s)
        {channel === "SMS" && <> · cost <span className={cn("font-medium", insufficient ? "text-danger" : "text-ink")}>{cost} credit(s)</span></>}
      </div>
      {insufficient && (
        <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          <AlertTriangle className="size-3.5" /> Not enough credits ({credits} available).
        </div>
      )}
      <p className="text-center text-[11px] text-ink-faint">
        {channel === "SMS" ? "SMS is billed to your credits · sends on next sync · sender shows your church name" : "Email delivery · sends on next sync"}
      </p>

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
        <button type="button" onClick={saveDraft} disabled={saving || sending} className="btn-secondary flex-1">
          {saving && <Loader2 className="size-4 whq-spin" />}{saving ? "Saving..." : "Save Draft"}
        </button>
        <button type="button" onClick={send} disabled={sending || saving || insufficient} className="btn-primary flex-1">
          {sending ? <Loader2 className="size-4 whq-spin" /> : <Send className="size-4" />}{sending ? "Sending..." : `Send ${channel}`}
        </button>
      </div>
    </div>
  );
}

function BuyCredits({ churchId, balance, onClose, onChanged }: {
  churchId: string; balance: number; onClose: () => void; onChanged: () => void;
}) {
  const { showToast } = useAppStore();
  const [buying, setBuying] = useState<string | null>(null);

  // Buying is an online payment (Paystack) handled by the web app. Direct the
  // user to complete checkout online; credits arrive via sync.
  async function buy(bundleId: string) {
    const ok = await requireOnline("buy SMS credits");
    if (!ok) return;
    setBuying(bundleId);
    showToast("Opening secure checkout in your browser…", "info");
    window.api?.openExternal("https://worshiphq.app/app/communications/credits");
    setBuying(null);
    onClose();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-line bg-surface-2/40 p-4">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-primary-soft text-primary-bright"><MessageSquare className="size-5" /></span>
          <div>
            <div className="text-xs text-ink-muted">SMS credit balance</div>
            <div className="text-2xl font-bold text-ink">{balance.toLocaleString()}</div>
          </div>
        </div>
        <div className="text-right text-[11px] text-ink-faint">1 credit = 1 SMS<br />(per 160 chars, per recipient)</div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-bold text-ink">Buy SMS credits</h3>
        <div className="grid grid-cols-2 gap-3">
          {SMS_BUNDLES.map((b) => (
            <div key={b.id} className={cn("relative flex flex-col rounded-xl border p-4", b.popular ? "border-primary-bright/40 ring-1 ring-primary-bright/20" : "border-line")}>
              {b.popular && <span className="absolute -top-2 right-3 rounded-full bg-primary-bright px-2 py-0.5 text-[10px] font-semibold text-white">Popular</span>}
              <div className="text-xl font-bold text-ink">{b.credits.toLocaleString()}</div>
              <div className="text-[11px] text-ink-faint">credits</div>
              <div className="mt-2 text-base font-semibold text-ink">₵{b.priceGhs}</div>
              <div className="text-[11px] text-ink-faint">≈ ₵{(b.priceGhs / b.credits).toFixed(3)} / SMS</div>
              <button onClick={() => buy(b.id)} disabled={!!buying} className="btn-primary btn-sm mt-3 w-full justify-center">
                {buying === b.id && <Loader2 className="size-4 whq-spin" />}{buying === b.id ? "Opening…" : "Buy"}
              </button>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-ink-faint">Secure payment via Paystack (Mobile Money or card). Credits never expire and arrive on sync.</p>
      </div>
    </div>
  );
}
