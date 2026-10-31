"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Fingerprint, X, Loader2, Download, CheckCircle2, UserX, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MemberAvatar } from "@/components/ui/member-avatar";

const AGENT_URL = "http://localhost:23847";

type Person = { name: string; personId: string; photoUrl: string | null; gender: string | null };
type Welcome = Person & { alreadyIn?: boolean; category?: string; serviceName?: string };

/**
 * Hands-free biometric check-in. Opens once, then keeps scanning: each finger
 * → match → record → a big welcoming photo → added to the live list, then it
 * automatically waits for the next person. No page reloads, no per-person
 * button - every check-in is persisted server-side before moving on.
 */
export function BiometricCheckInSession({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const router = useRouter();
  const [phase, setPhase] = useState<"connecting" | "no-agent" | "scanning" | "welcome" | "unknown">("connecting");
  const [welcome, setWelcome] = useState<Welcome | null>(null);
  const [list, setList] = useState<Welcome[]>([]);
  const [hint, setHint] = useState("Looking for your scanner…");

  const running = useRef(true);
  const galleryLoaded = useRef(false);
  const galleryRef = useRef<{ personId: string; personName: string; templateData: string }[]>([]);

  const close = () => {
    running.current = false;
    router.refresh();
    onClose();
  };

  useEffect(() => {
    running.current = true;
    (async () => {
      let status: { connected?: boolean } | null = null;
      for (let i = 0; i < 3 && !status; i++) {
        try { const r = await fetch(`${AGENT_URL}/status`, { signal: AbortSignal.timeout(3000) }); if (r.ok) status = await r.json(); } catch { /* retry */ }
        if (!status) await wait(500);
      }
      if (!status) { setPhase("no-agent"); return; }
      if (!status.connected) { setPhase("no-agent"); return; }

      try {
        const t = await fetch("/api/biometric/templates").then((r) => r.json());
        const templates = t.templates ?? [];
        if (templates.length === 0) {
          setPhase("unknown"); setHint("No fingerprints registered yet. Register members first.");
          return;
        }
        galleryRef.current = templates;
        const galRes = await fetch(`${AGENT_URL}/gallery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templates }),
        }).catch(() => null);
        galleryLoaded.current = galRes?.ok === true;
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

        const matchBody = galleryLoaded.current
          ? { probe: cap.template }
          : { probe: cap.template, gallery: galleryRef.current };
        const matchUrl = galleryLoaded.current ? `${AGENT_URL}/match-probe` : `${AGENT_URL}/match`;
        const match = await fetch(matchUrl, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(matchBody),
          signal: AbortSignal.timeout(15000),
        }).then((r) => r.json());
        if (!running.current) return;

        if (!match.matched) {
          setPhase("unknown"); setHint("Fingerprint not recognized - try again.");
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
          setPhase("unknown"); setHint(res.message || "Check-in failed - try again.");
          await wait(1600);
        }
      } catch {
        // capture timed out or agent hiccuped - just loop again
        if (!running.current) return;
      }
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="flex max-h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line p-4">
          <div className="flex items-center gap-2">
            <Fingerprint className="size-7 text-primary" />
            <h3 className="font-display text-2xl font-semibold">Fingerprint check-in</h3>
          </div>
          <button onClick={close} className="rounded-lg p-1.5 text-ink-faint hover:bg-surface-2"><X className="size-6" /></button>
        </div>

        <div className="grid min-h-0 flex-1 place-items-center overflow-y-auto p-6 text-center" style={{ minHeight: "min(62vh, 36rem)" }}>
          {phase === "connecting" && (
            <><Loader2 className="size-14 animate-spin text-ink-faint" /><p className="mt-4 text-xl text-ink-muted">{hint}</p></>
          )}

          {phase === "no-agent" && (
            <>
              <div className="grid size-32 place-items-center rounded-full bg-warning/10"><Fingerprint className="size-16 text-warning" /></div>
              <h4 className="mt-4 text-3xl font-semibold">Scanner not found</h4>
              <p className="mt-2 text-lg text-ink-muted">Plug in the reader and install the one-time setup.</p>
              <a href="/scanner-agent/WorshipHQ-Scanner-Setup.exe" download className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 text-[1rem]/6 font-medium text-white">
                <Download className="size-5" /> Download installer
              </a>
            </>
          )}

          {phase === "scanning" && (
            <>
              <div className="relative grid size-56 place-items-center">
                <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
                <div className="grid size-48 place-items-center rounded-full bg-primary/10"><Fingerprint className="size-24 text-primary" /></div>
              </div>
              <p className="mt-6 font-display text-4xl font-semibold text-ink">{hint}</p>
              <p className="mt-2 text-xl text-ink-faint">Ready for the next person…</p>
            </>
          )}

          {phase === "welcome" && welcome && (
            <div className="animate-fade-up">
              <div className="mx-auto" style={{ width: "min(40vh, 28rem)", height: "min(40vh, 28rem)" }}>
                <MemberAvatar name={welcome.name} photoUrl={welcome.photoUrl} gender={welcome.gender} size="xl" className="!size-full ring-8 ring-success/40 [&_svg]:!size-full" />
              </div>
              <div className="mt-4 flex items-center justify-center gap-2 text-success">
                <CheckCircle2 className="size-9" />
                <span className="text-3xl font-semibold">{welcome.alreadyIn ? "Already checked in" : "Welcome!"}</span>
              </div>
              <h4 className="mt-2 font-display text-5xl font-bold sm:text-6xl">{welcome.name}</h4>
              {welcome.category && !welcome.alreadyIn && <p className="mt-1 text-lg capitalize text-ink-faint">{welcome.category}</p>}
              {welcome.serviceName && <p className="mt-2 text-2xl font-medium text-primary-bright">{welcome.serviceName}</p>}
            </div>
          )}

          {phase === "unknown" && (
            <>
              <div className="grid size-40 place-items-center rounded-full bg-danger/10"><UserX className="size-20 text-danger" /></div>
              <p className="mt-5 font-display text-3xl font-semibold text-ink-muted">{hint}</p>
            </>
          )}
        </div>

        {/* Live checked-in list */}
        <div className="border-t border-line p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-faint">
            <Users className="size-4" /> Checked in this session ({list.length})
          </div>
          {list.length === 0 ? (
            <p className="text-[1rem]/6 text-ink-faint">No-one yet - start scanning.</p>
          ) : (
            <ul className="flex max-h-36 flex-wrap gap-2 overflow-y-auto overscroll-contain">
              {list.map((p, i) => (
                <li key={p.personId + i} className="flex items-center gap-2 rounded-full border border-line bg-base py-1 pl-1 pr-3 text-sm">
                  <MemberAvatar name={p.name} photoUrl={p.photoUrl} gender={p.gender} size="sm" />
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
    </div>,
    document.body,
  );
}

function wait(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
