"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Fingerprint, X, Loader2, Download, CheckCircle2, UserX, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MemberAvatar } from "@/components/ui/member-avatar";

const AGENT_URL = "http://localhost:23847";

type Person = { name: string; personId: string; photoUrl: string | null; gender: string | null };
type Welcome = Person & { alreadyIn?: boolean; category?: string };

/**
 * Hands-free biometric check-in. Opens once, then keeps scanning: each finger
 * → match → record → a big welcoming photo → added to the live list, then it
 * automatically waits for the next person. No page reloads, no per-person
 * button — every check-in is persisted server-side before moving on.
 */
export function BiometricCheckInSession({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const router = useRouter();
  const [phase, setPhase] = useState<"connecting" | "no-agent" | "scanning" | "welcome" | "unknown">("connecting");
  const [welcome, setWelcome] = useState<Welcome | null>(null);
  const [list, setList] = useState<Welcome[]>([]);
  const [hint, setHint] = useState("Looking for your scanner…");

  const running = useRef(true);
  const gallery = useRef<{ personId: string; personName: string; templateData: string }[]>([]);

  const close = () => {
    running.current = false;
    router.refresh(); // sync the Present list from the DB
    onClose();
  };

  useEffect(() => {
    running.current = true;
    (async () => {
      // 1) Is the agent there and on a real scanner?
      try {
        const s = await fetch(`${AGENT_URL}/status`, { signal: AbortSignal.timeout(2500) }).then((r) => r.json());
        if (!s.connected) { setPhase("no-agent"); return; }
      } catch { setPhase("no-agent"); return; }

      // 2) Load the fingerprint gallery once.
      try {
        const t = await fetch("/api/biometric/templates").then((r) => r.json());
        gallery.current = t.templates ?? [];
        if (gallery.current.length === 0) {
          setPhase("unknown"); setHint("No fingerprints registered yet. Register members first.");
          return;
        }
      } catch { setPhase("no-agent"); return; }

      loop();
    })();
    return () => { running.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loop() {
    while (running.current) {
      setPhase("scanning");
      setHint("Place finger on the scanner…");
      try {
        const capRes = await fetch(`${AGENT_URL}/capture`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
          signal: AbortSignal.timeout(30000),
        });
        const cap = await capRes.json();
        if (!running.current) return;
        if (cap.error || !cap.template) { continue; } // no finger yet → keep waiting

        const match = await fetch(`${AGENT_URL}/match`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ probe: cap.template, gallery: gallery.current }),
          signal: AbortSignal.timeout(15000),
        }).then((r) => r.json());
        if (!running.current) return;

        if (!match.matched) {
          setPhase("unknown"); setHint("Fingerprint not recognized — try again.");
          await wait(1600);
          continue;
        }

        const res = await fetch("/api/biometric/checkin", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ personId: match.personId, sessionId }),
        }).then((r) => r.json());
        if (!running.current) return;

        if (res.ok) {
          setWelcome(res);
          setPhase("welcome");
          if (!res.alreadyIn) setList((prev) => [res, ...prev]);
          await wait(2600); // let them see the welcome
        } else {
          setPhase("unknown"); setHint(res.message || "Check-in failed — try again.");
          await wait(1600);
        }
      } catch {
        // capture timed out or agent hiccuped — just loop again
        if (!running.current) return;
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line p-4">
          <div className="flex items-center gap-2">
            <Fingerprint className="size-5 text-primary" />
            <h3 className="font-display text-lg font-semibold">Fingerprint check-in</h3>
          </div>
          <button onClick={close} className="rounded-lg p-1 text-ink-faint hover:bg-surface-2"><X className="size-5" /></button>
        </div>

        <div className="grid place-items-center p-6 text-center" style={{ minHeight: 260 }}>
          {phase === "connecting" && (
            <><Loader2 className="size-8 animate-spin text-ink-faint" /><p className="mt-3 text-sm text-ink-muted">{hint}</p></>
          )}

          {phase === "no-agent" && (
            <>
              <div className="grid size-20 place-items-center rounded-full bg-warning/10"><Fingerprint className="size-10 text-warning" /></div>
              <h4 className="mt-3 font-semibold">Scanner not found</h4>
              <p className="mt-1 text-sm text-ink-muted">Plug in the reader and install the one-time setup.</p>
              <a href="/scanner-agent/whq-scanner-setup.bat" download className="mt-3 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white">
                <Download className="size-4" /> Download installer
              </a>
            </>
          )}

          {phase === "scanning" && (
            <>
              <div className="relative grid size-28 place-items-center">
                <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
                <div className="grid size-24 place-items-center rounded-full bg-primary/10"><Fingerprint className="size-12 text-primary" /></div>
              </div>
              <p className="mt-4 text-sm font-medium text-ink">{hint}</p>
              <p className="mt-1 text-xs text-ink-faint">Ready for the next person…</p>
            </>
          )}

          {phase === "welcome" && welcome && (
            <div className="animate-fade-up">
              <MemberAvatar name={welcome.name} photoUrl={welcome.photoUrl} gender={welcome.gender} size="xl" className="mx-auto ring-4 ring-success/40" />
              <div className="mt-3 flex items-center justify-center gap-1.5 text-success">
                <CheckCircle2 className="size-5" />
                <span className="text-sm font-semibold">{welcome.alreadyIn ? "Already checked in" : "Welcome!"}</span>
              </div>
              <h4 className="mt-1 font-display text-2xl font-bold">{welcome.name}</h4>
              {welcome.category && !welcome.alreadyIn && <p className="text-xs capitalize text-ink-faint">{welcome.category}</p>}
            </div>
          )}

          {phase === "unknown" && (
            <>
              <div className="grid size-20 place-items-center rounded-full bg-danger/10"><UserX className="size-10 text-danger" /></div>
              <p className="mt-3 text-sm text-ink-muted">{hint}</p>
            </>
          )}
        </div>

        {/* Live checked-in list */}
        <div className="border-t border-line p-4">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            <Users className="size-3.5" /> Checked in this session ({list.length})
          </div>
          {list.length === 0 ? (
            <p className="text-xs text-ink-faint">No-one yet — start scanning.</p>
          ) : (
            <ul className="flex max-h-32 flex-wrap gap-2 overflow-y-auto">
              {list.map((p, i) => (
                <li key={p.personId + i} className="flex items-center gap-1.5 rounded-full border border-line bg-base py-1 pl-1 pr-2.5 text-xs">
                  <MemberAvatar name={p.name} photoUrl={p.photoUrl} gender={p.gender} size="xs" />
                  <span className="font-medium">{p.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end border-t border-line p-3">
          <Button size="sm" onClick={close}>Done</Button>
        </div>
      </div>
    </div>
  );
}

function wait(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
