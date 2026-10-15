"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Droplets, Plus, Printer, Search, Trash2, Check, Loader2, CalendarDays, Pencil, Palette, UserPlus, ListChecks } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useFeedback } from "@/components/ui/feedback";
import {
  addCandidates, addBaptismRecord, scheduleCandidates, markBaptised, updateBaptism, deleteBaptism, saveCertSettings, deleteCertificateTemplate, searchBaptismPeople,
  type BaptismData, type BaptismRow, type CertSettings,
} from "@/app/actions/baptisms";
import { BUILT_IN, SAMPLE, type CertCtx, type CertData } from "@/components/app/certificate";
import { ScaledCert, PrintCertificates, useCertFonts } from "@/components/app/certificate-tools";
import { CertificateDesigner } from "@/components/app/certificate-designer";
import { questionFields, type FormField } from "@/lib/forms/registration";
import { binDeleted, confirmBinDelete } from "@/lib/recycle-bin-events";
import { cn } from "@/lib/utils";

const fmt = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "");
const today = () => new Date().toISOString().slice(0, 10);

/** The baptism register: who is preparing, who has been baptised, and printable certificates. */
export function BaptismsClient({ data }: { data: BaptismData }) {
  const router = useRouter();
  const { toast } = useFeedback();
  useCertFonts();
  const [tab, setTab] = useState<"register" | "candidates">("register");
  const [year, setYear] = useState("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "record" | "schedule" | "baptise" | "print" | "designer" | { edit: BaptismRow }>(null);
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [printing, setPrinting] = useState<null | { items: CertData[]; design: string; custom: BaptismData["templates"][number] | null }>(null);

  const canWrite = data.canWrite;
  const ctx: CertCtx = { churchName: data.church.name, logoUrl: data.church.logoUrl, settings: data.settings };
  const years = useMemo(() => [...new Set(data.rows.filter((r) => r.status === "baptised" && r.date).map((r) => r.date!.slice(0, 4)))].sort().reverse(), [data.rows]);

  const rows = useMemo(() => data.rows.filter((r) => {
    if (tab === "register" ? r.status !== "baptised" : r.status !== "candidate") return false;
    if (tab === "register" && year !== "all" && !(r.date ?? "").startsWith(year)) return false;
    if (q && !`${r.name} ${r.place ?? ""} ${r.officiant ?? ""} ${r.certificateNo ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [data.rows, tab, year, q]);
  const chosen = rows.filter((r) => sel.has(r.id));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = rows.length > 0 && rows.every((r) => sel.has(r.id));

  async function act(key: string, fn: () => Promise<{ ok: boolean; error?: string } & Record<string, unknown>>, ok?: string, after?: () => void) {
    setBusy(key);
    try {
      const r = await fn();
      if (!r.ok) { toast(String(r.error ?? "Something went wrong."), "error"); return; }
      if (ok) toast(ok, "success");
      after?.();
      router.refresh();
    } catch (e) { toast((e as Error).message || "Something went wrong.", "error"); }
    finally { setBusy(null); }
  }

  function printNow(list: BaptismRow[], design: string) {
    const custom = data.templates.find((t) => t.id === design) ?? null;
    const items: CertData[] = list.map((r) => ({ name: r.name, date: fmt(r.date), place: r.place ?? "", officiant: r.officiant ?? "", certificateNo: r.certificateNo ?? "" }));
    setDialog(null);
    setPrinting({ items, design: custom ? "custom" : design, custom });
  }

  return (
    <div>
      <PageHeader title="Baptisms" description="Your baptism register, the people preparing for baptism, and certificates ready to print.">
        {data.isAdmin && <Link href="/app/settings/forms/baptism"><Button variant="secondary" size="sm" type="button"><ListChecks /> Edit the baptism form</Button></Link>}
        <Button variant="secondary" size="sm" onClick={() => setDialog("designer")} disabled={!canWrite}><Palette /> Certificate designs</Button>
        <Button size="sm" onClick={() => setDialog("record")} disabled={!canWrite}><Plus /> Add a baptism</Button>
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={`Baptised in ${new Date().getFullYear()}`} value={data.stats.thisYear} icon={Droplets} />
        <StatCard label="All time on the register" value={data.stats.total} icon={Check} />
        <StatCard label="Preparing for baptism" value={data.stats.candidates} icon={UserPlus} />
        <StatCard label="Of your members baptised" value={data.stats.membersBaptisedPct} suffix="%" icon={CalendarDays} />
      </div>

      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
          <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
            {([["register", "Register"], ["candidates", `Preparing (${data.stats.candidates})`]] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => { setTab(k); setSel(new Set()); }} className={cn("rounded-lg px-4 py-1.5 text-sm font-medium transition-colors", tab === k ? "bg-surface shadow-sm text-ink" : "text-ink-muted")}>{label}</button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-48 pl-9" /></div>
            {tab === "register" && years.length > 0 && (
              <select value={year} onChange={(e) => setYear(e.target.value)} className="h-11 rounded-xl border border-line bg-surface px-3 text-sm">
                <option value="all">All years</option>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
          </div>
        </div>

        {/* actions for the ticked people */}
        {tab === "register" && chosen.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-primary/5 px-4 py-2.5 text-sm">
            <span className="font-medium">{chosen.length} selected</span>
            <Button size="sm" onClick={() => setDialog("print")}><Printer className="size-4" /> Print certificates</Button>
          </div>
        )}
        {tab === "candidates" && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5 text-sm">
            <CandidateAdder disabled={!canWrite} onAdd={(ids, names) => act("add", () => addCandidates({ personIds: ids, names }), "Added.")} busy={busy === "add"} />
            {chosen.length > 0 && (
              <>
                <span className="ml-auto font-medium">{chosen.length} selected</span>
                <Button size="sm" variant="secondary" onClick={() => setDialog("schedule")}><CalendarDays className="size-4" /> Set date and place</Button>
                <Button size="sm" onClick={() => setDialog("baptise")}><Droplets className="size-4" /> They were baptised</Button>
              </>
            )}
          </div>
        )}

        {rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-ink-muted">
            {tab === "register" ? "No baptisms recorded yet. Choose Add a baptism, or record people who were preparing." : "Nobody is preparing for baptism. Search for a member above to add them."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                  <th className="w-10 px-4 py-2.5"><input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(rows.map((r) => r.id)))} className="size-4 accent-primary" /></th>
                  <th className="px-2 py-2.5">Name</th><th className="px-2 py-2.5">Date</th><th className="px-2 py-2.5">Place</th><th className="px-2 py-2.5">Officiant</th>
                  {tab === "register" && <th className="px-2 py-2.5">Certificate no.</th>}
                  <th className="w-24 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-2/50">
                    <td className="px-4 py-2.5"><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} className="size-4 accent-primary" /></td>
                    <td className="px-2 py-2.5 font-medium">{r.name}</td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-ink-muted">{fmt(r.date) || <span className="text-ink-faint">not set</span>}</td>
                    <td className="px-2 py-2.5 text-ink-muted">{r.place}</td>
                    <td className="px-2 py-2.5 text-ink-muted">{r.officiant}</td>
                    {tab === "register" && <td className="whitespace-nowrap px-2 py-2.5 font-mono text-xs text-ink-faint">{r.certificateNo}</td>}
                    <td className="px-2 py-2.5">
                      <div className="flex justify-end gap-0.5">
                        {tab === "register" && <button type="button" title="Print this certificate" className="rounded-md p-1.5 text-ink-faint hover:bg-surface-2 hover:text-primary" onClick={() => { setSel(new Set([r.id])); setDialog("print"); }}><Printer className="size-4" /></button>}
                        {canWrite && <button type="button" title="Edit" className="rounded-md p-1.5 text-ink-faint hover:bg-surface-2 hover:text-ink" onClick={() => setDialog({ edit: r })}><Pencil className="size-4" /></button>}
                        {canWrite && <button type="button" title="Delete" className="rounded-md p-1.5 text-ink-faint hover:bg-danger/10 hover:text-danger" onClick={() => { if (confirmBinDelete(`Delete the baptism record for ${r.name}?`)) void act(`del-${r.id}`, () => deleteBaptism(r.id), undefined, binDeleted); }}><Trash2 className="size-4" /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Add a baptism that already happened ── */}
      {dialog === "record" && <RecordDialog fields={data.formFields} onClose={() => setDialog(null)} busy={busy === "record"} onSave={(v) => act("record", () => addBaptismRecord(v), "Recorded.", () => setDialog(null))} />}

      {dialog === "schedule" && (
        <DetailsDialog title="Set the date and place" cta="Save" bulk fields={data.formFields} busy={busy === "sched"} defaultDate="" onClose={() => setDialog(null)}
          onSave={(v) => act("sched", () => scheduleCandidates(chosen.map((c) => c.id), v), "Saved.", () => { setDialog(null); setSel(new Set()); })} />
      )}
      {dialog === "baptise" && (
        <DetailsDialog title={`${chosen.length} baptised`} intro="They go onto the register with a certificate number, and their member record is marked as baptised." cta="Record the baptism" bulk fields={data.formFields} busy={busy === "bap"} defaultDate={today()}
          defaults={{ place: chosen[0]?.place ?? "", officiant: chosen[0]?.officiant ?? "" }} onClose={() => setDialog(null)}
          onSave={(v) => act("bap", () => markBaptised(chosen.map((c) => c.id), v), "Recorded. You can print their certificates from the Register.", () => { setDialog(null); setSel(new Set()); setTab("register"); })} />
      )}
      {typeof dialog === "object" && dialog && "edit" in dialog && (
        <DetailsDialog title={`Edit ${dialog.edit.name}`} cta="Save" fields={data.formFields} busy={busy === "edit"} defaultDate={dialog.edit.date ?? ""} defaults={{ place: dialog.edit.place ?? "", officiant: dialog.edit.officiant ?? "", notes: dialog.edit.notes ?? "", extra: Object.fromEntries(dialog.edit.extra.map((x) => [x.id, x.value])) }} onClose={() => setDialog(null)}
          onSave={(v) => act("edit", () => updateBaptism((dialog as { edit: BaptismRow }).edit.id, v), "Saved.", () => setDialog(null))} />
      )}

      {/* ── Print ── */}
      {dialog === "print" && (
        <PrintDialog rows={chosen} ctx={ctx} data={data} onClose={() => setDialog(null)} onPrint={printNow}
          onSaveSettings={(s) => act("settings", () => saveCertSettings(s))} onEditTemplate={(id) => { setEditingTemplate(id); setDialog("designer"); }} />
      )}
      {printing && <PrintCertificates items={printing.items} design={printing.design} custom={printing.custom} ctx={ctx} onDone={() => setPrinting(null)} />}

      {/* ── Own design ── */}
      {dialog === "designer" && (
        <Modal open onClose={() => { setDialog(null); setEditingTemplate(null); }} title="Your own certificate design" wide>
          <DesignList data={data} ctx={ctx} onNew={() => setEditingTemplate("new")} onEdit={(id) => setEditingTemplate(id)} editing={editingTemplate}
            onDelete={(id) => { if (window.confirm("Delete this design?")) void act("deltpl", () => deleteCertificateTemplate(id), "Deleted.", () => setEditingTemplate(null)); }}
            onSaved={() => { setEditingTemplate(null); router.refresh(); }} onClose={() => { setDialog(null); setEditingTemplate(null); }} />
        </Modal>
      )}
    </div>
  );
}

/* ───────────────────────── pieces ───────────────────────── */

function CandidateAdder({ onAdd, busy, disabled }: { onAdd: (ids: string[], names: string[]) => void; busy: boolean; disabled: boolean }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ id: string; name: string; phone: string | null; baptized: boolean | null }[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) return;
    let live = true;
    const t = setTimeout(async () => { const r = await searchBaptismPeople(q); if (live) setFound(r); }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [q]);
  const shown = q.trim().length < 2 ? [] : found;
  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <div className="relative"><Plus className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add a member or type a name…" disabled={disabled} className="w-64 pl-9" /></div>
        {q.trim().length >= 2 && <Button size="sm" variant="secondary" disabled={busy} onClick={() => { onAdd([], [q.trim()]); setQ(""); }}>{busy ? <Loader2 className="size-4 animate-spin" /> : null} Add &ldquo;{q.trim()}&rdquo; as typed</Button>}
      </div>
      {shown.length > 0 && (
        <ul className="absolute z-20 mt-1 w-72 divide-y divide-line-soft rounded-xl border border-line bg-surface shadow-lg">
          {shown.map((p) => (
            <li key={p.id}>
              <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2" onClick={() => { onAdd([p.id], []); setQ(""); }}>
                <span>{p.name}</span><span className="text-xs text-ink-faint">{p.baptized ? "already baptised" : p.phone ?? ""}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Vals = { date: string; place: string; officiant: string; notes: string; extra: Record<string, string> };
const labelOf = (fields: FormField[], id: string, fallback: string) => fields.find((f) => f.id === id)?.label || fallback;

/** One question, drawn from the church's baptism form (standard or its own). */
function Question({ f, value, onChange }: { f: FormField; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label>{f.label}{f.required ? " *" : ""}</Label>
      {f.type === "textarea" ? <textarea value={value} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} rows={3} className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm" />
        : f.type === "select" || f.type === "radio" ? (
          <select value={value} onChange={(e) => onChange(e.target.value)} className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm">
            <option value="">Choose…</option>
            {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : f.type === "checkbox" ? (
          <label className="flex h-11 items-center gap-2 text-sm"><input type="checkbox" checked={value === "Yes"} onChange={(e) => onChange(e.target.checked ? "Yes" : "")} className="size-4 accent-primary" /> Yes</label>
        ) : <Input value={value} placeholder={f.placeholder} type={f.type === "date" ? "date" : f.type === "number" ? "number" : f.type === "tel" ? "tel" : f.type === "email" ? "email" : "text"} onChange={(e) => onChange(e.target.value)} />}
      {f.help && <p className="mt-1 text-xs text-ink-faint">{f.help}</p>}
    </div>
  );
}

/** The baptism questions. In bulk dialogs only the shared ones show (not notes or your own extra questions). */
function BaptismQuestions({ fields, v, set, bulk }: { fields: FormField[]; v: Vals; set: (p: Partial<Vals>) => void; bulk?: boolean }) {
  return (
    <>
      {questionFields(fields).filter((f) => f.id !== "name").map((f) => {
        if (f.id === "date") return <Question key={f.id} f={f} value={v.date} onChange={(x) => set({ date: x })} />;
        if (f.id === "place") return <Question key={f.id} f={f} value={v.place} onChange={(x) => set({ place: x })} />;
        if (f.id === "officiant") return <Question key={f.id} f={f} value={v.officiant} onChange={(x) => set({ officiant: x })} />;
        if (bulk) return null;
        if (f.id === "notes") return <Question key={f.id} f={f} value={v.notes} onChange={(x) => set({ notes: x })} />;
        return <Question key={f.id} f={f} value={v.extra[f.id] ?? ""} onChange={(x) => set({ extra: { ...v.extra, [f.id]: x } })} />;
      })}
    </>
  );
}

function DetailsDialog({ title, intro, cta, busy, defaultDate, defaults, fields, bulk, onSave, onClose }: {
  title: string; intro?: string; cta: string; busy: boolean; defaultDate: string; fields: FormField[]; bulk?: boolean;
  defaults?: { place: string; officiant: string; notes?: string; extra?: Record<string, string> };
  onSave: (v: Vals) => void; onClose: () => void;
}) {
  const [v, setV] = useState<Vals>({ date: defaultDate, place: defaults?.place ?? "", officiant: defaults?.officiant ?? "", notes: defaults?.notes ?? "", extra: defaults?.extra ?? {} });
  return (
    <Modal open onClose={onClose} title={title}>
      <div className="space-y-4">
        {intro && <p className="text-sm text-ink-muted">{intro}</p>}
        <BaptismQuestions fields={fields} v={v} set={(p) => setV((x) => ({ ...x, ...p }))} bulk={bulk} />
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button className="flex-1" disabled={busy} onClick={() => onSave(v)}>{busy ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : cta}</Button>
        </div>
      </div>
    </Modal>
  );
}

function RecordDialog({ fields, onSave, onClose, busy }: { fields: FormField[]; onSave: (v: { personId?: string; name?: string } & Vals) => void; onClose: () => void; busy: boolean }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ id: string; name: string; phone: string | null }[]>([]);
  const [person, setPerson] = useState<{ id: string; name: string } | null>(null);
  const [v, setV] = useState<Vals>({ date: today(), place: "", officiant: "", notes: "", extra: {} });
  useEffect(() => {
    if (person || q.trim().length < 2) return;
    let live = true;
    const t = setTimeout(async () => { const r = await searchBaptismPeople(q); if (live) setFound(r); }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [q, person]);
  return (
    <Modal open onClose={onClose} title="Add a baptism" description="For a baptism that already happened, or someone baptised in your church who is not on your list.">
      <div className="space-y-4">
        <div>
          <Label>{labelOf(fields, "name", "Name")}</Label>
          {person ? (
            <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm"><span>{person.name}</span><button type="button" className="text-xs text-primary hover:underline" onClick={() => { setPerson(null); setQ(""); }}>Change</button></div>
          ) : (
            <>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a member, or type a name" />
              {q.trim().length >= 2 && found.length > 0 && (
                <ul className="mt-1 divide-y divide-line-soft rounded-xl border border-line">
                  {found.map((p) => <li key={p.id}><button type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-surface-2" onClick={() => setPerson({ id: p.id, name: p.name })}><span>{p.name}</span><span className="text-xs text-ink-faint">{p.phone ?? ""}</span></button></li>)}
                </ul>
              )}
            </>
          )}
        </div>
        <BaptismQuestions fields={fields} v={v} set={(p) => setV((x) => ({ ...x, ...p }))} />
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button className="flex-1" disabled={busy || (!person && q.trim().length < 2)} onClick={() => onSave(person ? { personId: person.id, ...v } : { name: q, ...v })}>
            {busy ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : "Record it"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function PrintDialog({ rows, ctx, data, onClose, onPrint, onSaveSettings, onEditTemplate }: {
  rows: BaptismRow[]; ctx: CertCtx; data: BaptismData; onClose: () => void; onPrint: (rows: BaptismRow[], design: string) => void;
  onSaveSettings: (s: Partial<CertSettings>) => void; onEditTemplate: (id: string) => void;
}) {
  const [s, setS] = useState<CertSettings>(data.settings);
  const [design, setDesign] = useState(data.templates.some((t) => t.id === data.settings.template) || BUILT_IN.some((b) => b.id === data.settings.template) ? data.settings.template : "classic");
  const first = rows[0];
  const sample: CertData = first ? { name: first.name, date: fmt(first.date), place: first.place ?? "", officiant: first.officiant ?? "", certificateNo: first.certificateNo ?? "" } : SAMPLE;
  const live: CertCtx = { ...ctx, settings: { ...s, template: design } };
  const customFor = (id: string) => data.templates.find((t) => t.id === id) ?? null;
  return (
    <Modal open onClose={onClose} title={`Print ${rows.length} certificate${rows.length === 1 ? "" : "s"}`} wide>
      <div className="space-y-5">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">Choose a design</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {BUILT_IN.map((b) => (
              <button key={b.id} type="button" onClick={() => setDesign(b.id)} className={cn("rounded-xl border p-2 text-left transition-colors", design === b.id ? "border-primary ring-2 ring-primary/30" : "border-line hover:bg-surface-2")}>
                <ScaledCert design={b.id} data={SAMPLE} ctx={live} />
                <div className="mt-1.5 text-sm font-semibold">{b.name}</div>
              </button>
            ))}
            {data.templates.map((t) => (
              <div key={t.id} className={cn("rounded-xl border p-2 transition-colors", design === t.id ? "border-primary ring-2 ring-primary/30" : "border-line hover:bg-surface-2")}>
                <button type="button" className="block w-full text-left" onClick={() => setDesign(t.id)}>
                  <ScaledCert design="custom" custom={t} data={SAMPLE} ctx={live} />
                  <div className="mt-1.5 text-sm font-semibold">{t.name}</div>
                </button>
                <button type="button" className="text-xs text-primary hover:underline" onClick={() => onEditTemplate(t.id)}>Adjust</button>
              </div>
            ))}
          </div>
        </div>

        {!customFor(design) && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label>Heading</Label><Input value={s.heading} onChange={(e) => setS({ ...s, heading: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>Wording under the name</Label><Input value={s.statement} onChange={(e) => setS({ ...s, statement: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>Scripture (leave empty for none)</Label><Input value={s.scripture} onChange={(e) => setS({ ...s, scripture: e.target.value })} /></div>
            <div><Label>First signature line</Label><Input value={s.signer1} onChange={(e) => setS({ ...s, signer1: e.target.value })} placeholder="Officiating Minister" /></div>
            <div><Label>Their name (printed under the line)</Label><Input value={s.signer1Name} onChange={(e) => setS({ ...s, signer1Name: e.target.value })} /></div>
            <div><Label>Second signature line</Label><Input value={s.signer2} onChange={(e) => setS({ ...s, signer2: e.target.value })} placeholder="Senior Pastor" /></div>
            <div><Label>Their name</Label><Input value={s.signer2Name} onChange={(e) => setS({ ...s, signer2Name: e.target.value })} /></div>
          </div>
        )}

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">{first ? `Preview: ${first.name}` : "Preview"}</div>
          <div className="mx-auto max-w-2xl"><ScaledCert design={customFor(design) ? "custom" : design} custom={customFor(design)} data={sample} ctx={live} /></div>
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" disabled={rows.length === 0} onClick={() => { onSaveSettings({ ...s, template: design }); onPrint(rows, design); }}>
            <Printer className="size-4" /> Print {rows.length} certificate{rows.length === 1 ? "" : "s"}
          </Button>
        </div>
        <p className="text-xs text-ink-faint">The print window opens next. To keep them as a file, choose &ldquo;Save as PDF&rdquo; as the printer, and use A4 with no margins and &ldquo;Background graphics&rdquo; on.</p>
      </div>
    </Modal>
  );
}

function DesignList({ data, ctx, editing, onNew, onEdit, onDelete, onSaved, onClose }: {
  data: BaptismData; ctx: CertCtx; editing: string | null; onNew: () => void; onEdit: (id: string) => void; onDelete: (id: string) => void; onSaved: () => void; onClose: () => void;
}) {
  if (editing) {
    const existing = editing === "new" ? null : data.templates.find((t) => t.id === editing) ?? null;
    return (
      <div className="space-y-3">
        <CertificateDesigner ctx={ctx} existing={existing} onClose={() => onEdit("")} onSaved={onSaved} />
        {existing && <button type="button" className="text-xs text-danger hover:underline" onClick={() => onDelete(existing.id)}>Delete this design</button>}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">You already have four ready-made designs to choose from when you print. If your church has its own certificate, upload a picture of it here and we will print every name, date and place onto it.</p>
      {data.templates.length === 0 ? (
        <p className="rounded-xl bg-surface-2 p-4 text-sm text-ink-muted">You have not added a design of your own yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {data.templates.map((t) => (
            <div key={t.id} className="rounded-xl border border-line p-2">
              <ScaledCert design="custom" custom={t} data={SAMPLE} ctx={ctx} />
              <div className="mt-1.5 flex items-center justify-between"><span className="text-sm font-semibold">{t.name}</span><button type="button" className="text-xs text-primary hover:underline" onClick={() => onEdit(t.id)}>Adjust</button></div>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2"><Button onClick={onNew}><Plus className="size-4" /> Add my own design</Button><Button variant="secondary" onClick={onClose}>Close</Button></div>
    </div>
  );
}

