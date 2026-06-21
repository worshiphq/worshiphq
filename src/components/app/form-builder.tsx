"use client";

import { useState, useRef } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, GripVertical, Settings2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveRegistrationForm } from "@/app/actions/settings";
import {
  type FormField,
  type FieldType,
  SYSTEM_FIELD_CATALOG,
} from "@/lib/forms/registration";
import { cn } from "@/lib/utils";

const TYPE_LABELS: Record<FieldType, string> = {
  text: "Short text",
  textarea: "Paragraph",
  number: "Number",
  date: "Date",
  tel: "Phone",
  email: "Email",
  select: "Dropdown",
  radio: "Radio buttons",
  checkbox: "Checkbox",
  image: "Photo upload",
};

let customSeq = 0;

export function FormBuilder({
  initial,
  readOnly,
}: {
  initial: FormField[];
  readOnly: boolean;
}) {
  const [fields, setFields] = useState<FormField[]>(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const dragIdx = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const usedSystemIds = new Set(fields.filter((f) => f.system).map((f) => f.id));
  const availableSystem = SYSTEM_FIELD_CATALOG.filter((f) => !usedSystemIds.has(f.id));

  function update(id: string, patch: Partial<FormField>) {
    setFields((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }
  function remove(id: string) {
    setFields((fs) => fs.filter((f) => f.id !== id));
  }
  function move(i: number, dir: -1 | 1) {
    setFields((fs) => {
      const j = i + dir;
      if (j < 0 || j >= fs.length) return fs;
      // Never move above the two locked name fields.
      if (fs[i].locked || fs[j].locked) return fs;
      const copy = [...fs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }
  function addSystem(id: string) {
    const tpl = SYSTEM_FIELD_CATALOG.find((f) => f.id === id);
    if (tpl) setFields((fs) => [...fs, { ...tpl }]);
  }
  function addCustom() {
    const id = `custom_${Date.now()}_${customSeq++}`;
    setFields((fs) => [...fs, { id, label: "New question", type: "text" }]);
    setEditing(id);
  }

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold">Registration form builder</h3>
          <p className="mt-1 text-sm text-ink-muted">
            Add, edit and reorder the fields members fill in. Add conditions to show a field only
            when another answer is chosen. First &amp; last name are always required.
          </p>
        </div>
      </div>

      <form action={saveRegistrationForm} className="mt-5">
        <input type="hidden" name="definition" value={JSON.stringify(fields)} />

        <div className="space-y-2">
          {fields.map((f, i) => (
            <FieldRow
              key={f.id}
              field={f}
              index={i}
              total={fields.length}
              allFields={fields}
              open={editing === f.id}
              readOnly={readOnly}
              isDragOver={dragOver === i}
              onToggle={() => setEditing(editing === f.id ? null : f.id)}
              onUpdate={(patch) => update(f.id, patch)}
              onRemove={() => remove(f.id)}
              onMove={(dir) => move(i, dir)}
              onDragStart={() => { dragIdx.current = i; }}
              onDragOver={() => { if (dragIdx.current !== null && dragIdx.current !== i) setDragOver(i); }}
              onDragEnd={() => {
                if (dragIdx.current !== null && dragOver !== null && dragIdx.current !== dragOver) {
                  const from = dragIdx.current;
                  const to = dragOver;
                  setFields((fs) => {
                    if (fs[from].locked || fs[to].locked) return fs;
                    if (to < 2) return fs;
                    const copy = [...fs];
                    const [item] = copy.splice(from, 1);
                    copy.splice(to, 0, item);
                    return copy;
                  });
                }
                dragIdx.current = null;
                setDragOver(null);
              }}
            />
          ))}
        </div>

        {/* Add field controls */}
        {!readOnly && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <select
              value=""
              onChange={(e) => { if (e.target.value) addSystem(e.target.value); e.target.value = ""; }}
              className="h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink focus-visible:border-primary/60 focus-visible:outline-none"
            >
              <option value="">+ Add a standard field…</option>
              {availableSystem.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={addCustom}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium text-ink-muted hover:bg-surface-2 hover:text-ink"
            >
              <Plus className="size-4" /> Custom question
            </button>
          </div>
        )}

        <SubmitButton className="mt-5" disabled={readOnly} successMessage="Form saved — live now">
          Save form
        </SubmitButton>
      </form>
    </Card>
  );
}

function FieldRow({
  field, index, total, allFields, open, readOnly, isDragOver,
  onToggle, onUpdate, onRemove, onMove, onDragStart, onDragOver, onDragEnd,
}: {
  field: FormField;
  index: number;
  total: number;
  allFields: FormField[];
  open: boolean;
  readOnly: boolean;
  isDragOver: boolean;
  onToggle: () => void;
  onUpdate: (patch: Partial<FormField>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDragEnd: () => void;
}) {
  const conditionTargets = allFields.filter((f) => f.id !== field.id);
  const conditionTarget = allFields.find((f) => f.id === field.showIf?.fieldId);

  return (
    <div
      className={cn("rounded-xl border bg-surface transition-all", isDragOver ? "border-primary border-2 scale-[1.01]" : "border-line")}
      draggable={!field.locked && !readOnly}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; onDragStart(); }}
      onDragOver={(e) => { e.preventDefault(); onDragOver(); }}
      onDragEnd={onDragEnd}
      onDrop={(e) => { e.preventDefault(); onDragEnd(); }}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <GripVertical className={cn("size-4 shrink-0", field.locked ? "text-ink-faint/30" : "text-ink-faint cursor-grab active:cursor-grabbing")} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-ink">{field.label || "Untitled"}</span>
            {field.required && <span className="text-xs text-danger">required</span>}
            {field.locked && <span className="rounded bg-surface-2 px-1.5 text-[10px] text-ink-faint">locked</span>}
            {field.showIf && <span className="rounded bg-primary-soft px-1.5 text-[10px] text-primary">conditional</span>}
          </div>
          <span className="text-xs text-ink-faint">{TYPE_LABELS[field.type]}{field.system && !field.locked ? " · standard" : field.system ? "" : " · custom"}</span>
        </div>
        {!readOnly && (
          <div className="flex items-center gap-0.5">
            <button type="button" onClick={() => onMove(-1)} disabled={index <= 2} className="grid size-7 place-items-center rounded text-ink-faint hover:bg-surface-2 disabled:opacity-30"><ChevronUp className="size-4" /></button>
            <button type="button" onClick={() => onMove(1)} disabled={index >= total - 1 || field.locked} className="grid size-7 place-items-center rounded text-ink-faint hover:bg-surface-2 disabled:opacity-30"><ChevronDown className="size-4" /></button>
            <button type="button" onClick={onToggle} className={cn("grid size-7 place-items-center rounded hover:bg-surface-2", open ? "text-primary-bright" : "text-ink-faint")}><Settings2 className="size-4" /></button>
            {!field.locked && <button type="button" onClick={onRemove} className="grid size-7 place-items-center rounded text-ink-faint hover:bg-danger/10 hover:text-danger"><Trash2 className="size-4" /></button>}
          </div>
        )}
      </div>

      {open && !readOnly && (
        <div className="space-y-3 border-t border-line-soft px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Label</Label>
              <Input value={field.label} onChange={(e) => onUpdate({ label: e.target.value })} />
            </div>
            <div>
              <Label>Type</Label>
              <select
                value={field.type}
                disabled={field.locked}
                onChange={(e) => onUpdate({ type: e.target.value as FieldType })}
                className="flex h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm focus-visible:border-primary/60 focus-visible:outline-none disabled:opacity-60"
              >
                {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>

          {(field.type === "select" || field.type === "radio") && (
            <OptionsEditor
              label={field.type === "radio" ? "Radio options" : "Dropdown options"}
              options={field.options ?? []}
              onChange={(options) => onUpdate({ options })}
            />
          )}

          {/* Placeholder text */}
          {!["checkbox", "image", "select", "radio"].includes(field.type) && (
            <div>
              <Label>Placeholder text</Label>
              <Input
                value={field.placeholder ?? ""}
                onChange={(e) => onUpdate({ placeholder: e.target.value || undefined })}
                placeholder="e.g. Enter your full name…"
              />
              <p className="mt-1 text-xs text-ink-faint">Faded hint shown inside the empty field</p>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input
              type="checkbox"
              checked={!!field.required}
              disabled={field.locked}
              onChange={(e) => onUpdate({ required: e.target.checked })}
              className="size-4 rounded border-line accent-primary"
            />
            Required
          </label>

          {/* Conditional logic */}
          <div className="rounded-lg border border-line-soft bg-surface-2/50 p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-ink">
              <input
                type="checkbox"
                checked={!!field.showIf}
                onChange={(e) =>
                  onUpdate({ showIf: e.target.checked ? { fieldId: conditionTargets[0]?.id ?? "", equals: "" } : undefined })
                }
                className="size-4 rounded border-line accent-primary"
              />
              Only show this field when…
            </label>
            {field.showIf && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <select
                  value={field.showIf.fieldId}
                  onChange={(e) => onUpdate({ showIf: { fieldId: e.target.value, equals: "" } })}
                  className="h-10 rounded-lg border border-line bg-surface px-2 text-sm focus-visible:outline-none"
                >
                  {conditionTargets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                {conditionTarget?.options?.length ? (
                  <select
                    value={field.showIf.equals}
                    onChange={(e) => onUpdate({ showIf: { fieldId: field.showIf!.fieldId, equals: e.target.value } })}
                    className="h-10 rounded-lg border border-line bg-surface px-2 text-sm focus-visible:outline-none"
                  >
                    <option value="">equals…</option>
                    {conditionTarget.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <Input
                    placeholder="equals this value"
                    value={field.showIf.equals}
                    onChange={(e) => onUpdate({ showIf: { fieldId: field.showIf!.fieldId, equals: e.target.value } })}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function OptionsEditor({ label = "Dropdown options", options, onChange }: { label?: string; options: string[]; onChange: (o: string[]) => void }) {
  const [draft, setDraft] = useState("");
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o, i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs text-ink">
            {o}
            <button type="button" onClick={() => onChange(options.filter((_, idx) => idx !== i))} className="text-ink-faint hover:text-danger">
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <Input
          value={draft}
          placeholder="Add an option"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (draft.trim()) { onChange([...options, draft.trim()]); setDraft(""); }
            }
          }}
        />
        <button
          type="button"
          onClick={() => { if (draft.trim()) { onChange([...options, draft.trim()]); setDraft(""); } }}
          className="shrink-0 rounded-xl border border-line px-3 text-sm font-medium text-ink-muted hover:bg-surface-2"
        >
          Add
        </button>
      </div>
    </div>
  );
}
