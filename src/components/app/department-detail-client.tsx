"use client";

import { usePagedList } from "@/components/ui/list-pager";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/ui/app-link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MemberAvatar } from "@/components/ui/member-avatar";
import { useFeedback } from "@/components/ui/feedback";
import { Modal } from "@/components/ui/modal";
import { MultiPicker } from "@/components/app/multi-picker";
import { Users2, UserPlus, X, ArrowLeft, Search, Loader2, Phone, MessageSquare } from "lucide-react";
import { addDepartmentMembers, removeDepartmentMember } from "@/app/actions/departments";
import { matchesPerson } from "@/lib/search";
import { cn } from "@/lib/utils";

type DeptInfo = { id: string; name: string; description: string | null };
type MemberInfo = { id: string; name: string; phone: string | null; photoUrl: string | null; gender: string | null; inactive: boolean };
type PersonOpt = { id: string; name: string; phone: string | null };

export function DepartmentDetailClient({
  department, members, people, canWrite,
}: { department: DeptInfo; members: MemberInfo[]; people: PersonOpt[]; canWrite: boolean }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const [removing, setRemoving] = useState<string | null>(null);

  const q = search.trim().toLowerCase();
  const shown = members.filter((m) => !q || matchesPerson(q, m));
  const reachable = members.filter((m) => m.phone).length;
  const candidates = people.map((p) => ({ value: p.id, label: p.name, hint: p.phone ?? undefined }));

  const addChosen = () => {
    if (chosen.length === 0) return;
    start(async () => {
      const res = await addDepartmentMembers(department.id, chosen);
      if (res.ok) {
        toast(`${res.added} added to ${department.name}`, "success");
        setChosen([]);
        setAdding(false);
        router.refresh();
      } else {
        toast(res.error, "error");
      }
    });
  };

  const remove = (id: string) => {
    setRemoving(id);
    const fd = new FormData();
    fd.set("departmentId", department.id);
    fd.set("personId", id);
    start(async () => { await removeDepartmentMember(fd); setRemoving(null); router.refresh(); });
  };

  const pgList = usePagedList(shown, 25, shown.length);
  return (
    <div>
      <Link href="/app/settings?tab=departments" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" /> All departments
      </Link>

      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold">{department.name}</h1>
        {department.description && <p className="mt-1 text-sm text-ink-muted">{department.description}</p>}
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <Card className="flex items-center gap-3 p-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Users2 className="size-5" /></span>
          <div>
            <div className="font-display text-2xl font-bold leading-none">{members.length}</div>
            <div className="mt-1 text-xs text-ink-muted">{members.length === 1 ? "person" : "people"} in this department</div>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-success/10 text-success"><MessageSquare className="size-5" /></span>
          <div>
            <div className="font-display text-2xl font-bold leading-none">{reachable}</div>
            <div className="mt-1 text-xs text-ink-muted">can be texted</div>
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-[1rem] font-semibold">
          Members <span className="rounded-full bg-surface-2 px-2 text-xs font-medium text-ink-muted">{members.length}</span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {members.length > 6 && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search members…"
                className="h-9 w-52 rounded-xl border border-line bg-surface pl-9 pr-3 text-sm outline-none focus:border-primary/50"
              />
            </div>
          )}
          {canWrite && <Button size="sm" onClick={() => setAdding(true)}><UserPlus /> Add people</Button>}
        </div>
      </div>

      <div className={cn("mt-3", pending && "opacity-70")}>
        {shown.length === 0 ? (
          <Card className="p-10 text-center">
            <Users2 className="mx-auto size-8 text-ink-faint" />
            <p className="mt-2 text-sm text-ink-muted">
              {members.length === 0
                ? "Nobody is in this department yet. Add people here, or let them choose it themselves on your sign-up form."
                : "Nobody matches that search."}
            </p>
            {canWrite && members.length === 0 && (
              <Button className="mt-4" size="sm" onClick={() => setAdding(true)}><UserPlus /> Add people</Button>
            )}
          </Card>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {pgList.slice.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
                <MemberAvatar name={m.name} photoUrl={m.photoUrl} gender={m.gender} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.name}</p>
                  <p className="flex items-center gap-1 truncate text-xs text-ink-muted">
                    {m.phone ? <><Phone className="size-3" /> {m.phone}</> : <span className="text-ink-faint">No phone</span>}
                    {m.inactive && <span className="ml-1 rounded bg-surface-2 px-1 text-[10px]">inactive</span>}
                  </p>
                </div>
                {canWrite && (
                  <button
                    onClick={() => remove(m.id)}
                    disabled={pending}
                    className="shrink-0 rounded-lg p-1.5 text-ink-faint hover:bg-danger/10 hover:text-danger"
                    title="Remove from department"
                  >
                    {removing === m.id ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={adding} onClose={() => setAdding(false)} title={`Add people to ${department.name}`}>
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            Pick as many people as you like. Visitors are left out - they join a department once they become members.
          </p>
          <MultiPicker options={candidates} defaultValue={chosen} onChange={setChosen} placeholder="Search by name or phone…" emptyLabel="Nobody picked yet" />
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setAdding(false)} disabled={pending}>Cancel</Button>
            <Button className="flex-1" onClick={addChosen} disabled={pending || chosen.length === 0}>
              {pending ? <><Loader2 className="animate-spin" /> Adding…</> : <><UserPlus /> Add {chosen.length || ""} {chosen.length === 1 ? "person" : "people"}</>}
            </Button>
          </div>
        </div>
      </Modal>
      {pgList.pager}
    </div>
  );
}
