import { useEffect, useState, useMemo } from "react";
import { Loader2, Cake, Search, Phone, Gift } from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Avatar } from "../components/ui/Avatar";
import { db } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { cn } from "../lib/utils";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function BirthdaysPage() {
  const { session, syncVersion } = useAppStore();
  const [people, setPeople] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState<number>(new Date().getMonth());

  useEffect(() => {
    if (session?.churchId) loadData();
  }, [session?.churchId, syncVersion]);

  async function loadData() {
    setLoading(true);
    const rows = await db.rawQuery(
      "SELECT * FROM person WHERE church_id = ? AND date_of_birth IS NOT NULL AND date_of_birth != '' ORDER BY date_of_birth ASC",
      [session!.churchId]
    );
    setPeople(rows);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    let list = people;
    if (monthFilter >= 0) {
      list = list.filter((p) => {
        const dob = p.date_of_birth;
        if (!dob) return false;
        const month = parseInt(dob.slice(5, 7), 10) - 1;
        return month === monthFilter;
      });
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.first_name?.toLowerCase().includes(q) || p.last_name?.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      const dayA = parseInt(a.date_of_birth?.slice(8, 10) || "0", 10);
      const dayB = parseInt(b.date_of_birth?.slice(8, 10) || "0", 10);
      return dayA - dayB;
    });
    return list;
  }, [people, search, monthFilter]);

  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = people.filter((p) => {
      const m = parseInt(p.date_of_birth?.slice(5, 7) || "0", 10) - 1;
      return m === now.getMonth();
    });
    const today = people.filter((p) => {
      const dob = p.date_of_birth;
      if (!dob) return false;
      return parseInt(dob.slice(5, 7), 10) - 1 === now.getMonth() && parseInt(dob.slice(8, 10), 10) === now.getDate();
    });
    return { total: people.length, thisMonth: thisMonth.length, today: today.length };
  }, [people]);

  function formatBirthday(dob: string) {
    if (!dob) return "—";
    const [y, m, d] = dob.split("-");
    return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
  }

  const today = new Date();
  function isBirthdayToday(dob: string) {
    if (!dob) return false;
    return parseInt(dob.slice(5, 7), 10) - 1 === today.getMonth() && parseInt(dob.slice(8, 10), 10) === today.getDate();
  }

  return (
    <PageShell title="Birthdays">
      <PageHeader title="Birthdays" description="Track member birthdays by month." />

      <div className="mb-5 grid grid-cols-3 gap-3">
        <StatCard label="Members with DOB" value={stats.total} icon={Cake} color="bg-primary-soft text-primary-bright" />
        <StatCard label="This Month" value={stats.thisMonth} icon={Gift} color="bg-gold/10 text-gold" />
        <StatCard label="Today" value={stats.today} icon={Cake} color="bg-success/10 text-success" />
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} className="input h-9 pl-9" placeholder="Search by name..." />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-1">
        <button onClick={() => setMonthFilter(-1)}
          className={cn("rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            monthFilter === -1 ? "bg-primary-bright text-white" : "bg-surface-2 text-ink-muted hover:bg-surface-3"
          )}>All</button>
        {MONTH_NAMES.map((m, i) => (
          <button key={m} onClick={() => setMonthFilter(i)}
            className={cn("rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              monthFilter === i ? "bg-primary-bright text-white" : "bg-surface-2 text-ink-muted hover:bg-surface-3"
            )}>{m}</button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <Cake className="mx-auto size-10 text-ink-faint/30" />
          <p className="mt-3 text-sm font-medium text-ink">{search ? "No matches" : "No birthdays this month"}</p>
        </div>
      ) : (
        <div className="grid gap-2 grid-cols-3">
          {filtered.map((p) => (
            <div key={p.id} className={cn("card p-3 flex items-center gap-3", isBirthdayToday(p.date_of_birth) && "border-gold/40 bg-gold/5")}>
              <Avatar name={`${p.first_name} ${p.last_name}`} src={p.photo_url} size="sm" />
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-sm text-ink">{p.first_name} {p.last_name}</h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-ink-muted font-medium">{formatBirthday(p.date_of_birth)}</span>
                  {p.phone && <span className="flex items-center gap-1 text-[11px] text-ink-faint"><Phone className="size-3" />{p.phone}</span>}
                </div>
              </div>
              {isBirthdayToday(p.date_of_birth) && <span className="rounded-full bg-gold/10 px-2 py-0.5 text-[10px] font-bold text-gold">Today!</span>}
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
