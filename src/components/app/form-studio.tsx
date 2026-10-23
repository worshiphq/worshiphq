"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft, ChevronDown, ChevronUp, ExternalLink, GripVertical, Layers, Loader2, Plus, Save, Settings2, Trash2, X, Eye, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useFeedback } from "@/components/ui/feedback";
import { MemberFormFields, type SpecialRender } from "@/components/app/member-form-fields";
import { saveFormDefinition } from "@/app/actions/forms";
import { FORM_KINDS, type FormKind } from "@/lib/forms/kinds";
import { type FormField, type FieldType, hasSteps, splitSteps } from "@/lib/forms/registration";
import { cn } from "@/lib/utils";

const TYPE_LABELS: Record<Exclude<FieldType, "step">, string> = {
  text: "Short text", textarea: "Paragraph", number: "Number", date: "Date", tel: "Phone", email: "Email",
  select: "Dropdown", radio: "Radio buttons", checkbox: "Checkbox", image: "Photo upload",
};

let seq = 0;
const uid = (p: string) => `${p}_${Date.now().toString(36)}${seq++}`;

/** Names stay first on forms that need them; nothing can move above them. */
const PINNED = ["firstName", "lastName"];

/**
 * The full-page form builder: your questions and steps on the left, a live
 * preview of the real form on the right, and one Save. Replaces the cramped side
 * panel, so even a long form is just a normal scrolling page.
 */
export function FormStudio({
  kind, initial, accent, churchName, slug, departments, readOnly,
}: {
  kind: FormKind;
  initial: FormField[];
  accent: string;
  churchName: string;
  slug: string;
  departments: { id: string; name: string }[];
  readOnly: boolean;
}) {
  const info = FORM_KINDS[kind];
  const { toast } = useFeedback();
  const [fields, setFields] = useState<FormField[]>(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [open, setOpen] = useState<string | null>(null);
  const [pane, setPane] = useState<"edit" | "preview">("edit");
  const [pending, start] = useTransition();
  const dragId = useRef<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const dirty = JSON.stringify(fields) !== saved;
  const stepsOn = hasSteps(fields);
  const used = new Set(fields.map((f) => f.id));
  const available = info.catalog.filter((c) => !used.has(c.id) && !PINNED.includes(c.id) && c.type !== "step");

  const update = (id: string, patch: Partial<FormField>) => setFields((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const remove = (id: string) => setFields((fs) => fs.filter((f) => f.id !== id));

  const isLockedPos = (f: FormField) => PINNED.includes(f.id);

  function move(id: string, dir: -1 | 1) {
    setFields((fs) => {
      const i = fs.findIndex((f) => f.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= fs.length) return fs;
      if (isLockedPos(fs[i]) || isLockedPos(fs[j])) return fs;
      // The first thing in a stepped form must stay a step marker.
      if (j === 0 && fs[0].type === "step") return fs;
      const copy = [...fs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }

  /** Move a whole step (its marker and questions) up or down. */
  function moveStep(id: string, dir: -1 | 1) {
    setFields((fs) => {
      const steps = splitSteps(fs);
      const si = steps.findIndex((s) => s.id === id);
      const sj = si + dir;
      if (si < 0 || sj < 0 || sj >= steps.length) return fs;
      const arr = [...steps];
      [arr[si], arr[sj]] = [arr[sj], arr[si]];
      return arr.flatMap((s) => [{ id: s.id, label: s.title, type: "step" as const, help: s.description }, ...s.fields]);
    });
  }

  function addStandard(id: string, stepId?: string) {
    const tpl = info.catalog.find((c) => c.id === id);
    if (tpl) insertAtEnd({ ...tpl }, stepId);
  }
  function addCustom(stepId?: string) {
    const f: FormField = { id: uid("custom"), label: "New question", type: "text" };
    insertAtEnd(f, stepId);
    setOpen(f.id);
  }
  function insertAtEnd(f: FormField, stepId?: string) {
    setFields((fs) => {
      if (!stepId) return [...fs, f];
      const idx = fs.findIndex((x) => x.id === stepId);
      let end = idx + 1;
      while (end < fs.length && fs[end].type !== "step") end++;
      return [...fs.slice(0, end), f, ...fs.slice(end)];
    });
  }
  function addStep() {
    setFields((fs) => [...fs, { id: uid("step"), label: `Step ${splitSteps(fs).length + 1}`, type: "step" }]);
  }
  function deleteStep(id: string) {
    setFields((fs) => {
      const rest = fs.filter((f) => f.id !== id);
      return rest.filter((f) => f.type === "step").length <= 1 ? rest.filter((f) => f.type !== "step") : rest;
    });
  }
  function turnStepsOn() {
    setFields((fs) => {
      const head = fs.findIndex((f) => !PINNED.includes(f.id));
      const mid = Math.max(head + 1, Math.ceil(fs.length / 2));
      return [
        { id: uid("step"), label: "About you", type: "step" as const },
        ...fs.slice(0, mid),
        { id: uid("step"), label: "A few more details", type: "step" as const },
        ...fs.slice(mid),
      ];
    });
  }
  function turnStepsOff() {
    if (!window.confirm("Show everything on one page again? Your step titles will be removed, your questions stay.")) return;
    setFields((fs) => fs.filter((f) => f.type !== "step"));
  }

  function onDrop(targetId: string) {
    const from = dragId.current;
    dragId.current = null;
    setOver(null);
    if (!from || from === targetId) return;
    setFields((fs) => {
      const a = fs.findIndex((f) => f.id === from);
      const b = fs.findIndex((f) => f.id === targetId);
      if (a < 0 || b < 0 || isLockedPos(fs[a]) || isLockedPos(fs[b]) || fs[a].type === "step") return fs;
      if (b === 0 && fs[0].type === "step") return fs;
      const copy = [...fs];
      const [it] = copy.splice(a, 1);
      copy.splice(b, 0, it);
      return copy;
    });
  }

  function save() {
    start(async () => {
      const res = await saveFormDefinition(kind, JSON.stringify(fields));
      if (!res.ok) return toast(res.error, "error");
      setSaved(JSON.stringify(res.fields));
      setFields(res.fields);
      toast("Form saved. It is live now.", "success");
    });
  }

  const steps = stepsOn ? splitSteps(fields) : null;
  const signature = useMemo(
    () => JSON.stringify(fields.map((f) => [f.id, f.type, f.options, f.showIf, f.type === "step" ? f.label : 0])),
    [fields],
  );

  const special = useMemo(() => previewSpecials(kind), [kind]);

  return (
    <div>
      {/* ── Top bar ── */}
      <div className="sticky top-0 z-20 -mx-1 mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-base/95 px-1 py-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/app/settings" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink">
            <ArrowLeft className="size-4" /> Settings
          </Link>
          <span className="text-line">/</span>
          <h1 className="truncate font-display text-lg font-semibold">{info.label}</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-ink-faint sm:inline">{readOnly ? "View only" : dirty ? "Unsaved changes" : "All changes saved"}</span>
          {!info.internal && (
            <a href={info.path(slug)} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary" size="sm" type="button"><ExternalLink /> Open live form</Button>
            </a>
          )}
          <Button size="sm" onClick={save} disabled={readOnly || pending || !dirty}>
            {pending ? <><Loader2 className="animate-spin" /> Saving…</> : <><Save /> Save form</>}
          </Button>
        </div>
      </div>

      {/* Phone: switch between building and previewing */}
      <div className="mb-4 flex rounded-xl border border-line p-1 lg:hidden">
        {([["edit", "Build", Pencil], ["preview", "Preview", Eye]] as const).map(([k, l, Icon]) => (
          <button key={k} type="button" onClick={() => setPane(k)} className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium", pane === k ? "bg-primary text-white" : "text-ink-muted")}>
            <Icon className="size-4" /> {l}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_25rem]">
        {/* ── Builder ── */}
        <div className={cn("space-y-4", pane === "preview" && "hidden lg:block")}>
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-xl">
                <h2 className="flex items-center gap-2 font-display text-[1rem] font-semibold"><Layers className="size-4 text-primary" /> Show this form in steps</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  One short step at a time with a progress bar. People feel they are already getting somewhere, so more of them finish, especially on long forms.
                </p>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <span className={cn("relative h-6 w-11 rounded-full transition-colors", stepsOn ? "bg-primary" : "bg-line")}>
                  <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", stepsOn ? "left-[1.375rem]" : "left-0.5")} />
                  <input type="checkbox" className="sr-only" checked={stepsOn} disabled={readOnly} onChange={() => (stepsOn ? turnStepsOff() : turnStepsOn())} />
                </span>
                {stepsOn ? "On" : "Off"}
              </label>
            </div>
          </Card>

          {steps ? (
            steps.map((st, si) => (
              <div key={st.id} className="rounded-2xl border border-line bg-surface-2/40 p-3">
                <div className="flex flex-wrap items-center gap-2 px-1 pb-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-white">{si + 1}</span>
                  <input
                    value={st.title}
                    disabled={readOnly || st.id === "step-start"}
                    onChange={(e) => update(st.id, { label: e.target.value })}
                    placeholder="Step title"
                    className="h-9 min-w-[10rem] flex-1 rounded-lg border border-transparent bg-transparent px-2 font-display text-[1rem] font-semibold outline-none hover:border-line focus:border-primary/50 focus:bg-surface"
                  />
                  {!readOnly && st.id !== "step-start" && (
                    <div className="flex items-center gap-0.5">
                      <IconBtn label="Move step up" disabled={si === 0} onClick={() => moveStep(st.id, -1)}><ChevronUp className="size-4" /></IconBtn>
                      <IconBtn label="Move step down" disabled={si === steps.length - 1} onClick={() => moveStep(st.id, 1)}><ChevronDown className="size-4" /></IconBtn>
                      <IconBtn label="Remove step" danger onClick={() => deleteStep(st.id)}><Trash2 className="size-4" /></IconBtn>
                    </div>
                  )}
                </div>
                {st.id !== "step-start" && (
                  <input
                    value={st.description ?? ""}
                    disabled={readOnly}
                    onChange={(e) => update(st.id, { help: e.target.value || undefined })}
                    placeholder="A short line under the step title (optional)"
                    className="mb-3 h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-primary/50"
                  />
                )}
                <div className="space-y-2">
                  {st.fields.map((f) => (
                    <Row key={f.id} f={f} all={fields} info={info} open={open === f.id} readOnly={readOnly} over={over === f.id}
                      onOpen={() => setOpen(open === f.id ? null : f.id)} onUpdate={(p) => update(f.id, p)} onRemove={() => remove(f.id)} onMove={(d) => move(f.id, d)}
                      onDragStart={() => { dragId.current = f.id; }} onDragOver={() => setOver(f.id)} onDrop={() => onDrop(f.id)} />
                  ))}
                  {st.fields.length === 0 && <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-ink-faint">No questions in this step yet.</p>}
                </div>
                {!readOnly && <AddBar available={available} onStandard={(id) => addStandard(id, st.id)} onCustom={() => addCustom(st.id)} />}
              </div>
            ))
          ) : (
            <Card className="p-4">
              <div className="space-y-2">
                {fields.map((f) => (
                  <Row key={f.id} f={f} all={fields} info={info} open={open === f.id} readOnly={readOnly} over={over === f.id}
                    onOpen={() => setOpen(open === f.id ? null : f.id)} onUpdate={(p) => update(f.id, p)} onRemove={() => remove(f.id)} onMove={(d) => move(f.id, d)}
                    onDragStart={() => { dragId.current = f.id; }} onDragOver={() => setOver(f.id)} onDrop={() => onDrop(f.id)} />
                ))}
              </div>
              {!readOnly && <AddBar available={available} onStandard={(id) => addStandard(id)} onCustom={() => addCustom()} />}
            </Card>
          )}

          {stepsOn && !readOnly && (
            <Button variant="secondary" type="button" onClick={addStep}><Plus /> Add a step</Button>
          )}
        </div>

        {/* ── Live preview ── */}
        <div className={cn(pane === "edit" && "hidden lg:block")}>
          <div className="lg:sticky lg:top-20">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-muted"><Eye className="size-3.5" /> Live preview. Try it, nothing is sent.</div>
            <div className="max-h-[calc(100vh-9rem)] overflow-y-auto rounded-2xl border border-line bg-[#faf8f4] p-4">
              <p className="mb-3 text-center font-display text-base font-semibold text-[#1c1a16]">{churchName}</p>
              <form onSubmit={(e) => e.preventDefault()} className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
                <MemberFormFields
                  key={signature}
                  fields={fields}
                  departments={departments}
                  stepped
                  columns={kind === "prayer" || kind === "testimony" || kind === "counsel" || kind === "baptism" ? 1 : 2}
                  accent={accent}
                  special={special}
                  finalSlot={
                    <button type="button" className="w-full rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-sm" style={{ backgroundColor: accent }}>
                      {info.submitLabel}
                    </button>
                  }
                />
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function IconBtn({ children, label, onClick, disabled, danger }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
      className={cn("grid size-8 place-items-center rounded-lg text-ink-faint hover:bg-surface-2 disabled:opacity-30", danger ? "hover:bg-danger/10 hover:text-danger" : "hover:text-ink")}>
      {children}
    </button>
  );
}

function AddBar({ available, onStandard, onCustom }: { available: FormField[]; onStandard: (id: string) => void; onCustom: () => void }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {available.length > 0 && (
        <select
          value=""
          onChange={(e) => { if (e.target.value) onStandard(e.target.value); e.target.value = ""; }}
          className="h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink focus-visible:border-primary/60 focus-visible:outline-none"
        >
          <option value="">+ Add a standard question…</option>
          {available.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      )}
      <button type="button" onClick={onCustom} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-sm font-medium text-ink-muted hover:bg-surface-2 hover:text-ink">
        <Plus className="size-4" /> Your own question
      </button>
    </div>
  );
}

function Row({
  f, all, info, open, readOnly, over, onOpen, onUpdate, onRemove, onMove, onDragStart, onDragOver, onDrop,
}: {
  f: FormField; all: FormField[]; info: (typeof FORM_KINDS)[FormKind]; open: boolean; readOnly: boolean; over: boolean;
  onOpen: () => void; onUpdate: (p: Partial<FormField>) => void; onRemove: () => void; onMove: (d: -1 | 1) => void;
  onDragStart: () => void; onDragOver: () => void; onDrop: () => void;
}) {
  const pinned = PINNED.includes(f.id);
  const special = info.special.includes(f.id);
  const typeFixed = pinned || special || !!f.locked || (info.simple && f.system);
  const targets = all.filter((x) => x.id !== f.id && x.type !== "step");
  const target = all.find((x) => x.id === f.showIf?.fieldId);

  return (
    <div
      className={cn("rounded-xl border bg-surface transition-all", over ? "scale-[1.01] border-2 border-primary" : "border-line")}
      draggable={!pinned && !readOnly}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; onDragStart(); }}
      onDragOver={(e) => { e.preventDefault(); onDragOver(); }}
      onDrop={(e) => { e.preventDefault(); onDrop(); }}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <GripVertical className={cn("size-4 shrink-0", pinned ? "text-ink-faint/30" : "cursor-grab text-ink-faint active:cursor-grabbing")} />
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">{f.label || "Untitled"}</span>
            {f.required && <span className="text-xs text-danger">required</span>}
            {(pinned || f.locked) && <span className="rounded bg-surface-2 px-1.5 text-[10px] text-ink-faint">always on</span>}
            {f.showIf && <span className="rounded bg-primary/10 px-1.5 text-[10px] text-primary">conditional</span>}
          </div>
          <span className="text-xs text-ink-faint">{TYPE_LABELS[f.type as keyof typeof TYPE_LABELS] ?? f.type}{f.system ? " · standard" : " · yours"}</span>
        </button>
        {!readOnly && (
          <div className="flex items-center gap-0.5">
            <IconBtn label="Move up" onClick={() => onMove(-1)} disabled={pinned}><ChevronUp className="size-4" /></IconBtn>
            <IconBtn label="Move down" onClick={() => onMove(1)} disabled={pinned}><ChevronDown className="size-4" /></IconBtn>
            <IconBtn label="Edit question" onClick={onOpen}><Settings2 className={cn("size-4", open && "text-primary")} /></IconBtn>
            {!pinned && !f.locked && !special && <IconBtn label="Remove" danger onClick={onRemove}><Trash2 className="size-4" /></IconBtn>}
          </div>
        )}
      </div>

      {open && !readOnly && (
        <div className="space-y-3 border-t border-line-soft px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Question</Label>
              <Input value={f.label} onChange={(e) => onUpdate({ label: e.target.value })} />
            </div>
            <div>
              <Label>Answer type</Label>
              <select
                value={f.type}
                disabled={typeFixed}
                onChange={(e) => onUpdate({ type: e.target.value as FieldType })}
                className="flex h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm focus-visible:border-primary/60 focus-visible:outline-none disabled:opacity-60"
              >
                {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>

          {(f.type === "select" || f.type === "radio") && !special && (
            <OptionsEditor label={f.type === "radio" ? "Choices" : "Dropdown choices"} options={f.options ?? []} onChange={(options) => onUpdate({ options })} />
          )}

          {!["checkbox", "image", "select", "radio"].includes(f.type) && !special && (
            <div>
              <Label>Hint inside the box</Label>
              <Input value={f.placeholder ?? ""} onChange={(e) => onUpdate({ placeholder: e.target.value || undefined })} placeholder="e.g. Enter your full name" />
            </div>
          )}

          <div>
            <Label>Help text under the question</Label>
            <Input value={f.help ?? ""} onChange={(e) => onUpdate({ help: e.target.value || undefined })} placeholder="Optional, e.g. We will only use this to reach you" />
          </div>

          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input type="checkbox" checked={!!f.required} disabled={pinned || !!f.locked} onChange={(e) => onUpdate({ required: e.target.checked })} className="size-4 rounded border-line accent-primary" />
            Required
          </label>

          {!special && (
            <div className="rounded-lg border border-line-soft bg-surface-2/50 p-3">
              <label className="flex items-center gap-2 text-sm font-medium text-ink">
                <input
                  type="checkbox"
                  checked={!!f.showIf}
                  onChange={(e) => onUpdate({ showIf: e.target.checked ? { fieldId: targets[0]?.id ?? "", equals: "" } : undefined })}
                  className="size-4 rounded border-line accent-primary"
                />
                Only show this question when another answer matches
              </label>
              {f.showIf && (
                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_7rem_1fr]">
                  <select value={f.showIf.fieldId} onChange={(e) => onUpdate({ showIf: { fieldId: e.target.value, equals: "" } })} className="h-10 rounded-lg border border-line bg-surface px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
                    {targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                  <select
                    value={f.showIf.not ? "not" : "is"}
                    onChange={(e) => onUpdate({ showIf: { ...f.showIf!, not: e.target.value === "not" || undefined } })}
                    className="h-10 rounded-lg border border-line bg-surface px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  >
                    <option value="is">is</option>
                    <option value="not">is not</option>
                  </select>
                  {target?.options?.length ? (
                    <select value={f.showIf.equals} onChange={(e) => onUpdate({ showIf: { ...f.showIf!, equals: e.target.value } })} className="h-10 rounded-lg border border-line bg-surface px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
                      <option value="">choose…</option>
                      {target.options.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : target?.type === "checkbox" ? (
                    <select value={f.showIf.equals} onChange={(e) => onUpdate({ showIf: { ...f.showIf!, equals: e.target.value } })} className="h-10 rounded-lg border border-line bg-surface px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
                      <option value="">choose…</option>
                      <option value="yes">ticked</option>
                    </select>
                  ) : (
                    <Input placeholder="this value" value={f.showIf.equals} onChange={(e) => onUpdate({ showIf: { ...f.showIf!, equals: e.target.value } })} />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OptionsEditor({ label, options, onChange }: { label: string; options: string[]; onChange: (o: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => { if (draft.trim()) { onChange([...options, draft.trim()]); setDraft(""); } };
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o, i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs text-ink">
            {o}
            <button type="button" onClick={() => onChange(options.filter((_, idx) => idx !== i))} className="text-ink-faint hover:text-danger"><X className="size-3" /></button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <Input value={draft} placeholder="Add a choice and press Enter" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <button type="button" onClick={add} className="shrink-0 rounded-xl border border-line px-3 text-sm font-medium text-ink-muted hover:bg-surface-2">Add</button>
      </div>
      <p className="mt-1 text-xs text-ink-faint">Add a choice called Other and people can type their own answer.</p>
    </div>
  );
}

/** Stand-ins for the widgets that the real page draws itself, so the preview looks right. */
function previewSpecials(kind: FormKind): Record<string, SpecialRender> | undefined {
  const box = "flex h-11 w-full items-center rounded-xl border border-line bg-surface px-3.5 text-sm text-ink-faint";
  if (kind === "baptism") return { name: () => <div className={box}>Choose a member or type a name</div> };
  if (kind === "give") {
    return {
      amount: () => <div className={box}>₵ Enter amount</div>,
      fund: () => <div className={box}>Offertory, Tithes, Building fund…</div>,
    };
  }
  if (kind === "book") {
    return {
      facility: () => (
        <div className="grid grid-cols-2 gap-2">
          {["Main Hall", "Conference Room"].map((n) => <div key={n} className="rounded-xl border border-line p-3 text-sm font-medium">{n}</div>)}
        </div>
      ),
      when: () => (
        <div className="grid grid-cols-2 gap-2">
          <div className={box}>Start date</div><div className={box}>End date</div>
          <div className={box}>Start time</div><div className={box}>End time (optional)</div>
        </div>
      ),
    };
  }
  return undefined;
}
