"use client";

import { useRef, useState, useTransition } from "react";
import { Search, UserPlus, X, Check, ScanLine, Loader2 } from "lucide-react";
import { MemberAvatar } from "@/components/ui/member-avatar";
import { QrCode } from "@/components/ui/qr-code";
import { QrScanner } from "@/components/app/qr-scanner";
import { BiometricCheckInButton } from "@/components/app/biometric-checkin";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { checkInMember, checkInByMemberId, undoCheckIn } from "@/app/actions/attendance";
import { cn } from "@/lib/utils";

interface Candidate {
  id: string;
  name: string;
  gender: string | null;
  photoUrl?: string | null;
  status: string;
  checkedIn?: boolean;
}
interface Attendee {
  id: string;
  name: string;
  gender: string | null;
  photoUrl?: string | null;
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
  const [scanning, start] = useTransition();
  const { toast } = useFeedback();

  // Per-row state so one check-in never freezes the rest of the queue.
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());     // request in flight
  const [justDone, setJustDone] = useState<Set<string>>(new Set());   // plays the pop once
  const [optimisticIn, setOptimisticIn] = useState<Set<string>>(new Set());
  const [extraAttendees, setExtraAttendees] = useState<Attendee[]>([]);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);

  const addTo = (set: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) =>
    set((prev) => new Set(prev).add(id));
  const removeFrom = (set: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) =>
    set((prev) => { const n = new Set(prev); n.delete(id); return n; });

  function handleScan(value: string) {
    start(async () => {
      const res = await checkInByMemberId(sessionId, value);
      toast(res.name ? `${res.name} · ${res.message}` : res.message, res.ok ? "success" : "error");
    });
  }

  const isIn = (c: Candidate) => Boolean(c.checkedIn) || optimisticIn.has(c.id);

  const filtered = q
    ? candidates.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8)
    : [];

  /**
   * Optimistic check-in: the row turns green instantly and only that row
   * spins. The operator can keep typing the next name straight away — the
   * server call finishes in the background.
   */
  async function check(c: Candidate) {
    if (isIn(c) || busyIds.has(c.id)) return;

    addTo(setOptimisticIn, c.id);
    addTo(setBusyIds, c.id);
    addTo(setJustDone, c.id);
    setTimeout(() => removeFrom(setJustDone, c.id), 600);

    // Show them in Present immediately.
    const tempId = `optimistic-${c.id}`;
    setExtraAttendees((prev) => [
      { id: tempId, name: c.name, gender: c.gender, photoUrl: c.photoUrl, category: "adult", method: "manual" },
      ...prev,
    ]);

    try {
      const res = await checkInMember(sessionId, c.id);
      if (res && res.ok) {
        setExtraAttendees((prev) =>
          prev.map((a) => (a.id === tempId ? { ...a, id: res.recordId, category: res.category ?? a.category } : a)),
        );
      } else if (res && res.reason === "already") {
        setExtraAttendees((prev) => prev.filter((a) => a.id !== tempId));
      } else {
        throw new Error("check-in failed");
      }
    } catch {
      removeFrom(setOptimisticIn, c.id);
      setExtraAttendees((prev) => prev.filter((a) => a.id !== tempId));
      toast(`Couldn't check in ${c.name} — please try again`, "error");
    } finally {
      removeFrom(setBusyIds, c.id);
    }

    // Clear the box and refocus so the next name can be typed immediately.
    setQ("");
    searchRef.current?.focus();
  }

  async function undo(a: Attendee) {
    if (busyIds.has(a.id)) return;
    addTo(setBusyIds, a.id);
    addTo(setRemovedIds, a.id);
    try {
      const res = await undoCheckIn(a.id);
      if (res && res.ok && res.personId) removeFrom(setOptimisticIn, res.personId);
      setExtraAttendees((prev) => prev.filter((x) => x.id !== a.id));
      toast(`${a.name} removed`, "info");
    } catch {
      removeFrom(setRemovedIds, a.id);
      toast(`Couldn't remove ${a.name}`, "error");
    } finally {
      removeFrom(setBusyIds, a.id);
    }
  }

  const visibleAttendees = [...extraAttendees, ...attendees].filter((a) => !removedIds.has(a.id));

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
              <Button variant="secondary" size="sm" onClick={() => setScanOpen(true)} disabled={scanning}>
                {scanning ? <Loader2 className="size-4 animate-spin" /> : <ScanLine className="size-4" />}
                {scanning ? "Checking in…" : "Scan QR"}
              </Button>
            </div>
          )}
        </div>

        {canWrite ? (
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Start typing a name…"
              className="h-11 w-full rounded-xl border border-line bg-base pl-10 pr-3 text-sm focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            />
            {filtered.length > 0 && (
              <div className="absolute z-10 mt-1.5 w-full overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
                {filtered.map((c) => {
                  const already = isIn(c);
                  const busy = busyIds.has(c.id);
                  const popping = justDone.has(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => check(c)}
                      disabled={already}
                      className={cn(
                        "flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-sm",
                        already
                          ? "cursor-default bg-success/5"
                          : "transition-colors hover:bg-surface-2",
                        popping && "whq-checkin-pop",
                      )}
                    >
                      <MemberAvatar name={c.name} photoUrl={c.photoUrl} gender={c.gender} size="sm" />
                      <span className={cn("flex-1 font-medium", already && "text-ink-muted")}>{c.name}</span>
                      {c.status === "visitor" && !already && <span className="text-xs text-gold">visitor</span>}
                      {busy ? (
                        <Loader2 className="size-4 shrink-0 animate-spin text-success" />
                      ) : already ? (
                        <span className={cn("flex items-center gap-1 text-xs font-semibold text-success", popping && "whq-checkin-tick")}>
                          <Check className="size-3.5" /> Checked in
                        </span>
                      ) : (
                        <UserPlus className="size-4 text-primary-bright" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-line p-4 text-sm text-ink-faint">Read-only demo — check-in disabled.</p>
        )}

        {/* Present list */}
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-ink">Present <span className="text-ink-faint">({visibleAttendees.length})</span></h4>
          </div>
          {visibleAttendees.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink-faint">
              No-one checked in by name yet. Use the search above or the QR code.
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {visibleAttendees.map((a) => (
                <li key={a.id} className="flex items-center gap-3 rounded-xl border border-line bg-base px-3 py-2">
                  <MemberAvatar name={a.name} photoUrl={a.photoUrl} gender={a.gender} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{a.name}</div>
                    <div className="text-[11px] text-ink-faint">
                      {CATEGORY_LABEL[a.category] ?? a.category}
                      {a.method === "self" ? " · self check-in" : ""}
                    </div>
                  </div>
                  {canWrite && (
                    <button onClick={() => undo(a)} disabled={busyIds.has(a.id)} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger disabled:pointer-events-none">
                      {busyIds.has(a.id) ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
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
