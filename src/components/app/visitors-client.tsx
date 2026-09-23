"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { OnFormComplete } from "@/components/ui/form-effects";
import { Search, Link2, UserRoundPlus, Mail, Phone, Calendar, Pencil, Trash2, UserPlus, X, Star, UploadCloud, Fingerprint } from "lucide-react";
import { updateVisitor, deleteVisitor, convertVisitorToMember, addVisitor, toggleRegular } from "@/app/actions/visit";
import { phoneValidityMessage } from "@/lib/phone";
import { ImageCropper } from "@/components/ui/image-cropper";

type VisitorRow = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  purpose: string | null;
  notes: string | null;
  photoUrl: string | null;
  isRegular: boolean;
  visitCount: number;
  lastVisit: string;
  visitDate: string;
  hasFingerprint: boolean;
};

const PURPOSES = ["Sunday Service", "Midweek Service", "Special Event", "Counselling", "Other"];

export function VisitorsClient({
  visitors,
  visitUrl,
  canWrite,
}: {
  visitors: VisitorRow[];
  visitUrl: string | null;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<VisitorRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState<"all" | "regular">("all");
  const [addPhoto, setAddPhoto] = useState("");
  const [addEditing, setAddEditing] = useState<string | null>(null);
  const addFileRef = useRef<HTMLInputElement>(null);
  const [editPhoto, setEditPhoto] = useState("");
  const [editCropping, setEditCropping] = useState<string | null>(null);
  const editFileRef = useRef<HTMLInputElement>(null);

  const filtered = visitors.filter((v) => {
    if (filter === "regular" && !v.isRegular) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      v.firstName.toLowerCase().includes(q) ||
      v.lastName.toLowerCase().includes(q) ||
      v.phone?.toLowerCase().includes(q) ||
      v.email?.toLowerCase().includes(q) ||
      v.purpose?.toLowerCase().includes(q)
    );
  });

  const regularCount = visitors.filter((v) => v.isRegular).length;

  function handleDelete(v: VisitorRow) {
    if (!confirm(`Delete visitor ${v.firstName} ${v.lastName}?`)) return;
    startTransition(async () => {
      await deleteVisitor(v.id);
      router.refresh();
    });
  }

  function handleConvert(v: VisitorRow) {
    if (!confirm(`Convert ${v.firstName} ${v.lastName} to a church member? They will be removed from visitors and added to the People directory.`)) return;
    startTransition(async () => {
      await convertVisitorToMember(v.id);
      setEditing(null);
      router.refresh();
    });
  }

  function handleAddPhoto(files: FileList | null) {
    const file = files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setAddEditing(reader.result as string);
    reader.readAsDataURL(file);
  }

  function handleEditPhoto(files: FileList | null) {
    const file = files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setEditCropping(reader.result as string);
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Visitors</h1>
          <p className="text-sm text-ink-muted">
            {visitors.length} visitor{visitors.length !== 1 ? "s" : ""} recorded
            {regularCount > 0 && <> &middot; <Star className="mb-0.5 inline size-3 text-gold" /> {regularCount} regular</>}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canWrite && (
            <Button onClick={() => { setAdding(true); setAddPhoto(""); }}>
              <UserRoundPlus className="size-4" /> Add visitor
            </Button>
          )}
          {visitUrl && (
            <Button
              variant="secondary"
              onClick={() => {
                const url = `${window.location.origin}${visitUrl}`;
                navigator.clipboard.writeText(url);
                alert("Visitor form link copied!");
              }}
            >
              <Link2 className="size-4" /> Copy visitor link
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={() => setFilter("all")} className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${filter === "all" ? "bg-primary text-white" : "bg-surface-2 text-ink-muted hover:bg-surface-2/80"}`}>
          All ({visitors.length})
        </button>
        <button onClick={() => setFilter("regular")} className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${filter === "regular" ? "bg-gold/90 text-white" : "bg-surface-2 text-ink-muted hover:bg-surface-2/80"}`}>
          <Star className="size-3" /> Regular ({regularCount})
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <Input
          placeholder="Search visitors…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <UserRoundPlus className="mx-auto size-10 text-ink-faint" />
          <p className="mt-3 text-sm text-ink-muted">
            {search ? "No visitors match your search." : "No visitors yet. Add one manually, or share your visitor form link to collect them automatically."}
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((v) => (
            <Card
              key={v.id}
              className="group cursor-pointer p-4 space-y-2 transition-colors hover:border-primary/30"
              onClick={() => { setEditing(v); setEditPhoto(v.photoUrl ?? ""); }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  {v.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={v.photoUrl} alt="" className="size-10 shrink-0 rounded-full object-cover ring-1 ring-line" />
                  ) : (
                    <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-bold text-primary">
                      {v.firstName[0]}{v.lastName?.[0] ?? ""}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-semibold">{v.firstName} {v.lastName}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1">
                      {v.isRegular && <Badge variant="default" className="text-[10px] bg-gold/15 text-gold border-gold/30"><Star className="mr-0.5 size-2.5" /> Regular</Badge>}
                      {v.purpose && <Badge variant="default" className="text-[10px]">{v.purpose}</Badge>}
                      {v.hasFingerprint && <Badge variant="default" className="text-[10px] bg-primary/10 text-primary border-primary/30"><Fingerprint className="mr-0.5 size-2.5" /></Badge>}
                    </div>
                  </div>
                </div>
                {canWrite && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditing(v); setEditPhoto(v.photoUrl ?? ""); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-surface-2"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                )}
              </div>

              <div className="space-y-1 text-xs text-ink-muted">
                {v.phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="size-3" /> {v.phone}
                  </div>
                )}
                {v.email && (
                  <div className="flex items-center gap-1.5">
                    <Mail className="size-3" /> {v.email}
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="size-3" />
                    {new Date(v.visitDate).toLocaleDateString("en-GB", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </span>
                  {v.visitCount > 1 && (
                    <span className="font-medium text-primary">{v.visitCount} visits</span>
                  )}
                </div>
              </div>

              {v.notes && (
                <p className="text-xs text-ink-muted italic border-t border-line-soft pt-2">
                  &ldquo;{v.notes}&rdquo;
                </p>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Add visitor drawer - for people who signed a paper sheet in person */}
      {adding && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setAdding(false)} />
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-line bg-surface shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-5 py-4">
              <h2 className="font-display text-lg font-semibold">Add visitor</h2>
              <button onClick={() => setAdding(false)} className="grid size-8 place-items-center rounded-lg hover:bg-surface-2">
                <X className="size-5" />
              </button>
            </div>

            <form action={addVisitor} className="space-y-4 p-5">
              <OnFormComplete onComplete={() => setAdding(false)} />
              <input type="hidden" name="photoUrl" value={addPhoto} />
              <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-muted">
                Add a new visitor. They can also be checked in by name or fingerprint.
              </p>

              <div className="flex items-center gap-4">
                {addPhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={addPhoto} alt="" className="size-14 rounded-full object-cover ring-1 ring-line" />
                ) : (
                  <div className="grid size-14 place-items-center rounded-full bg-surface-2 text-ink-faint"><UploadCloud className="size-6" /></div>
                )}
                <div className="flex items-center gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => addFileRef.current?.click()}>
                    {addPhoto ? "Replace" : "Add photo"}
                  </Button>
                  {addPhoto && <button type="button" onClick={() => setAddPhoto("")} className="text-xs text-danger hover:underline">Remove</button>}
                </div>
                <input ref={addFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { handleAddPhoto(e.target.files); e.target.value = ""; }} />
              </div>
              {addEditing && <ImageCropper src={addEditing} onCancel={() => setAddEditing(null)} onConfirm={(d) => { setAddPhoto(d); setAddEditing(null); }} />}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>First name</Label>
                  <Input name="firstName" required />
                </div>
                <div>
                  <Label>Last name</Label>
                  <Input name="lastName" />
                </div>
              </div>

              <div>
                <Label>Phone</Label>
                <Input name="phone" type="tel" placeholder="024 000 0000" onChange={(e) => e.target.setCustomValidity("")} onBlur={(e) => e.target.setCustomValidity(phoneValidityMessage(e.target.value))} />
              </div>

              <div>
                <Label>Email</Label>
                <Input name="email" type="email" />
              </div>

              <div>
                <Label>Date of visit</Label>
                <Input name="visitDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
              </div>

              <div>
                <Label>Purpose of visit</Label>
                <select
                  name="purpose"
                  defaultValue=""
                  className="h-10 w-full rounded-xl border border-line bg-base px-3 text-sm"
                >
                  <option value="">- Select -</option>
                  {PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <div>
                <Label>Notes / prayer request</Label>
                <textarea
                  name="notes"
                  rows={3}
                  className="w-full rounded-xl border border-line bg-base px-3 py-2 text-sm focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                />
              </div>

              <SubmitButton className="w-full" pendingLabel="Saving…" successMessage="Visitor added">Add visitor</SubmitButton>
            </form>
          </div>
        </>
      )}

      {/* Edit visitor drawer */}
      {editing && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setEditing(null)} />
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-line bg-surface shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-5 py-4">
              <h2 className="font-display text-lg font-semibold">Edit visitor</h2>
              <button onClick={() => setEditing(null)} className="grid size-8 place-items-center rounded-lg hover:bg-surface-2">
                <X className="size-5" />
              </button>
            </div>

            <form action={updateVisitor} className="space-y-4 p-5">
              <OnFormComplete onComplete={() => setEditing(null)} />
              <input type="hidden" name="id" value={editing.id} />
              <input type="hidden" name="photoUrl" value={editPhoto} />

              <div className="flex items-center gap-4">
                {editPhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={editPhoto} alt="" className="size-14 rounded-full object-cover ring-1 ring-line" />
                ) : (
                  <div className="grid size-14 place-items-center rounded-full bg-surface-2 text-ink-faint"><UploadCloud className="size-6" /></div>
                )}
                <div className="flex items-center gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => editFileRef.current?.click()}>
                    {editPhoto ? "Replace" : "Add photo"}
                  </Button>
                  {editPhoto && <button type="button" onClick={() => setEditPhoto("")} className="text-xs text-danger hover:underline">Remove</button>}
                </div>
                <input ref={editFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { handleEditPhoto(e.target.files); e.target.value = ""; }} />
              </div>
              {editCropping && <ImageCropper src={editCropping} onCancel={() => setEditCropping(null)} onConfirm={(d) => { setEditPhoto(d); setEditCropping(null); }} />}

              <div className="flex items-center justify-between rounded-xl border border-line px-4 py-3">
                <div>
                  <div className="text-sm font-medium">Regular visitor</div>
                  <div className="text-xs text-ink-muted">{editing.visitCount} visit{editing.visitCount !== 1 ? "s" : ""} recorded</div>
                </div>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="isRegular" defaultChecked={editing.isRegular} className="size-4 rounded border-line accent-gold" />
                  <Star className={`size-4 ${editing.isRegular ? "text-gold" : "text-ink-faint"}`} />
                </label>
              </div>

              {editing.hasFingerprint && (
                <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2 text-sm text-primary">
                  <Fingerprint className="size-4" /> Fingerprint registered
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>First name</Label>
                  <Input name="firstName" defaultValue={editing.firstName} required />
                </div>
                <div>
                  <Label>Last name</Label>
                  <Input name="lastName" defaultValue={editing.lastName} required />
                </div>
              </div>

              <div>
                <Label>Phone</Label>
                <Input name="phone" type="tel" defaultValue={editing.phone ?? ""} onChange={(e) => e.target.setCustomValidity("")} onBlur={(e) => e.target.setCustomValidity(phoneValidityMessage(e.target.value))} />
              </div>

              <div>
                <Label>Email</Label>
                <Input name="email" type="email" defaultValue={editing.email ?? ""} />
              </div>

              <div>
                <Label>Purpose of visit</Label>
                <select
                  name="purpose"
                  defaultValue={editing.purpose ?? ""}
                  className="h-10 w-full rounded-xl border border-line bg-base px-3 text-sm"
                >
                  <option value="">- Select -</option>
                  {PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <div>
                <Label>Notes / prayer request</Label>
                <textarea
                  name="notes"
                  defaultValue={editing.notes ?? ""}
                  rows={3}
                  className="w-full rounded-xl border border-line bg-base px-3 py-2 text-sm focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                />
              </div>

              <div className="flex gap-2">
                <SubmitButton className="flex-1">Save changes</SubmitButton>
              </div>
            </form>

            {canWrite && (
              <div className="border-t border-line p-5 space-y-3">
                <Button
                  variant="secondary"
                  className="w-full gap-2"
                  disabled={pending}
                  onClick={() => handleConvert(editing)}
                >
                  <UserPlus className="size-4" /> Convert to member
                </Button>
                <Button
                  variant="ghost"
                  className="w-full gap-2 text-danger hover:bg-danger/10"
                  disabled={pending}
                  onClick={() => { handleDelete(editing); setEditing(null); }}
                >
                  <Trash2 className="size-4" /> Delete visitor
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
