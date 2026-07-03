import { useEffect, useState, useMemo } from "react";
import { Loader2, Cake, Search, Heart, PartyPopper } from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Avatar } from "../components/ui/Avatar";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { cn } from "../lib/utils";

function getMonthDay(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseMMDD(mmdd: string): { month: number; day: number } {
  const [m, d] = mmdd.split("-").map(Number);
  return { month: m, day: d };
}

function daysUntil(mmdd: string, today: string): number {
  const { month: tm, day: td } = parseMMDD(today);
  const { month: m, day: d } = parseMMDD(mmdd);
  const year = new Date().getFullYear();
  let target = new Date(year, m - 1, d);
  const todayDate = new Date(year, tm - 1, td);
  if (target < todayDate) target = new Date(year + 1, m - 1, d);
  return Math.round((target.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
}

function formatMMDD(mmdd: string): string {
  const { month, day } = parseMMDD(mmdd);
  return new Date(2000, month - 1, day).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}

// Normalize a stored value (either MM-DD or a full ISO/YYYY-MM-DD date) to MM-DD
function toMMDD(val: string | null): string | null {
  if (!val) return null;
  if (/^\d{2}-\d{2}$/.test(val)) return val;
  const d = new Date(val);
  if (isNaN(d.getTime())) return null;
  return getMonthDay(d);
}

export function BirthdaysPage() {
  const { session, syncVersion } = useAppStore();
  const [people, setPeople] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"today" | "upcoming" | "all">("upcoming");

  const today = getMonthDay(new Date());

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  async function loadData() {
    setLoading(true);
    const rows = await db.rawQuery(
      `SELECT id, first_name, last_name, phone, photo_url, birthday, date_of_birth, anniversary
       FROM person WHERE church_id = ?
       AND ((birthday IS NOT NULL AND birthday != '')
            OR (date_of_birth IS NOT NULL AND date_of_birth != '')
            OR (anniversary IS NOT NULL AND anniversary != ''))
       ORDER BY first_name ASC, last_name ASC`,
      [session!.churchId]
    );
    setPeople(rows);
    setLoading(false);
  }

  const enriched = useMemo(() => {
    return people
      .map((p) => {
        const bday = toMMDD(p.birthday) ?? toMMDD(p.date_of_birth);
        const anniv = toMMDD(p.anniversary);
        const bdayDays = bday ? daysUntil(bday, today) : null;
        const annivDays = anniv ? daysUntil(anniv, today) : null;
        const nearestDays = Math.min(bdayDays ?? 999, annivDays ?? 999);
        return {
          ...p,
          name: `${p.first_name} ${p.last_name}`,
          birthday: bday, anniversary: anniv, bdayDays, annivDays, nearestDays,
        };
      })
      .sort((a, b) => a.nearestDays - b.nearestDays);
  }, [people, today]);

  const todayCount = enriched.filter((i) => i.nearestDays === 0).length;
  const monthCount = enriched.filter((i) => i.nearestDays <= 30).length;

  const filtered = useMemo(() => {
    return enriched.filter((item) => {
      if (view === "today" && item.nearestDays !== 0) return false;
      if (view === "upcoming" && item.nearestDays > 30) return false;
      if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [enriched, view, search]);

  return (
    <PageShell title="Birthdays">
      <PageHeader title="Birthdays & anniversaries" description="Celebrate your members. See who has a birthday or anniversary coming up." />

      <div className="mb-5 grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="With Celebrations" value={enriched.length} icon={Cake} color="text-primary-bright" />
        <StatCard label="Next 30 Days" value={monthCount} icon={PartyPopper} color="text-gold" />
        <StatCard label="Today" value={todayCount} icon={Cake} color="text-success" />
      </div>

      {todayCount > 0 && (
        <div className="card mb-4 flex items-center gap-3 bg-primary/5 p-4">
          <PartyPopper className="size-5 text-primary-bright" />
          <span className="text-sm font-medium text-ink">{todayCount} member{todayCount !== 1 ? "s" : ""} celebrating today!</span>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} className="input h-9 pl-9" placeholder="Search members..." />
        </div>
        <div className="flex gap-1">
          {(["today", "upcoming", "all"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={cn("rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                view === v ? "bg-primary-bright text-white" : "bg-surface-2 text-ink-muted hover:bg-surface-3")}>
              {v === "today" ? `Today (${todayCount})` : v === "upcoming" ? "Next 30 days" : "All"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <Cake className="mx-auto size-10 text-ink-faint/30" />
          <p className="mt-3 text-sm font-medium text-ink">
            {view === "today" ? "No birthdays or anniversaries today." : search ? "No members match your search." : "No upcoming celebrations."}
          </p>
          <p className="mt-1 text-xs text-ink-muted">Add birthday/anniversary info to member profiles.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map((item) => (
            <div key={item.id} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5", item.nearestDays === 0 ? "bg-primary/5" : "hover:bg-surface-2")}>
              <Avatar name={item.name} src={item.photo_url} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{item.name}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-muted">
                  {item.birthday && (
                    <span className="flex items-center gap-1">
                      <Cake className="size-3" /> {formatMMDD(item.birthday)}
                      {item.bdayDays === 0 && <span className="ml-1 badge badge-primary text-[10px]">Today!</span>}
                      {item.bdayDays !== null && item.bdayDays > 0 && item.bdayDays <= 7 && <span className="text-primary-bright font-medium">in {item.bdayDays}d</span>}
                    </span>
                  )}
                  {item.anniversary && (
                    <span className="flex items-center gap-1">
                      <Heart className="size-3" /> {formatMMDD(item.anniversary)}
                      {item.annivDays === 0 && <span className="ml-1 rounded-full bg-success/10 px-1.5 py-0.5 text-[10px] font-bold text-success">Today!</span>}
                      {item.annivDays !== null && item.annivDays > 0 && item.annivDays <= 7 && <span className="text-success font-medium">in {item.annivDays}d</span>}
                    </span>
                  )}
                </div>
              </div>
              {item.phone && <span className="hidden text-xs text-ink-faint sm:block">{item.phone}</span>}
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
