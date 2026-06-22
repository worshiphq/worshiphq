"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import Link from "next/link";
import { Crown, Users2, Plus, X, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MemberAvatar } from "@/components/ui/member-avatar";
import { addPosition, removePosition } from "@/app/actions/positions";
import { cn } from "@/lib/utils";

type Leader = {
  id: string;
  name: string;
  leaderTitle: string;
  photoUrl: string | null;
  phone: string | null;
  email: string | null;
};

type DeptMember = {
  id: string;
  positionId: string;
  name: string;
  photoUrl: string | null;
  position: string;
  phone: string | null;
  email: string | null;
};

type DeptLeader = {
  id: string;
  name: string;
  members: DeptMember[];
};

type Dept = { id: string; name: string };
type PersonOption = { id: string; name: string; photoUrl: string | null };

const BUILT_IN_POSITIONS = [
  "Head", "Assistant Head", "President", "Vice President",
  "Secretary", "Treasurer", "Coordinator",
];

export function LeadersClient({
  churchLeaders = [],
  departmentLeaders = [],
  departments = [],
  people = [],
  isAdmin,
  isDemo,
}: {
  churchLeaders: Leader[];
  departmentLeaders: DeptLeader[];
  departments: Dept[];
  people: PersonOption[];
  isAdmin: boolean;
  isDemo: boolean;
}) {
  return (
    <div className="space-y-6">
      {/* Church-level leadership */}
      {churchLeaders.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 border-b border-line px-5 py-4">
            <span className="grid size-8 place-items-center rounded-lg bg-gold/10">
              <Crown className="size-4 text-gold" />
            </span>
            <h3 className="font-display text-lg font-semibold">Church Leadership</h3>
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {churchLeaders.map((l, i) => {
              const isHead = i === 0;
              return (
                <Link
                  key={l.id}
                  href={`/app/people?highlight=${l.id}`}
                  className="group flex items-center gap-4 rounded-xl p-3 transition-colors hover:bg-surface-2/60"
                >
                  <MemberAvatar
                    name={l.name}
                    photoUrl={l.photoUrl}
                    size={isHead ? "lg" : "md"}
                    className={cn(
                      "shrink-0 transition-transform group-hover:scale-105",
                      isHead && "ring-3 ring-gold/30",
                    )}
                  />
                  <div className="min-w-0">
                    <h4 className="truncate font-display font-semibold text-ink">{l.name}</h4>
                    <span className={cn(
                      "mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                      isHead ? "bg-gold/10 text-gold" : "bg-primary/10 text-primary-bright",
                    )}>
                      {l.leaderTitle}
                    </span>
                    {l.phone && <div className="mt-0.5 text-xs text-ink-faint">{l.phone}</div>}
                  </div>
                </Link>
              );
            })}
          </div>
          <p className="border-t border-line-soft px-5 py-3 text-xs text-ink-faint">
            Church-level titles are assigned from the People section — edit a person and set their leadership label.
          </p>
        </Card>
      )}

      {churchLeaders.length === 0 && (
        <Card className="p-6 text-center">
          <Crown className="mx-auto size-8 text-ink-faint" />
          <h3 className="mt-2 font-display font-semibold">No church leaders yet</h3>
          <p className="mt-1 text-sm text-ink-muted">
            Go to <Link href="/app/people" className="text-primary-bright hover:underline">People</Link>, edit a member, and assign a leadership label (Head Pastor, Elder, etc.) to feature them here.
          </p>
        </Card>
      )}

      {/* Department leaders */}
      <div>
        <div className="mb-4 flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-primary/10">
            <Users2 className="size-4 text-primary-bright" />
          </span>
          <h3 className="font-display text-lg font-semibold">Department Leaders</h3>
        </div>

        {departments.length === 0 && (
          <Card className="p-6 text-center">
            <Users2 className="mx-auto size-8 text-ink-faint" />
            <h3 className="mt-2 font-display font-semibold">No departments yet</h3>
            <p className="mt-1 text-sm text-ink-muted">
              Create departments in <Link href="/app/settings" className="text-primary-bright hover:underline">Settings</Link> first, then assign leaders here.
            </p>
          </Card>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {departments.map((dept) => {
            const deptData = departmentLeaders.find((d) => d.id === dept.id);
            return (
              <DepartmentCard
                key={dept.id}
                dept={dept}
                members={deptData?.members ?? []}
                people={people}
                isAdmin={isAdmin}
                isDemo={isDemo}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DepartmentCard({
  dept,
  members,
  people,
  isAdmin,
  isDemo,
}: {
  dept: Dept;
  members: DeptMember[];
  people: PersonOption[];
  isAdmin: boolean;
  isDemo: boolean;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [removing, startRemove] = useTransition();

  return (
    <Card className="flex flex-col">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h4 className="font-display font-semibold">{dept.name}</h4>
        {members.length > 0 && (
          <Badge variant="default">{members.length}</Badge>
        )}
      </div>

      <div className="flex-1 divide-y divide-line-soft">
        {members.length === 0 && !showAdd && (
          <p className="px-4 py-6 text-center text-sm text-ink-faint">No leaders assigned</p>
        )}
        {members.map((m) => (
          <div key={m.positionId} className="flex items-center gap-3 px-4 py-3">
            <Link href={`/app/people?highlight=${m.id}`} className="shrink-0">
              <MemberAvatar name={m.name} photoUrl={m.photoUrl} size="sm" className="transition-transform hover:scale-110" />
            </Link>
            <div className="min-w-0 flex-1">
              <Link href={`/app/people?highlight=${m.id}`} className="block truncate text-sm font-medium text-ink hover:text-primary-bright">
                {m.name}
              </Link>
              <span className="text-xs text-primary-bright">{m.position}</span>
            </div>
            {isAdmin && !isDemo && (
              <button
                type="button"
                disabled={removing}
                onClick={() => startRemove(() => removePosition(m.positionId))}
                className="grid size-6 place-items-center rounded text-ink-faint transition-colors hover:bg-danger/10 hover:text-danger"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        ))}
      </div>

      {isAdmin && !isDemo && (
        <div className="border-t border-line p-3">
          {showAdd ? (
            <AddPositionForm deptId={dept.id} people={people} onDone={() => setShowAdd(false)} />
          ) : (
            <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setShowAdd(true)}>
              <Plus className="size-3.5" /> Assign leader
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

function AddPositionForm({
  deptId,
  people,
  onDone,
}: {
  deptId: string;
  people: PersonOption[];
  onDone: () => void;
}) {
  const [pending, startAdd] = useTransition();
  const [search, setSearch] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<PersonOption | null>(null);
  const [selectedPosition, setSelectedPosition] = useState("");
  const [customMode, setCustomMode] = useState(false);
  const [customPosition, setCustomPosition] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const safepeople = people ?? [];
  const filtered = search.length >= 1
    ? safepeople.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())).slice(0, 8)
    : [];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const finalPosition = customMode ? customPosition.trim() : selectedPosition;
  const canAssign = selectedPerson && finalPosition;

  function handleAssign() {
    if (!canAssign) return;
    const fd = new FormData();
    fd.set("personId", selectedPerson!.id);
    fd.set("departmentId", deptId);
    fd.set("position", finalPosition);
    startAdd(async () => {
      await addPosition(fd);
      onDone();
    });
  }

  return (
    <div className="space-y-3">
      {/* Step 1: Search & select member */}
      <div>
        <label className="text-xs font-medium text-ink-muted">Member</label>
        {selectedPerson ? (
          <div className="mt-1 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
            <MemberAvatar name={selectedPerson.name} photoUrl={selectedPerson.photoUrl} size="xs" />
            <span className="flex-1 text-sm font-medium text-ink">{selectedPerson.name}</span>
            <button
              type="button"
              onClick={() => { setSelectedPerson(null); setSearch(""); setSelectedPosition(""); }}
              className="grid size-5 place-items-center rounded text-ink-faint hover:text-danger"
            >
              <X className="size-3" />
            </button>
          </div>
        ) : (
          <div ref={wrapperRef} className="relative mt-1">
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setShowDropdown(true); }}
              onFocus={() => setShowDropdown(true)}
              placeholder="Type a name to search…"
              autoFocus
              className="flex h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm placeholder:text-ink-faint focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {showDropdown && filtered.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-xl border border-line bg-surface shadow-lg">
                {filtered.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedPerson(p);
                      setSearch("");
                      setShowDropdown(false);
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors hover:bg-surface-2"
                  >
                    <MemberAvatar name={p.name} photoUrl={p.photoUrl} size="xs" />
                    <span className="font-medium text-ink">{p.name}</span>
                  </button>
                ))}
              </div>
            )}
            {showDropdown && search.length >= 2 && filtered.length === 0 && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-line bg-surface p-3 text-center text-xs text-ink-faint shadow-lg">
                No members found
              </div>
            )}
          </div>
        )}
      </div>

      {/* Step 2: Choose position (only shows after selecting a person) */}
      {selectedPerson && (
        <div>
          <label className="text-xs font-medium text-ink-muted">Position</label>
          {!customMode ? (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {BUILT_IN_POSITIONS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setSelectedPosition(p)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    selectedPosition === p
                      ? "border-primary bg-primary/10 text-primary-bright"
                      : "border-line bg-surface text-ink-muted hover:border-primary/40 hover:text-primary-bright",
                  )}
                >
                  {selectedPosition === p && <Check className="mr-0.5 inline size-3" />}
                  {p}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCustomMode(true)}
                className="rounded-full border border-dashed border-line px-2.5 py-1 text-xs text-ink-faint hover:border-primary/40 hover:text-primary-bright"
              >
                <Plus className="mr-0.5 inline size-3" /> Custom
              </button>
            </div>
          ) : (
            <div className="mt-1 flex gap-1.5">
              <input
                value={customPosition}
                onChange={(e) => setCustomPosition(e.target.value)}
                placeholder="e.g. Music Director"
                autoFocus
                className="flex h-8 flex-1 rounded-lg border border-line bg-surface px-2 text-sm placeholder:text-ink-faint focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setCustomMode(false); setCustomPosition(""); }}>
                Back
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Assign button */}
      <div className="flex gap-2">
        {canAssign && (
          <Button
            type="button"
            size="sm"
            className="flex-1"
            disabled={pending}
            onClick={handleAssign}
          >
            {pending ? "Assigning…" : `Assign ${selectedPerson.name.split(" ")[0]} as ${finalPosition}`}
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={onDone} className="text-xs">
          Cancel
        </Button>
      </div>
    </div>
  );
}
