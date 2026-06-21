"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MemberAvatar } from "@/components/ui/member-avatar";
import { Search, Cake, Heart, PartyPopper } from "lucide-react";

type Item = {
  id: string;
  name: string;
  phone: string | null;
  photoUrl: string | null;
  birthday: string | null;
  anniversary: string | null;
};

function parseMMDD(mmdd: string): { month: number; day: number } {
  const [m, d] = mmdd.split("-").map(Number);
  return { month: m, day: d };
}

function daysUntil(mmdd: string, today: string): number {
  const { month: tm, day: td } = parseMMDD(today);
  const { month: m, day: d } = parseMMDD(mmdd);
  const thisYear = new Date().getFullYear();

  let target = new Date(thisYear, m - 1, d);
  const todayDate = new Date(thisYear, tm - 1, td);

  if (target < todayDate) {
    target = new Date(thisYear + 1, m - 1, d);
  }

  return Math.round((target.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(mmdd: string): string {
  const { month, day } = parseMMDD(mmdd);
  const d = new Date(2000, month - 1, day);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}

export function BirthdaysClient({ items, today }: { items: Item[]; today: string }) {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"upcoming" | "all" | "today">("upcoming");

  const enriched = useMemo(() => {
    return items
      .map((item) => {
        const bdayDays = item.birthday ? daysUntil(item.birthday, today) : null;
        const annivDays = item.anniversary ? daysUntil(item.anniversary, today) : null;
        const nearestDays = Math.min(bdayDays ?? 999, annivDays ?? 999);
        return { ...item, bdayDays, annivDays, nearestDays };
      })
      .sort((a, b) => a.nearestDays - b.nearestDays);
  }, [items, today]);

  const filtered = enriched.filter((item) => {
    if (view === "today" && item.nearestDays !== 0) return false;
    if (view === "upcoming" && item.nearestDays > 30) return false;
    if (!search) return true;
    return item.name.toLowerCase().includes(search.toLowerCase());
  });

  const todayCount = enriched.filter((i) => i.nearestDays === 0).length;

  return (
    <div className="mt-5 space-y-4">
      {todayCount > 0 && (
        <Card className="flex items-center gap-3 bg-brand/5 p-4">
          <PartyPopper className="size-5 text-brand" />
          <span className="text-sm font-medium">
            {todayCount} member{todayCount !== 1 ? "s" : ""} celebrating today!
          </span>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            placeholder="Search members..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-1">
          {(["today", "upcoming", "all"] as const).map((v) => (
            <Button
              key={v}
              variant={view === v ? "primary" : "secondary"}
              size="sm"
              onClick={() => setView(v)}
            >
              {v === "today" ? `Today (${todayCount})` : v === "upcoming" ? "Next 30 days" : "All"}
            </Button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <Cake className="mx-auto size-10 text-ink-faint" />
          <p className="mt-3 text-sm text-ink-muted">
            {view === "today"
              ? "No birthdays or anniversaries today."
              : search
                ? "No members match your search."
                : "No upcoming celebrations. Add birthday/anniversary info to member profiles."}
          </p>
        </Card>
      ) : (
        <div className="space-y-1">
          {filtered.map((item) => (
            <div
              key={item.id}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${
                item.nearestDays === 0 ? "bg-brand/5" : "hover:bg-surface-2"
              }`}
            >
              <MemberAvatar name={item.name} photoUrl={item.photoUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{item.name}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-muted">
                  {item.birthday && (
                    <span className="flex items-center gap-1">
                      <Cake className="size-3" />
                      {formatDate(item.birthday)}
                      {item.bdayDays === 0 && (
                        <Badge variant="default" className="ml-1 bg-brand/10 text-brand text-[10px]">Today!</Badge>
                      )}
                      {item.bdayDays !== null && item.bdayDays > 0 && item.bdayDays <= 7 && (
                        <span className="text-brand font-medium">in {item.bdayDays}d</span>
                      )}
                    </span>
                  )}
                  {item.anniversary && (
                    <span className="flex items-center gap-1">
                      <Heart className="size-3" />
                      {formatDate(item.anniversary)}
                      {item.annivDays === 0 && (
                        <Badge variant="default" className="ml-1 bg-success/10 text-success text-[10px]">Today!</Badge>
                      )}
                      {item.annivDays !== null && item.annivDays > 0 && item.annivDays <= 7 && (
                        <span className="text-success font-medium">in {item.annivDays}d</span>
                      )}
                    </span>
                  )}
                </div>
              </div>
              {item.phone && (
                <span className="hidden text-xs text-ink-faint sm:block">{item.phone}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
