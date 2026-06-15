"use client";

import { useRef, useState } from "react";
import { UploadCloud, X } from "lucide-react";
import { type FormField, DEPARTMENT_FIELD_ID } from "@/lib/forms/registration";
import { cn } from "@/lib/utils";

const MAX_DIM = 400;

export interface MemberDefaults {
  scalars?: Record<string, string>;
  departments?: string[];
  photoUrl?: string;
}

/**
 * Renders a member form from a shared field definition with conditional
 * visibility, multi-department checkboxes, and a photo uploader. Inputs use
 * `field.id` as their name so the enclosing <form> serialises them. Used by both
 * the public join form and the admin add/edit member modal.
 */
export function MemberFormFields({
  fields,
  departments,
  defaults,
}: {
  fields: FormField[];
  departments: { id: string; name: string }[];
  defaults?: MemberDefaults;
}) {
  const [values, setValues] = useState<Record<string, string>>(defaults?.scalars ?? {});
  const [depts, setDepts] = useState<string[]>(defaults?.departments ?? []);
  const [photo, setPhoto] = useState<string>(defaults?.photoUrl ?? "");
  const setValue = (id: string, v: string) => setValues((s) => ({ ...s, [id]: v }));

  const visible = (f: FormField) => {
    if (!f.showIf) return true;
    return (values[f.showIf.fieldId] ?? "") === f.showIf.equals;
  };

  const input =
    "flex h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-sm text-ink placeholder:text-ink-faint focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25";

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.filter(visible).map((f) => {
        const full = f.type === "textarea" || f.type === "image" || f.id === DEPARTMENT_FIELD_ID;
        return (
          <div key={f.id} className={full ? "sm:col-span-2" : undefined}>
            <label className="mb-1.5 block text-sm font-medium text-ink-muted">
              {f.label} {f.required && <span className="text-danger">*</span>}
            </label>

            {f.id === DEPARTMENT_FIELD_ID ? (
              <DepartmentChecks departments={departments} selected={depts} onChange={setDepts} />
            ) : f.type === "image" ? (
              <PhotoUpload value={photo} onChange={setPhoto} name={f.id} />
            ) : f.type === "select" ? (
              <select name={f.id} required={f.required} value={values[f.id] ?? ""} onChange={(e) => setValue(f.id, e.target.value)} className={input}>
                <option value="">Select…</option>
                {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : f.type === "textarea" ? (
              <textarea name={f.id} required={f.required} placeholder={f.placeholder} value={values[f.id] ?? ""} onChange={(e) => setValue(f.id, e.target.value)} className={`${input} h-24 py-2.5`} />
            ) : f.type === "checkbox" ? (
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" name={f.id} value="yes" checked={values[f.id] === "yes"} onChange={(e) => setValue(f.id, e.target.checked ? "yes" : "")} className="size-4 rounded border-line accent-primary" />
                Yes
              </label>
            ) : (
              <input name={f.id} type={f.type} required={f.required} placeholder={f.placeholder} value={values[f.id] ?? ""} onChange={(e) => setValue(f.id, e.target.value)} className={input} />
            )}
          </div>
        );
      })}
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
    return <p className="text-xs text-ink-faint">No departments yet — add them in Settings.</p>;
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

function PhotoUpload({ value, onChange, name }: { value: string; onChange: (v: string) => void; name: string }) {
  const ref = useRef<HTMLInputElement>(null);
  function handle(files: FileList | null) {
    const file = files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
        onChange(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
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
        <button type="button" onClick={() => ref.current?.click()} className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-muted hover:bg-surface-2">
          {value ? "Replace" : "Upload photo"}
        </button>
        {value && (
          <button type="button" onClick={() => onChange("")} className="flex items-center gap-1 text-xs text-danger hover:underline">
            <X className="size-3" /> Remove
          </button>
        )}
      </div>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => handle(e.target.files)} />
    </div>
  );
}
