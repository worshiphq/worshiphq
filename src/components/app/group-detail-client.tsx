"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MemberAvatar } from "@/components/ui/member-avatar";
import {
  Users2, MapPin, Calendar, Clock, User, UserPlus, X, ArrowLeft, Search,
} from "lucide-react";
import { addGroupMember, removeGroupMember } from "@/app/actions/groups";
import Link from "next/link";

type GroupInfo = {
  id: string;
  name: string;
  type: string;
  description: string | null;
  meetingDay: string | null;
  meetingTime: string | null;
  location: string | null;
  isActive: boolean;
  leader: { id: string; name: string; phone: string | null } | null;
};

type MemberInfo = { id: string; name: string; phone: string | null; photoUrl: string | null };
type AvailablePerson = { id: string; name: string };

const TYPE_LABELS: Record<string, string> = {
  small_group: "Small group",
  ministry: "Ministry",
  committee: "Committee",
  fellowship: "Fellowship",
};

export function GroupDetailClient({
  group,
  members,
  available,
  isDemo,
}: {
  group: GroupInfo;
  members: MemberInfo[];
  available: AvailablePerson[];
  isDemo: boolean;
}) {
  const [search, setSearch] = useState("");
  const [addSearch, setAddSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [pending, start] = useTransition();

  const filteredMembers = members.filter((m) => {
    if (!search) return true;
    return m.name.toLowerCase().includes(search.toLowerCase());
  });

  const filteredAvailable = available.filter((p) => {
    if (!addSearch) return true;
    return p.name.toLowerCase().includes(addSearch.toLowerCase());
  }).slice(0, 20);

  const handleAdd = (personId: string) => {
    const fd = new FormData();
    fd.set("groupId", group.id);
    fd.set("personId", personId);
    start(() => addGroupMember(fd));
  };

  const handleRemove = (personId: string) => {
    const fd = new FormData();
    fd.set("groupId", group.id);
    fd.set("personId", personId);
    start(() => removeGroupMember(fd));
  };

  return (
    <div className={pending ? "opacity-60" : ""}>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href="/app/groups" className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-2">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{group.name}</h1>
            <Badge variant="default">{TYPE_LABELS[group.type] ?? group.type}</Badge>
          </div>
          {group.description && <p className="mt-0.5 text-sm text-ink-muted">{group.description}</p>}
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {group.leader && (
          <Card className="flex items-center gap-3 p-3">
            <User className="size-4 text-brand" />
            <div>
              <p className="text-xs text-ink-muted">Leader</p>
              <p className="text-sm font-medium">{group.leader.name}</p>
            </div>
          </Card>
        )}
        {group.meetingDay && (
          <Card className="flex items-center gap-3 p-3">
            <Calendar className="size-4 text-brand" />
            <div>
              <p className="text-xs text-ink-muted">Meets</p>
              <p className="text-sm font-medium">
                {group.meetingDay}{group.meetingTime ? ` at ${group.meetingTime}` : ""}
              </p>
            </div>
          </Card>
        )}
        {group.location && (
          <Card className="flex items-center gap-3 p-3">
            <MapPin className="size-4 text-brand" />
            <div>
              <p className="text-xs text-ink-muted">Location</p>
              <p className="text-sm font-medium">{group.location}</p>
            </div>
          </Card>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Users2 className="size-4" /> Members ({members.length})
        </h2>
        {!isDemo && (
          <Button size="sm" variant="secondary" onClick={() => setShowAdd(!showAdd)}>
            {showAdd ? <X className="size-4" /> : <UserPlus className="size-4" />}
            {showAdd ? "Close" : "Add member"}
          </Button>
        )}
      </div>

      {showAdd && (
        <Card className="mt-3 p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
            <Input
              placeholder="Search members to add..."
              value={addSearch}
              onChange={(e) => setAddSearch(e.target.value)}
              className="pl-10"
              autoFocus
            />
          </div>
          {filteredAvailable.length === 0 ? (
            <p className="mt-3 text-center text-xs text-ink-muted">No members available to add.</p>
          ) : (
            <div className="mt-3 max-h-48 space-y-1 overflow-y-auto">
              {filteredAvailable.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleAdd(p.id)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface-2"
                >
                  <UserPlus className="size-3.5 text-brand" />
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      <div className="mt-3">
        {members.length > 5 && (
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
            <Input
              placeholder="Search members..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        )}

        {filteredMembers.length === 0 ? (
          <Card className="p-8 text-center">
            <Users2 className="mx-auto size-8 text-ink-faint" />
            <p className="mt-2 text-sm text-ink-muted">No members in this group yet.</p>
          </Card>
        ) : (
          <div className="space-y-1">
            {filteredMembers.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-surface-2"
              >
                <MemberAvatar name={m.name} photoUrl={m.photoUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{m.name}</p>
                  {m.phone && <p className="text-xs text-ink-muted">{m.phone}</p>}
                </div>
                {group.leader?.id === m.id && (
                  <Badge variant="default" className="text-[10px]">Leader</Badge>
                )}
                {!isDemo && (
                  <button
                    onClick={() => handleRemove(m.id)}
                    className="shrink-0 rounded-lg p-1.5 text-ink-faint hover:bg-danger/10 hover:text-danger"
                    title="Remove from group"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
