"use client";

import { useState, useTransition } from "react";
import { Search, UserPlus, X, Check, ScanLine, Loader2 } from "lucide-react";
import { MemberAvatar } from "@/components/ui/member-avatar";
import { QrCode } from "@/components/ui/qr-code";
import { QrScanner } from "@/components/app/qr-scanner";
import { BiometricCheckInButton } from "@/components/app/biometric-checkin";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { checkInMember, checkInByMemberId, undoCheckIn } from "@/app/actions/attendance";

interface Candidate {
  id: string;
  name: string;
  gender: string | null;
  status: string;
}
interface Attendee {
  id: string;
  name: string;
  gender: string | null;
  category: string;
  method: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  adult: "Adult",
  teen: "Teen",
  child: "Child",
  visitor: "Visitor",
};

export function CheckInPanel({
  sessionId,
  candidates,
  attendees,
  checkInUrl,
  canWrite,
}: {
  sessionId: string;
  candidates: Candidate[];
  attendees: Attendee[];
  checkInUrl: string;
  canWrite: boolean;
}) {
  const [q, setQ] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [pending, start] = useTransition();
  const { toast } = useFeedback();

  function handleScan(value: string) {
    start(async () => {
      const res = await checkInByMemberId(sessionId, value);
      toast(res.name ? `${res.name} · ${res.message}` : res.message, res.ok ? "success" : "error");
    });
  }

  const filtered = q
    ? candidates.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8)
    : [];

  function check(c: Candidate) {
    start(async () => {
      await checkInMember(sessionId, c.id);
      toast(`${c.name} checked in`, "success");
      setQ("");
    });
  }

  function undo(a: Attendee) {
    start(async () => {
      await undoCheckIn(a.id);
      toast(`${a.name} removed`, "info");
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Check-in by name */}
      <div className="rounded-2xl border border-line bg-surface p-5 lg:col-span-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-semibold">Check in members</h3>
            <p className="text-sm text-ink-muted">Check in by name, QR code, or fingerprint scan.</p>
          </div>
          {canWrite && (
            <div className="flex gap-2">
              <BiometricCheckInButton
                sessionId={sessionId}
                onCheckedIn={(name, msg) => {
                  toast(`${name} · ${msg}`, "success");
                  window.location.reload();
                }}
              />
              <Button variant="secondary" size="sm" onClick={() => setScanOpen(true)}>
                <ScanLine className="size-4" /> Scan QR
              </Button>
            </div>
          )}
        </div>

        {canWrite ? (
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Start typing a name…"
              className="h-11 w-full rounded-xl border border-line bg-base pl-10 pr-3 text-sm focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            />
            {filtered.length > 0 && (
              <div className="absolute z-10 mt-1.5 w-full overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
                {filtered.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => check(c)}
                    disabled={pending}
                    className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-surface-2 disabled:opacity-50"
                  >
                    <MemberAvatar name={c.name} gender={c.gender} size="sm" />
                    <span className="flex-1 font-medium">{c.name}</span>
                    {c.status === "visitor" && <span className="text-xs text-gold">visitor</span>}
                    <UserPlus className="size-4 text-primary-bright" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-line p-4 text-sm text-ink-faint">Read-only demo — check-in disabled.</p>
        )}

        {/* Present list */}
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-ink">Present <span className="text-ink-faint">({attendees.length})</span></h4>
          </div>
          {attendees.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink-faint">
              No-one checked in by name yet. Use the search above or the QR code.
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {attendees.map((a) => (
                <li key={a.id} className="flex items-center gap-3 rounded-xl border border-line bg-base px-3 py-2">
                  <MemberAvatar name={a.name} gender={a.gender} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{a.name}</div>
                    <div className="text-[11px] text-ink-faint">
                      {CATEGORY_LABEL[a.category] ?? a.category}
                      {a.method === "self" ? " · self check-in" : ""}
                    </div>
                  </div>
                  {canWrite && (
                    <button onClick={() => undo(a)} disabled={pending} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger disabled:pointer-events-none">
                      {pending ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* QR self check-in */}
      <div className="rounded-2xl border border-line bg-surface p-5 text-center">
        <h3 className="font-display text-lg font-semibold">Self check-in</h3>
        <p className="mt-1 text-sm text-ink-muted">Members scan to check themselves in.</p>
        <div className="mt-4 flex justify-center">
          <QrCode value={checkInUrl} size={170} />
        </div>
        <div className="mt-4 flex items-center gap-2">
          <input readOnly value={checkInUrl} className="min-w-0 flex-1 rounded-lg border border-line bg-base px-2.5 py-2 font-mono text-[11px] text-ink-muted" />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              navigator.clipboard.writeText(checkInUrl);
              toast("Link copied", "success");
            }}
          >
            <Check className="size-4" /> Copy
          </Button>
        </div>
      </div>

      {scanOpen && <QrScanner onScan={handleScan} onClose={() => setScanOpen(false)} />}
    </div>
  );
}
