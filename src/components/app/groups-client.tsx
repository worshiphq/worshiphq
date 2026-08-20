"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search, Users2, MapPin, Calendar, User, Trash2, ChevronRight, Pencil,
} from "lucide-react";
import { deleteGroup, updateGroup } from "@/app/actions/groups";
import { ActionDialog, Field } from "@/components/app/action-dialog";
import Link from "next/link";

type GroupRow = {
  id: string;
  name: string;
  type: string;
  description: string | null;
  meetingDay: string | null;
  meetingTime: string | null;
  location: string | null;
  isActive: boolean;
  leaderId: string | null;
  leaderName: string | null;
  memberCount: number;
};

type PersonOpt = { id: string; name: string };
type DayOpt = { label: string; value: string };

const TYPE_LABELS: Record<string, string> = {
  small_group: "Small group",
  ministry: "Ministry",
  committee: "Committee",
  fellowship: "Fellowship",
};

export function GroupsClient({ items, people, typeSuggestions, dayOptions, canWrite }: {
  items: GroupRow[];
  people: PersonOpt[];
  typeSuggestions: string[];
  dayOptions: DayOpt[];
  canWrite: boolean;
}) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [pending, start] = useTransition();

  const types = [...new Set(items.map((g) => g.type))];

  const filtered = items.filter((g) => {
    if (typeFilter !== "all" && g.type !== typeFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      g.name.toLowerCase().includes(q) ||
      g.leaderName?.toLowerCase().includes(q) ||
      g.location?.toLowerCase().includes(q)
    );
  });

  const handleDelete = (id: string) => {
    const fd = new FormData();
    fd.set("id", id);
    start(() => deleteGroup(fd));
  };

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            placeholder="Search groups..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-1">
          <Button
            variant={typeFilter === "all" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setTypeFilter("all")}
          >
            All
          </Button>
          {types.map((t) => (
            <Button
              key={t}
              variant={typeFilter === t ? "primary" : "secondary"}
              size="sm"
              onClick={() => setTypeFilter(t)}
            >
              {TYPE_LABELS[t] ?? t}
            </Button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <Users2 className="mx-auto size-10 text-ink-faint" />
          <p className="mt-3 text-sm text-ink-muted">
            {search ? "No groups match your search." : "No groups yet. Create one to get started."}
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((g) => (
            <Card key={g.id} className={`relative p-4 transition hover:shadow-md ${pending ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <Link href={`/app/groups/${g.id}`} className="group flex items-center gap-1">
                    <h3 className="text-sm font-semibold group-hover:text-brand">{g.name}</h3>
                    <ChevronRight className="size-3.5 text-ink-faint group-hover:text-brand" />
                  </Link>
                  <Badge variant="default" className="mt-1 text-[10px]">
                    {TYPE_LABELS[g.type] ?? g.type}
                  </Badge>
                </div>
                {canWrite && (
                  <div className="flex shrink-0 items-center gap-1">
                    <EditGroupDialog g={g} people={people} typeSuggestions={typeSuggestions} dayOptions={dayOptions} />
                    <button
                      onClick={() => handleDelete(g.id)}
                      className="rounded-lg p-1.5 text-ink-faint hover:bg-danger/10 hover:text-danger"
                      title="Delete"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                )}
              </div>

              {g.description && (
                <p className="mt-2 line-clamp-2 text-xs text-ink-muted">{g.description}</p>
              )}

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                <span className="flex items-center gap-1">
                  <Users2 className="size-3" /> {g.memberCount} member{g.memberCount !== 1 ? "s" : ""}
                </span>
                {g.leaderName && (
                  <span className="flex items-center gap-1">
                    <User className="size-3" /> {g.leaderName}
                  </span>
                )}
                {g.meetingDay && (
                  <span className="flex items-center gap-1">
                    <Calendar className="size-3" /> {g.meetingDay}
                    {g.meetingTime && ` at ${g.meetingTime}`}
                  </span>
                )}
                {g.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3" /> {g.location}
                  </span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function EditGroupDialog({ g, people, typeSuggestions, dayOptions }: {
  g: GroupRow; people: PersonOpt[]; typeSuggestions: string[]; dayOptions: DayOpt[];
}) {
  return (
    <ActionDialog
      triggerLabel=""
      triggerIcon={<Pencil className="size-4" />}
      variant="secondary"
      title="Edit group"
      description="Update this group’s details."
      submitLabel="Save changes"
      action={updateGroup}
      successMessage="Group updated"
    >
      <input type="hidden" name="id" value={g.id} />
      <Field label="Name" name="name" defaultValue={g.name} required />
      <Field label="Type" name="type" suggestions={typeSuggestions} defaultValue={g.type} hint="Pick one or type your own" />
      <Field label="Description" name="description" defaultValue={g.description ?? ""} />
      <Field label="Meeting day" name="meetingDay" options={dayOptions} defaultValue={g.meetingDay ?? ""} />
      <Field label="Meeting time" name="meetingTime" type="time" defaultValue={g.meetingTime ?? ""} />
      <Field label="Location" name="location" defaultValue={g.location ?? ""} />
      <Field
        label="Leader"
        name="leaderId"
        options={[{ label: "— No leader —", value: "" }, ...people.map((p) => ({ label: p.name, value: p.id }))]}
        defaultValue={g.leaderId ?? ""}
      />
    </ActionDialog>
  );
}
