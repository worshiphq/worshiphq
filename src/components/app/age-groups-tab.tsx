"use client";

import { useEffect, useRef, useState } from "react";
import { Baby, Loader2, Check, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useFeedback } from "@/components/ui/feedback";
import { getAgeSettings, previewAgeSettings, saveAgeSettings, type AgeSettings } from "@/app/actions/age-groups";
import { DEFAULT_AGE_CONFIG, type AgeConfig } from "@/lib/age";
import { cn } from "@/lib/utils";

const NAMES: Record<string, string> = { child: "Children", teen: "Teens", adult: "Adults" };

/** Settings, Age groups: where children end and teens end, an optional Youth band, and moving people up automatically. */
export function AgeGroupsTab({ canManage }: { canManage: boolean }) {
  const { toast } = useFeedback();
  const [saved, setSaved] = useState<AgeConfig | null>(null);
  const [cfg, setCfg] = useState<AgeConfig>(DEFAULT_AGE_CONFIG);
  const [info, setInfo] = useState<AgeSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    getAgeSettings().then((s) => { if (live) { setFailed(false); setSaved(s.config); setCfg(s.config); setInfo(s); } }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [attempt]);

  // Show who a change would move before it is saved.
  useEffect(() => {
    if (!saved) return;
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      const s = await previewAgeSettings(cfg);
      if (mine === seq.current) setInfo(s);
    }, 300);
    return () => clearTimeout(t);
  }, [cfg, saved]);

  if (failed && (!saved || !info)) return <Card className="flex items-center justify-between gap-2 p-6 text-sm text-ink-muted">We could not load this. <Button size="sm" variant="secondary" onClick={() => { setFailed(false); setAttempt((n) => n + 1); }}>Try again</Button></Card>;
  if (!saved || !info) return <Card className="flex items-center gap-2 p-6 text-sm text-ink-muted"><Loader2 className="size-4 animate-spin" /> Loading…</Card>;

  const dirty = JSON.stringify(cfg) !== JSON.stringify(saved);
  const num = (v: string, fallback: number) => (v === "" ? fallback : Number(v.replace(/\D/g, "")) || fallback);

  async function save() {
    setBusy(true);
    const r = await saveAgeSettings(cfg);
    setBusy(false);
    if (r.ok) {
      toast(r.moved > 0 ? `Saved. ${r.moved} ${r.moved === 1 ? "person was" : "people were"} moved up a group.` : "Saved.", "success");
      setSaved(cfg);
    } else toast(r.error, "error");
  }

  const band = (label: string, range: string, tone: string) => (
    <div className={cn("flex-1 rounded-xl border p-3 text-center", tone)}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-0.5 font-display text-lg font-bold">{range}</div>
    </div>
  );

  return (
    <Card className="p-6">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Baby className="size-5" /></div>
        <div>
          <h3 className="font-display text-lg font-semibold">Age groups</h3>
          <p className="mt-0.5 max-w-2xl text-sm text-ink-muted">
            Say where children end and teens end for your church, and add a Youth group if you have one. These ages are used for the People tabs,
            attendance counts and check-in. This only changes which group someone is counted in. It does not move anyone out of a branch or into the main church.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <div><Label>Children are up to age</Label><Input inputMode="numeric" value={cfg.childMax} disabled={!canManage} onChange={(e) => setCfg({ ...cfg, childMax: num(e.target.value, cfg.childMax) })} /></div>
        <div><Label>Teens are up to age</Label><Input inputMode="numeric" value={cfg.teenMax} disabled={!canManage} onChange={(e) => setCfg({ ...cfg, teenMax: num(e.target.value, cfg.teenMax) })} /></div>
        <div><Label>Youth are up to age</Label><Input inputMode="numeric" value={cfg.youthMax} disabled={!canManage || !cfg.youthOn} onChange={(e) => setCfg({ ...cfg, youthMax: num(e.target.value, cfg.youthMax) })} /></div>
      </div>

      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3">
        <input type="checkbox" checked={cfg.youthOn} onChange={(e) => setCfg({ ...cfg, youthOn: e.target.checked })} disabled={!canManage} className="mt-0.5 size-4 accent-primary" />
        <span className="text-sm">
          <span className="font-semibold">Have a youth group among the adults</span>
          <span className="mt-0.5 block text-xs text-ink-muted">Adults above the teen age and up to the youth age show under a People filter with this name.</span>
          {cfg.youthOn && (
            <span className="mt-2 block">
              <span className="text-xs font-medium text-ink-muted">What do you call it?</span>
              <input value={cfg.youthLabel} onChange={(e) => setCfg({ ...cfg, youthLabel: e.target.value })} disabled={!canManage} placeholder="Youth" className="mt-1 block h-9 w-56 rounded-lg border border-line bg-surface px-3 text-sm" />
            </span>
          )}
        </span>
      </label>

      <div className="mt-5 flex flex-wrap gap-2">
        {band("Children", `0 to ${cfg.childMax}`, "border-info/30 bg-info/10 text-info")}
        {band("Teens", `${cfg.childMax + 1} to ${cfg.teenMax}`, "border-gold/30 bg-gold/10 text-gold")}
        {cfg.youthOn && band(cfg.youthLabel || "Youth", `${cfg.teenMax + 1} to ${cfg.youthMax}`, "border-primary/30 bg-primary/10 text-primary")}
        {band("Adults", `${cfg.youthOn ? cfg.youthMax + 1 : cfg.teenMax + 1} and over`, "border-success/30 bg-success/10 text-success")}
      </div>
      {cfg.youthOn && <p className="mt-2 text-xs text-ink-faint">{info.youthCount} adult{info.youthCount === 1 ? "" : "s"} with a date of birth fall in the {cfg.youthLabel || "Youth"} group today.</p>}

      <div className="mt-5 rounded-xl border border-line p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" checked={cfg.autoOn} onChange={(e) => setCfg({ ...cfg, autoOn: e.target.checked })} disabled={!canManage} className="mt-0.5 size-4 accent-primary" />
          <span className="text-sm">
            <span className="font-semibold">Move people up a group automatically</span>
            <span className="mt-0.5 block text-xs text-ink-muted">Every day, a child who passes the children age moves to Teens, and a teen who passes the teen age moves to Adults, using their date of birth. People with no date of birth are left alone, and nobody is ever moved down.</span>
          </span>
        </label>
        {info.pendingTotal > 0 && (
          <div className="mt-3 rounded-lg bg-surface-2 p-3 text-sm">
            <p className="font-medium">{info.pendingTotal} {info.pendingTotal === 1 ? "person is" : "people are"} already past their group{cfg.autoOn ? " and will be moved when you save" : ""}:</p>
            <ul className="mt-1.5 space-y-0.5 text-xs text-ink-muted">
              {info.pending.map((m, i) => (
                <li key={i} className="flex items-center gap-1.5">{m.name}, {m.age}<span className="text-ink-faint">·</span>{NAMES[m.from]} <ArrowRight className="size-3" /> {NAMES[m.to]}</li>
              ))}
              {info.pendingTotal > info.pending.length && <li>and {info.pendingTotal - info.pending.length} more</li>}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-5">
        <Button onClick={save} disabled={!canManage || busy || !dirty}>
          {busy ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : <><Check className="size-4" /> Save age groups</>}
        </Button>
      </div>
    </Card>
  );
}
