"use client";

import { useState } from "react";
import {
  Clock, CheckCircle2, Phone, Mail, Calendar, MessageSquare,
  ChevronDown, ChevronUp, Building2, Loader2, Video, MapPin,
} from "lucide-react";
import { updatePaymentRequest } from "@/app/actions/admin";
import { AdminCard } from "./admin-shell";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-400",
  scheduled: "bg-blue-500/15 text-blue-400",
  in_progress: "bg-purple-500/15 text-purple-400",
  completed: "bg-emerald-500/15 text-emerald-400",
  declined: "bg-red-500/15 text-red-400",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  scheduled: "Meeting Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
  declined: "Declined",
};

const MEETING_TYPES = [
  { value: "call", label: "Phone Call", icon: Phone },
  { value: "video", label: "Video Call", icon: Video },
  { value: "in_person", label: "In Person", icon: MapPin },
];

export function PaymentRequestsManager({ requests }: { requests: any[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const pending = requests.filter((r) => r.status === "pending");
  const active = requests.filter((r) => ["scheduled", "in_progress"].includes(r.status));
  const done = requests.filter((r) => ["completed", "declined"].includes(r.status));

  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <AdminCard className="p-4 text-center">
          <div className="text-2xl font-bold text-amber-400">{pending.length}</div>
          <div className="text-xs text-slate-400">Pending</div>
        </AdminCard>
        <AdminCard className="p-4 text-center">
          <div className="text-2xl font-bold text-blue-400">{active.length}</div>
          <div className="text-xs text-slate-400">Active</div>
        </AdminCard>
        <AdminCard className="p-4 text-center">
          <div className="text-2xl font-bold text-emerald-400">{done.filter((r) => r.status === "completed").length}</div>
          <div className="text-xs text-slate-400">Completed</div>
        </AdminCard>
        <AdminCard className="p-4 text-center">
          <div className="text-2xl font-bold text-slate-300">{requests.length}</div>
          <div className="text-xs text-slate-400">Total</div>
        </AdminCard>
      </div>

      {requests.length === 0 ? (
        <AdminCard className="py-12 text-center">
          <Building2 className="mx-auto size-8 text-slate-600" />
          <p className="mt-2 text-sm text-slate-400">No payment requests yet.</p>
        </AdminCard>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <RequestCard
              key={req.id}
              request={req}
              expanded={expandedId === req.id}
              onToggle={() => setExpandedId(expandedId === req.id ? null : req.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RequestCard({ request: req, expanded, onToggle }: {
  request: any; expanded: boolean; onToggle: () => void;
}) {
  const [saving, setSaving] = useState(false);

  async function handleUpdate(formData: FormData) {
    setSaving(true);
    await updatePaymentRequest(req.id, formData);
    setSaving(false);
  }

  return (
    <AdminCard className="overflow-hidden">
      <button onClick={onToggle} className="flex w-full items-center gap-4 p-4 text-left">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Building2 className="size-4 text-teal-400 flex-shrink-0" />
            <span className="font-medium text-slate-100 truncate">{req.church?.name || "Unknown"}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_COLORS[req.status]}`}>
              {STATUS_LABELS[req.status]}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
            <span>{req.contactName}</span>
            {req.contactPhone && <span className="flex items-center gap-1"><Phone className="size-3" />{req.contactPhone}</span>}
            {req.contactEmail && <span className="flex items-center gap-1"><Mail className="size-3" />{req.contactEmail}</span>}
            <span className="flex items-center gap-1"><Clock className="size-3" />{new Date(req.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
        {expanded ? <ChevronUp className="size-4 text-slate-500" /> : <ChevronDown className="size-4 text-slate-500" />}
      </button>

      {expanded && (
        <form action={handleUpdate} className="border-t border-slate-700/50 p-4 space-y-4">
          {req.needs && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Church&apos;s Needs</label>
              <p className="rounded-lg bg-slate-800/50 p-3 text-sm text-slate-200">{req.needs}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Status</label>
              <select name="status" defaultValue={req.status} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200">
                <option value="pending">Pending</option>
                <option value="scheduled">Meeting Scheduled</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="declined">Declined</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Meeting Type</label>
              <select name="meetingType" defaultValue={req.meetingType || ""} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200">
                <option value="">—</option>
                {MEETING_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Meeting Date</label>
              <input
                type="datetime-local" name="meetingDate"
                defaultValue={req.meetingDate ? new Date(req.meetingDate).toISOString().slice(0, 16) : ""}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Paystack Sub-account ID</label>
              <input name="paystackSubId" defaultValue={req.paystackSubId || ""} placeholder="ACCT_xxx"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">USSD Code</label>
              <input name="ussdCode" defaultValue={req.ussdCode || ""} placeholder="*713*xxx#"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Payment Portal URL</label>
              <input name="portalUrl" defaultValue={req.portalUrl || ""} placeholder="https://paystack.com/pay/xxx"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Admin Notes</label>
            <textarea name="adminNotes" defaultValue={req.adminNotes || ""} rows={3} placeholder="Internal notes..."
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 resize-y" />
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-400 disabled:opacity-50">
              {saving && <Loader2 className="size-4 animate-spin" />}
              {saving ? "Saving..." : "Update Request"}
            </button>
          </div>
        </form>
      )}
    </AdminCard>
  );
}
