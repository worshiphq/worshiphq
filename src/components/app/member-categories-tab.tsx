"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Pencil, Check, X, Tags, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  getMemberCategoriesAdmin, createMemberCategory, updateMemberCategory, deleteMemberCategory,
  addCategoryOption, renameCategoryOption, deleteCategoryOption, type CategoryAdminRow,
} from "@/app/actions/member-categories";
import { cn } from "@/lib/utils";

type Res = { ok: boolean; error?: string; warning?: string };

/** Settings → Member categories: Zones, Fellowships, Cells… whatever the church uses. */
export function MemberCategoriesTab({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<CategoryAdminRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [newName, setNewName] = useState("");
  const [newMulti, setNewMulti] = useState(false);
  const [newOptions, setNewOptions] = useState("");

  const load = async () => setRows(await getMemberCategoriesAdmin());
  useEffect(() => { void load(); }, []);

  async function run(key: string, fn: () => Promise<Res>, after?: () => void) {
    setBusy(key);
    setError("");
    setWarning("");
    try {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Something went wrong.");
      else {
        if (r.warning) setWarning(r.warning);
        after?.();
        await load();
      }
    } catch (e) {
      setError((e as Error).message || "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  if (!rows) {
    return <Card className="flex items-center gap-2 p-6 text-sm text-ink-muted"><Loader2 className="size-4 animate-spin" /> Loading categories…</Card>;
  }

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <h3 className="font-display text-lg font-semibold text-ink">Member categories</h3>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Group members your way, beyond departments: Zones, Fellowships, Cells, Districts, Home groups. Each category
          appears on the add and edit member form, can be filtered on the People page, and gets its own attendance
          breakdown. Optional: if you don&rsquo;t add any, nothing changes.
        </p>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        {warning && <p className="mt-3 flex items-start gap-1.5 text-sm text-warning"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> {warning}</p>}
      </Card>

      {rows.map((c) => (
        <CategoryCard key={c.id} cat={c} canManage={canManage} busy={busy} run={run} />
      ))}

      {canManage && (
        <Card className="p-6">
          <h3 className="flex items-center gap-2 font-display text-base font-semibold text-ink"><Tags className="size-4" /> Add a category</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="catName">Category name</Label>
              <Input id="catName" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={60} placeholder="e.g. Zone, Fellowship" />
            </div>
            <div>
              <Label htmlFor="catOpts">Options <span className="font-normal text-ink-faint">(comma separated, you can add more later)</span></Label>
              <Input id="catOpts" value={newOptions} onChange={(e) => setNewOptions(e.target.value)} placeholder="e.g. Zone A, Zone B, Zone C" />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="How many can a member have">
            {([
              [false, "One per member", "e.g. a member lives in one zone"],
              [true, "Can choose several", "e.g. in two fellowships"],
            ] as const).map(([multi, label, hint]) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={newMulti === multi}
                onClick={() => setNewMulti(multi)}
                className={cn("rounded-xl border px-3 py-2 text-left text-sm", newMulti === multi ? "border-primary/50 bg-primary/10" : "border-line hover:bg-surface-2")}
              >
                <div className="font-medium">{label}</div>
                <div className="text-xs text-ink-muted">{hint}</div>
              </button>
            ))}
          </div>
          <Button
            className="mt-4"
            disabled={busy !== null || !newName.trim()}
            onClick={() =>
              run("create", () => createMemberCategory({ name: newName, allowMultiple: newMulti, options: newOptions.split(",") }), () => {
                setNewName("");
                setNewOptions("");
                setNewMulti(false);
              })
            }
          >
            {busy === "create" ? <><Loader2 className="size-4 animate-spin" /> Adding…</> : <><Plus className="size-4" /> Add category</>}
          </Button>
        </Card>
      )}
    </div>
  );
}

function CategoryCard({
  cat, canManage, busy, run,
}: {
  cat: CategoryAdminRow;
  canManage: boolean;
  busy: string | null;
  run: (key: string, fn: () => Promise<Res>, after?: () => void) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(cat.name);
  const [multi, setMulti] = useState(cat.allowMultiple);
  const [adding, setAdding] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const total = cat.options.reduce((s, o) => s + o.members, 0);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-6">
        {editing ? (
          <div className="flex flex-1 flex-wrap items-end gap-3">
            <div className="min-w-[12rem] flex-1">
              <Label htmlFor={`n-${cat.id}`}>Name</Label>
              <Input id={`n-${cat.id}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            </div>
            <label className="flex items-center gap-2 pb-3 text-sm">
              <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} className="size-4 rounded border-line accent-primary" />
              Members can choose several
            </label>
            <div className="flex gap-2 pb-0.5">
              <Button size="sm" disabled={busy !== null} onClick={() => run(`upd-${cat.id}`, () => updateMemberCategory(cat.id, { name, allowMultiple: multi }), () => setEditing(false))}>
                {busy === `upd-${cat.id}` ? <><Loader2 className="size-3.5 animate-spin" /> Saving…</> : "Save"}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => { setEditing(false); setName(cat.name); setMulti(cat.allowMultiple); }}>Cancel</Button>
            </div>
          </div>
        ) : (
          <>
            <div>
              <h3 className="font-display text-base font-semibold text-ink">{cat.name}</h3>
              <p className="text-sm text-ink-muted">
                {cat.allowMultiple ? "Members can choose several" : "One per member"} · {cat.options.length} option{cat.options.length === 1 ? "" : "s"} · {total} member{total === 1 ? "" : "s"} assigned
              </p>
            </div>
            {canManage && (
              <div className="flex gap-1">
                <button type="button" onClick={() => setEditing(true)} className="grid size-8 place-items-center rounded-lg text-ink-faint hover:bg-surface-2 hover:text-ink" title="Rename or change"><Pencil className="size-4" /></button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => {
                    if (!confirm(`Delete the "${cat.name}" category? Members are not deleted, only their ${cat.name} choices.`)) return;
                    void run(`delc-${cat.id}`, () => deleteMemberCategory(cat.id));
                  }}
                  className="grid size-8 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                  title="Delete category"
                >
                  {busy === `delc-${cat.id}` ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="p-6">
        {cat.options.length === 0 ? (
          <p className="text-sm text-ink-faint">No options yet. Add them below.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {cat.options.map((o) => (
              <li key={o.id} className="flex items-center gap-1.5 rounded-full border border-line bg-base py-1 pl-3 pr-1.5 text-sm">
                {renaming?.id === o.id ? (
                  <>
                    <input
                      value={renaming.name}
                      onChange={(e) => setRenaming({ id: o.id, name: e.target.value })}
                      maxLength={60}
                      autoFocus
                      className="w-32 bg-transparent outline-none"
                    />
                    <button type="button" disabled={busy !== null} onClick={() => run(`ren-${o.id}`, () => renameCategoryOption(o.id, renaming.name), () => setRenaming(null))} className="grid size-6 place-items-center rounded-full text-success hover:bg-success/10" title="Save">
                      {busy === `ren-${o.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                    </button>
                    <button type="button" onClick={() => setRenaming(null)} className="grid size-6 place-items-center rounded-full text-ink-faint hover:bg-surface-2" title="Cancel"><X className="size-3.5" /></button>
                  </>
                ) : (
                  <>
                    <span>{o.name}</span>
                    <span className="text-xs text-ink-faint">{o.members}</span>
                    {canManage && (
                      <>
                        <button type="button" onClick={() => setRenaming({ id: o.id, name: o.name })} className="grid size-6 place-items-center rounded-full text-ink-faint hover:bg-surface-2 hover:text-ink" title="Rename"><Pencil className="size-3" /></button>
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => {
                            if (!confirm(`Remove "${o.name}"?${o.members ? ` ${o.members} member${o.members === 1 ? "" : "s"} will no longer be in it.` : ""}`)) return;
                            void run(`delo-${o.id}`, () => deleteCategoryOption(o.id));
                          }}
                          className="grid size-6 place-items-center rounded-full text-ink-faint hover:bg-danger/10 hover:text-danger"
                          title="Remove"
                        >
                          {busy === `delo-${o.id}` ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3.5" />}
                        </button>
                      </>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {canManage && (
          <div className="mt-4 flex gap-2">
            <Input
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              placeholder={`Add to ${cat.name} (comma separated for several)`}
              onKeyDown={(e) => {
                if (e.key === "Enter" && adding.trim()) {
                  e.preventDefault();
                  void run(`add-${cat.id}`, () => addCategoryOption(cat.id, adding), () => setAdding(""));
                }
              }}
            />
            <Button variant="secondary" disabled={busy !== null || !adding.trim()} onClick={() => run(`add-${cat.id}`, () => addCategoryOption(cat.id, adding), () => setAdding(""))}>
              {busy === `add-${cat.id}` ? <><Loader2 className="size-4 animate-spin" /> Adding…</> : <><Plus className="size-4" /> Add</>}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
