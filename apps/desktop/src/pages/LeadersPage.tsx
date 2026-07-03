import { useEffect, useState, useMemo } from "react";
import {
  Loader2, Crown, Users2, Search, GripVertical, ArrowUp, ArrowDown,
  Plus, X, Check, Settings2, Phone,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Avatar } from "../components/ui/Avatar";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { cn } from "../lib/utils";
import { v4 as uuid } from "uuid";

const CHURCH_TITLE_PRIORITY: Record<string, number> = {
  "Head Pastor": 0, "Senior Pastor": 1, "Lead Pastor": 2, "Associate Pastor": 3,
  "Pastor": 4, "Elder": 5, "Shepherd": 6, "Deacon": 7, "Deaconess": 8,
  "Minister": 9, "Evangelist": 10, "Prophet": 11, "Apostle": 12,
  "Bishop": 13, "Reverend": 14, "Director": 15, "Coordinator": 16,
};

const POSITION_PRIORITY: Record<string, number> = {
  "President": 0, "Vice President": 1, "Head": 2, "Assistant Head": 3,
  "Secretary": 4, "Treasurer": 5, "Coordinator": 6,
};

const BUILT_IN_POSITIONS = [
  "Head", "Assistant Head", "President", "Vice President",
  "Secretary", "Treasurer", "Coordinator",
];

const TITLE_WORDS = ["Mr", "Mrs", "Ms", "Dr", "Rev", "Rev.", "Pst", "Pst.", "Elder", "Deacon", "Deaconess", "Prof", "Prof.", "Hon", "Hon.", "Sir", "Lady", "Sis", "Bro"];

function fullName(p: any) {
  return `${p.title ? p.title + " " : ""}${p.first_name} ${p.last_name}`;
}

export function LeadersPage() {
  const { session, showToast, syncVersion } = useAppStore();
  const [churchLeaders, setChurchLeaders] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [people, setPeople] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reordering, setReordering] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  async function loadData() {
    setLoading(true);
    const cid = session!.churchId;
    const [leaders, depts, pos, ppl] = await Promise.all([
      db.rawQuery(
        "SELECT * FROM person WHERE church_id = ? AND featured = 1 AND leader_title IS NOT NULL AND leader_title != '' ",
        [cid]
      ),
      db.rawQuery("SELECT * FROM department WHERE church_id = ? ORDER BY name ASC", [cid]),
      db.rawQuery(
        `SELECT dp.id AS position_id, dp.position, dp.department_id,
                p.id, p.first_name, p.last_name, p.title, p.photo_url, p.phone, p.email
         FROM department_position dp JOIN person p ON dp.person_id = p.id
         WHERE dp.church_id = ? ORDER BY dp.created_at ASC`,
        [cid]
      ),
      db.rawQuery(
        "SELECT id, first_name, last_name, title, photo_url FROM person WHERE church_id = ? AND status = 'active' ORDER BY first_name ASC, last_name ASC",
        [cid]
      ),
    ]);
    const sorted = [...leaders].sort((a, b) => {
      if ((a.leader_sort_order ?? 0) !== (b.leader_sort_order ?? 0)) return (a.leader_sort_order ?? 0) - (b.leader_sort_order ?? 0);
      const pa = CHURCH_TITLE_PRIORITY[a.leader_title ?? ""] ?? 99;
      const pb = CHURCH_TITLE_PRIORITY[b.leader_title ?? ""] ?? 99;
      return pa - pb;
    });
    setChurchLeaders(sorted);
    setDepartments(depts);
    setPositions(pos);
    setPeople(ppl);
    setLoading(false);
  }

  const deptLeaders = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const d of departments) map.set(d.id, []);
    for (const dp of positions) {
      const arr = map.get(dp.department_id);
      if (arr) arr.push(dp);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (POSITION_PRIORITY[a.position] ?? 99) - (POSITION_PRIORITY[b.position] ?? 99));
    }
    return map;
  }, [departments, positions]);

  const customPositions = useMemo(
    () => [...new Set(positions.map((p) => p.position).filter((p) => !BUILT_IN_POSITIONS.includes(p)))].sort(),
    [positions]
  );

  function moveLeader(from: number, to: number) {
    setChurchLeaders((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  async function saveOrder() {
    setSavingOrder(true);
    await Promise.all(churchLeaders.map((l, i) => db.update("person", l.id, { leader_sort_order: i })));
    setSavingOrder(false);
    setReordering(false);
    showToast("Leader order saved");
  }

  return (
    <PageShell title="Leaders">
      <PageHeader title="Church Leadership" description="Pastors, elders, shepherds, and department heads — everyone who leads your church." />

      <div className="mb-5 grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Church Leaders" value={churchLeaders.length} icon={Crown} color="text-gold" />
        <StatCard label="Departments" value={departments.length} icon={Users2} color="text-primary-bright" />
        <StatCard label="Dept. Positions" value={positions.length} icon={Check} color="text-success" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>
      ) : (
        <div className="space-y-6">
          {/* Church-level leadership */}
          {churchLeaders.length > 0 ? (
            <div className="card p-0 overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <div className="flex items-center gap-2">
                  <span className="grid size-8 place-items-center rounded-lg bg-gold/10"><Crown className="size-4 text-gold" /></span>
                  <h3 className="text-lg font-semibold text-ink">Church Leadership</h3>
                </div>
                {reordering ? (
                  <div className="flex items-center gap-2">
                    <button className="btn-secondary btn-sm" disabled={savingOrder}
                      onClick={() => { setReordering(false); loadData(); }}>Cancel</button>
                    <button className="btn-primary btn-sm" disabled={savingOrder} onClick={saveOrder}>
                      {savingOrder ? <><Loader2 className="size-4 whq-spin" /> Saving...</> : "Save order"}
                    </button>
                  </div>
                ) : (
                  <button className="btn-ghost btn-sm text-xs" onClick={() => setReordering(true)}>
                    <GripVertical className="size-3.5" /> Reorder
                  </button>
                )}
              </div>
              <div className={cn("grid gap-4 p-5", reordering ? "grid-cols-1" : "grid-cols-2 lg:grid-cols-3")}>
                {churchLeaders.map((l, i) => {
                  const isHead = i === 0 && !reordering;
                  const name = fullName(l);
                  return (
                    <div key={l.id} draggable={reordering}
                      onDragStart={() => setDragIdx(i)}
                      onDragOver={(e) => { e.preventDefault(); if (dragIdx !== null && dragIdx !== i) { moveLeader(dragIdx, i); setDragIdx(i); } }}
                      onDragEnd={() => setDragIdx(null)}
                      className={cn("group flex items-center gap-4 rounded-xl p-3 transition-colors",
                        reordering ? "cursor-grab border border-line bg-surface-2/30 active:cursor-grabbing hover:border-primary/30" : "hover:bg-surface-2/60",
                        dragIdx === i && "opacity-50")}>
                      {reordering && (
                        <div className="flex flex-col gap-0.5">
                          <button type="button" disabled={i === 0} onClick={() => moveLeader(i, i - 1)}
                            className="grid size-6 place-items-center rounded text-ink-faint hover:bg-surface-2 disabled:opacity-30"><ArrowUp className="size-3" /></button>
                          <GripVertical className="mx-auto size-4 text-ink-faint" />
                          <button type="button" disabled={i === churchLeaders.length - 1} onClick={() => moveLeader(i, i + 1)}
                            className="grid size-6 place-items-center rounded text-ink-faint hover:bg-surface-2 disabled:opacity-30"><ArrowDown className="size-3" /></button>
                        </div>
                      )}
                      <Avatar name={name} src={l.photo_url} size={isHead ? "lg" : "md"} className={cn("shrink-0", isHead && "ring-3 ring-gold/30")} />
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate font-semibold text-ink">{name}</h4>
                        <span className={cn("mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium", isHead ? "bg-gold/10 text-gold" : "bg-primary/10 text-primary-bright")}>{l.leader_title}</span>
                        {l.phone && !reordering && <div className="mt-0.5 text-xs text-ink-faint">{l.phone}</div>}
                      </div>
                      {reordering && <span className="text-xs font-mono text-ink-faint">#{i + 1}</span>}
                    </div>
                  );
                })}
              </div>
              <p className="border-t border-line-soft px-5 py-3 text-xs text-ink-faint">
                {reordering ? "Drag cards or use arrows to reorder. Pastors show first by default." : "Church-level titles are assigned from the People section — edit a person, set a leadership label, and mark them featured."}
              </p>
            </div>
          ) : (
            <div className="card p-6 text-center">
              <Crown className="mx-auto size-8 text-ink-faint" />
              <h3 className="mt-2 font-semibold text-ink">No church leaders yet</h3>
              <p className="mt-1 text-sm text-ink-muted">Go to People, edit a member, assign a leadership label (Head Pastor, Elder, etc.) and mark them featured to feature them here.</p>
            </div>
          )}

          {/* Department leaders */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-lg bg-primary/10"><Users2 className="size-4 text-primary-bright" /></span>
                <h3 className="text-lg font-semibold text-ink">Department Leaders</h3>
              </div>
            </div>

            {departments.length === 0 ? (
              <div className="card p-6 text-center">
                <Users2 className="mx-auto size-8 text-ink-faint" />
                <h3 className="mt-2 font-semibold text-ink">No departments yet</h3>
                <p className="mt-1 text-sm text-ink-muted">Create departments in Settings first, then assign leaders here.</p>
              </div>
            ) : (
              <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
                {departments.map((dept) => (
                  <DepartmentCard key={dept.id} dept={dept} members={deptLeaders.get(dept.id) ?? []}
                    people={people} customPositions={customPositions}
                    churchId={session!.churchId} onChange={loadData} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}

function DepartmentCard({ dept, members, people, customPositions, churchId, onChange }: {
  dept: any; members: any[]; people: any[]; customPositions: string[]; churchId: string; onChange: () => void;
}) {
  const { showToast } = useAppStore();
  const [showAdd, setShowAdd] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function handleRemove(positionId: string) {
    setRemovingId(positionId);
    await db.delete("department_position", positionId);
    showToast("Position removed");
    onChange();
    setRemovingId(null);
  }

  return (
    <div className="card p-0 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h4 className="font-semibold text-ink">{dept.name}</h4>
        {members.length > 0 && <span className="badge badge-muted">{members.length}</span>}
      </div>
      <div className="flex-1 divide-y divide-line-soft">
        {members.length === 0 && !showAdd && <p className="px-4 py-6 text-center text-sm text-ink-faint">No leaders assigned</p>}
        {members.map((m) => (
          <div key={m.position_id} className={cn("flex items-center gap-3 px-4 py-3", removingId === m.position_id && "opacity-40")}>
            <Avatar name={fullName(m)} src={m.photo_url} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{fullName(m)}</p>
              <span className="text-xs text-primary-bright">{m.position}</span>
            </div>
            <button type="button" disabled={removingId === m.position_id} onClick={() => handleRemove(m.position_id)}
              className="grid size-6 place-items-center rounded text-ink-faint hover:bg-danger/10 hover:text-danger disabled:pointer-events-none">
              {removingId === m.position_id ? <Loader2 className="size-3 whq-spin" /> : <X className="size-3" />}
            </button>
          </div>
        ))}
      </div>
      <div className="border-t border-line p-3">
        {showAdd ? (
          <AddPositionForm deptId={dept.id} people={people} customPositions={customPositions}
            churchId={churchId} onDone={() => setShowAdd(false)} onSaved={onChange} />
        ) : (
          <button className="btn-ghost btn-sm w-full text-xs" onClick={() => setShowAdd(true)}>
            <Plus className="size-3.5" /> Assign leader
          </button>
        )}
      </div>
    </div>
  );
}

function AddPositionForm({ deptId, people, customPositions, churchId, onDone, onSaved }: {
  deptId: string; people: any[]; customPositions: string[]; churchId: string; onDone: () => void; onSaved: () => void;
}) {
  const { showToast } = useAppStore();
  const [pending, setPending] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<any | null>(null);
  const [selectedPosition, setSelectedPosition] = useState("");
  const [customMode, setCustomMode] = useState(false);
  const [customPosition, setCustomPosition] = useState("");

  const filtered = search.length >= 1
    ? people.filter((p) => fullName(p).toLowerCase().includes(search.toLowerCase())).slice(0, 8)
    : [];
  const finalPosition = customMode ? customPosition.trim() : selectedPosition;
  const canAssign = selectedPerson && finalPosition;

  async function handleAssign() {
    if (!canAssign) return;
    setPending(true);
    await db.insert("department_position", {
      id: uuid(), church_id: churchId, person_id: selectedPerson.id,
      department_id: deptId, position: finalPosition,
    });
    showToast("Leader assigned");
    setPending(false);
    onSaved();
    onDone();
  }

  const firstName = selectedPerson
    ? (fullName(selectedPerson).split(" ").filter((w: string) => !TITLE_WORDS.includes(w))[0] || selectedPerson.first_name)
    : "";

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium text-ink-muted">Member</label>
        {selectedPerson ? (
          <div className="mt-1 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
            <Avatar name={fullName(selectedPerson)} src={selectedPerson.photo_url} size="xs" />
            <span className="flex-1 text-sm font-medium text-ink">{fullName(selectedPerson)}</span>
            <button type="button" onClick={() => { setSelectedPerson(null); setSearch(""); setSelectedPosition(""); }}
              className="grid size-5 place-items-center rounded text-ink-faint hover:text-danger"><X className="size-3" /></button>
          </div>
        ) : (
          <div className="relative mt-1">
            <input value={search} onChange={(e) => setSearch(e.target.value)} autoFocus
              placeholder="Type a name to search..." className="input h-9" />
            {filtered.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-xl border border-line bg-surface shadow-lg">
                {filtered.map((p) => (
                  <button key={p.id} type="button" onClick={() => { setSelectedPerson(p); setSearch(""); }}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-surface-2">
                    <Avatar name={fullName(p)} src={p.photo_url} size="xs" />
                    <span className="font-medium text-ink">{fullName(p)}</span>
                  </button>
                ))}
              </div>
            )}
            {search.length >= 2 && filtered.length === 0 && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-line bg-surface p-3 text-center text-xs text-ink-faint shadow-lg">No members found</div>
            )}
          </div>
        )}
      </div>

      {selectedPerson && (
        <div>
          <label className="text-xs font-medium text-ink-muted">Position</label>
          {!customMode ? (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {[...BUILT_IN_POSITIONS, ...customPositions.filter((cp) => !BUILT_IN_POSITIONS.includes(cp))].map((p) => (
                <button key={p} type="button" onClick={() => setSelectedPosition(p)}
                  className={cn("rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    selectedPosition === p ? "border-primary bg-primary/10 text-primary-bright" : "border-line bg-surface text-ink-muted hover:border-primary/40 hover:text-primary-bright")}>
                  {selectedPosition === p && <Check className="mr-0.5 inline size-3" />}{p}
                </button>
              ))}
              <button type="button" onClick={() => setCustomMode(true)}
                className="rounded-full border border-dashed border-line px-2.5 py-1 text-xs text-ink-faint hover:border-primary/40 hover:text-primary-bright">
                <Plus className="mr-0.5 inline size-3" /> Custom
              </button>
            </div>
          ) : (
            <div className="mt-1 flex gap-1.5">
              <input value={customPosition} onChange={(e) => setCustomPosition(e.target.value)} autoFocus
                placeholder="e.g. Music Director" className="input h-8 flex-1" />
              <button type="button" className="btn-ghost btn-sm h-8 text-xs" onClick={() => { setCustomMode(false); setCustomPosition(""); }}>Back</button>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        {canAssign && (
          <button type="button" className="btn-primary btn-sm flex-1" disabled={pending} onClick={handleAssign}>
            {pending ? <><Loader2 className="size-4 whq-spin" /> Assigning...</> : `Assign ${firstName} as ${finalPosition}`}
          </button>
        )}
        <button type="button" className="btn-ghost btn-sm text-xs" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}
