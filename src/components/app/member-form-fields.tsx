"use client";

import { PhoneInput } from "@/components/ui/phone-input";
import { useRef, useState } from "react";
import { Camera, Check, UploadCloud, X } from "lucide-react";
import { type FormField, DEPARTMENT_FIELD_ID, GROUPS_FIELD_ID, splitSteps, questionFields } from "@/lib/forms/registration";
import { ImageCropper } from "@/components/ui/image-cropper";
import { Combobox } from "@/components/ui/combobox";
import { OtherSelect } from "@/components/app/other-select";
import { cn } from "@/lib/utils";

export interface MemberDefaults {
  scalars?: Record<string, string>;
  departments?: string[];
  photoUrl?: string;
}

export type SpecialRender = (ctx: { field: FormField; value: string; setValue: (v: string) => void; values: Record<string, string> }) => React.ReactNode;

const input =
  "flex h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-sm text-ink placeholder:text-ink-faint focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25";

/**
 * Renders a form from a shared field definition with conditional visibility,
 * multi-department checkboxes and a photo uploader. Inputs use `field.id` as
 * their name so the enclosing <form> serialises them.
 *
 * With `stepped`, a form that has step markers is shown one step at a time with
 * a progress tracker, Back and Next (each step is checked before moving on), and
 * `finalSlot` (categories, consent, the submit button) appears on the last step.
 * Without it, step markers are ignored and everything shows at once.
 */
export function MemberFormFields({
  fields,
  departments,
  groups = [],
  defaults,
  stepped = false,
  columns = 2,
  accent = "#0d7377",
  finalSlot,
  special,
}: {
  fields: FormField[];
  departments: { id: string; name: string }[];
  /** Groups people may choose (those marked to show on sign-up forms). */
  groups?: { id: string; name: string }[];
  defaults?: MemberDefaults;
  stepped?: boolean;
  /** 1 = one question per row (short forms), 2 = two side by side on wider screens. */
  columns?: 1 | 2;
  accent?: string;
  finalSlot?: React.ReactNode;
  special?: Record<string, SpecialRender>;
}) {
  const [values, setValues] = useState<Record<string, string>>(defaults?.scalars ?? {});
  const [depts, setDepts] = useState<string[]>(defaults?.departments ?? []);
  const [pickedGroups, setPickedGroups] = useState<string[]>([]);
  const [photo, setPhoto] = useState<string>(defaults?.photoUrl ?? "");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const setValue = (id: string, v: string) => setValues((s) => ({ ...s, [id]: v }));

  const steps = stepped
    ? splitSteps(fields)
    : [{ id: "all", title: "", description: undefined as string | undefined, fields: questionFields(fields) }];
  const multi = steps.length > 1;
  const cur = Math.min(active, steps.length - 1);

  const visible = (f: FormField) => {
    if (!f.showIf) return true;
    const eq = (values[f.showIf.fieldId] ?? "") === f.showIf.equals;
    return f.showIf.not ? !eq : eq;
  };

  /** Check every field in a step; shows the browser's message on the first problem. */
  function validate(i: number) {
    const box = root.current?.querySelector<HTMLElement>(`[data-step="${i}"]`);
    if (!box) return true;
    for (const el of Array.from(box.querySelectorAll<HTMLInputElement>("input, select, textarea"))) {
      if (el.type === "hidden" || el.disabled) continue;
      if (!el.checkValidity()) {
        el.reportValidity();
        return false;
      }
    }
    return true;
  }
  function go(to: number) {
    setActive(to);
    requestAnimationFrame(() => root.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  const next = () => {
    if (validate(cur)) go(Math.min(cur + 1, steps.length - 1));
  };

  const renderField = (f: FormField) => {
    const sp = special?.[f.id];
    const full = f.type === "textarea" || f.type === "image" || f.id === DEPARTMENT_FIELD_ID || f.id === GROUPS_FIELD_ID || !!sp;
    const inlineCheckbox = f.type === "checkbox" && !sp;
    return (
      <div key={f.id} className={full || inlineCheckbox ? "sm:col-span-2" : undefined}>
        {!inlineCheckbox && (
          <label className="mb-1.5 block text-sm font-medium text-ink-muted">
            {f.label} {f.required && <span className="text-danger">*</span>}
          </label>
        )}

        {sp ? (
          sp({ field: f, value: values[f.id] ?? "", setValue: (v) => setValue(f.id, v), values })
        ) : f.id === DEPARTMENT_FIELD_ID ? (
          <DepartmentChecks departments={departments} selected={depts} onChange={setDepts} />
        ) : f.id === GROUPS_FIELD_ID ? (
          <GroupChecks groups={groups} selected={pickedGroups} onChange={setPickedGroups} />
        ) : f.type === "image" ? (
          <PhotoUpload value={photo} onChange={setPhoto} name={f.id} />
        ) : f.type === "select" && (f.options?.length ?? 0) >= 10 ? (
          <Combobox name={f.id} required={f.required} value={values[f.id] ?? ""} onChange={(v) => setValue(f.id, v)} options={f.options ?? []} />
        ) : f.type === "select" && (f.options ?? []).some((o) => /^other$/i.test(o)) ? (
          <OtherSelect
            name={f.id}
            options={f.options ?? []}
            defaultValue={values[f.id] ?? ""}
            required={f.required}
            className={input}
            emptyLabel="Select…"
            onValueChange={(v) => setValue(f.id, v)}
          />
        ) : f.type === "select" ? (
          <select name={f.id} required={f.required} value={values[f.id] ?? ""} onChange={(e) => setValue(f.id, e.target.value)} className={input}>
            <option value="">Select…</option>
            {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : f.type === "textarea" ? (
          <textarea name={f.id} required={f.required} placeholder={f.placeholder} value={values[f.id] ?? ""} onChange={(e) => setValue(f.id, e.target.value)} className={`${input} h-28 py-2.5`} />
        ) : f.type === "radio" ? (
          <div className="flex flex-wrap gap-3">
            {(f.options ?? []).map((o) => (
              <label key={o} className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                <input type="radio" name={f.id} value={o} required={f.required} checked={values[f.id] === o} onChange={(e) => setValue(f.id, e.target.value)} className="size-4 accent-primary" />
                {o}
              </label>
            ))}
          </div>
        ) : f.type === "checkbox" ? (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input type="checkbox" name={f.id} value="yes" required={f.required} checked={values[f.id] === "yes"} onChange={(e) => setValue(f.id, e.target.checked ? "yes" : "")} className="size-4 rounded border-line accent-primary" />
            {f.label} {f.required && <span className="text-danger">*</span>}
          </label>
        ) : f.type === "tel" ? (
          <PhoneInput name={f.id} required={f.required} value={values[f.id] ?? ""} onChange={(v) => setValue(f.id, v)} />
        ) : (
          <input name={f.id} type={f.type} required={f.required} placeholder={f.placeholder} value={values[f.id] ?? ""} onChange={(e) => setValue(f.id, e.target.value)} className={input} />
        )}
        {f.help && <p className="mt-1 text-xs text-ink-faint">{f.help}</p>}
      </div>
    );
  };

  return (
    <div
      ref={root}
      onKeyDown={(e) => {
        // Enter should move to the next step, not submit a half finished form.
        if (multi && cur < steps.length - 1 && e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
          e.preventDefault();
          next();
        }
      }}
    >
      {multi && <StepTracker steps={steps.map((g) => g.title)} current={cur} accent={accent} />}

      {steps.map((g, i) => (
        <div key={g.id} data-step={i} hidden={multi && i !== cur} className={multi ? "animate-fade-up" : undefined}>
          {multi && (
            <div className="mb-4">
              <h3 className="font-display text-xl font-semibold text-ink">{g.title}</h3>
              {g.description && <p className="mt-1 text-sm text-ink-muted">{g.description}</p>}
            </div>
          )}
          <div className={cn("grid gap-4", columns === 2 && "sm:grid-cols-2")}>{g.fields.filter(visible).map(renderField)}</div>
        </div>
      ))}

      {multi && (
        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => go(Math.max(0, cur - 1))}
            className={cn("rounded-xl border border-line px-5 py-2.5 text-sm font-medium text-ink-muted hover:bg-surface-2", cur === 0 && "invisible")}
          >
            Back
          </button>
          {cur < steps.length - 1 && (
            <button
              type="button"
              onClick={next}
              className="rounded-xl px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
              style={{ backgroundColor: accent }}
            >
              Next
            </button>
          )}
        </div>
      )}

      {(!multi || cur === steps.length - 1) && finalSlot && <div className="mt-5">{finalSlot}</div>}
    </div>
  );
}

/** Numbered progress: finished steps show a tick, and the percentage encourages people to finish. */
function StepTracker({ steps, current, accent }: { steps: string[]; current: number; accent: string }) {
  const pct = Math.round((current / steps.length) * 100);
  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between text-xs font-medium text-ink-muted">
        <span>Step {current + 1} of {steps.length}</span>
        <span>{pct === 0 ? "Let us begin" : `${pct}% done`}</span>
      </div>
      <div className="flex items-center">
        {steps.map((t, i) => (
          <div key={i} className={cn("flex items-center", i < steps.length - 1 && "flex-1")}>
            <span
              className={cn("grid size-7 shrink-0 place-items-center rounded-full border-2 text-xs font-semibold transition-colors", i > current && "border-line bg-surface text-ink-faint")}
              style={i <= current ? { borderColor: accent, backgroundColor: i < current ? accent : "transparent", color: i < current ? "#fff" : accent } : undefined}
              title={t}
            >
              {i < current ? <Check className="size-3.5" /> : i + 1}
            </span>
            {i < steps.length - 1 && (
              <span className="mx-1.5 h-0.5 flex-1 rounded-full bg-line">
                <span className="block h-full rounded-full transition-all duration-500" style={{ width: i < current ? "100%" : "0%", backgroundColor: accent }} />
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DepartmentChecks({
  departments, selected, onChange,
}: {
  departments: { id: string; name: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  if (departments.length === 0) {
    return <p className="text-xs text-ink-faint">No departments yet - add them in Settings.</p>;
  }
  const toggle = (name: string) =>
    onChange(selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name]);
  return (
    <div className="flex flex-wrap gap-2">
      {/* Hidden inputs carry the selected department names (multiple). */}
      {selected.map((n) => <input key={n} type="hidden" name={DEPARTMENT_FIELD_ID} value={n} />)}
      {departments.map((d) => {
        const on = selected.includes(d.name);
        return (
          <button
            key={d.id}
            type="button"
            onClick={() => toggle(d.name)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              on ? "border-primary bg-primary/10 text-primary-bright" : "border-line text-ink-muted hover:bg-surface-2",
            )}
          >
            {d.name}
          </button>
        );
      })}
    </div>
  );
}

function GroupChecks({ groups, selected, onChange }: { groups: { id: string; name: string }[]; selected: string[]; onChange: (v: string[]) => void }) {
  if (groups.length === 0) return <p className="text-xs text-ink-faint">No groups are open to join yet.</p>;
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <div className="flex flex-wrap gap-2">
      {selected.map((id) => <input key={id} type="hidden" name={GROUPS_FIELD_ID} value={id} />)}
      {groups.map((g) => {
        const on = selected.includes(g.id);
        return (
          <button
            key={g.id}
            type="button"
            onClick={() => toggle(g.id)}
            aria-pressed={on}
            className={cn("rounded-full border px-3 py-1.5 text-sm font-medium transition-colors", on ? "border-primary bg-primary/10 text-primary-bright" : "border-line text-ink-muted hover:bg-surface-2")}
          >
            {g.name}
          </button>
        );
      })}
    </div>
  );
}

function PhotoUpload({ value, onChange, name }: { value: string; onChange: (v: string) => void; name: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const cam = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<string | null>(null);
  function pick(files: FileList | null) {
    const file = files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setEditing(reader.result as string);
    reader.readAsDataURL(file);
  }
  return (
    <div className="flex items-center gap-4">
      <input type="hidden" name={name} value={value} />
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="" className="size-16 rounded-full object-cover ring-1 ring-line" />
      ) : (
        <span className="grid size-16 place-items-center rounded-full bg-surface-2 text-ink-faint"><UploadCloud className="size-6" /></span>
      )}
      <div className="flex items-center gap-2">
        {/* "Take a photo" opens the phone's own camera app (so portrait mode, flash and filters all work) and comes straight back to this form. */}
        <button type="button" onClick={() => cam.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10">
          <Camera className="size-4" /> Take a photo
        </button>
        <button type="button" onClick={() => ref.current?.click()} className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-muted hover:bg-surface-2">
          {value ? "Replace" : "Upload"}
        </button>
        {value && (
          <button type="button" onClick={() => onChange("")} className="flex items-center gap-1 text-xs text-danger hover:underline">
            <X className="size-3" /> Remove
          </button>
        )}
      </div>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      <input ref={cam} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      {editing && (
        <ImageCropper src={editing} onCancel={() => setEditing(null)} onConfirm={(d) => { onChange(d); setEditing(null); }} />
      )}
    </div>
  );
}
