import { Plus, Building2, Users, MapPin, HandCoins, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { branches } from "@/lib/demo/data";
import { formatCurrency } from "@/config/brand";

export default function BranchesPage() {
  const totalMembers = branches.reduce((s, b) => s + b.members, 0);

  return (
    <div>
      <PageHeader title="Branches" description="Run every campus from one command center, with roll-up reporting.">
        <Button size="sm"><Plus /> Add branch</Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Branches" value={branches.length} icon={Building2} />
        <StatCard label="Total members" value={totalMembers} change={3.4} icon={Users} />
        <StatCard label="Combined giving (mo)" value={142000} prefix="₵" change={9.6} icon={HandCoins} />
        <StatCard label="Combined attendance" value={3106} change={5.1} icon={TrendingUp} />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {branches.map((b) => {
          const giving = Math.round(b.members * 47);
          const attendance = Math.round(b.members * 0.48);
          return (
            <Card key={b.id} hover className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="grid size-12 place-items-center rounded-2xl border border-primary/30 bg-primary/10 text-primary-bright">
                    <Building2 className="size-6" />
                  </div>
                  <div>
                    <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
                      {b.name}
                      {b.isHQ && <Badge variant="primary" className="px-1.5 py-0 text-[9px]">HQ</Badge>}
                    </h3>
                    <div className="flex items-center gap-1 text-xs text-ink-faint"><MapPin className="size-3" /> {b.city}</div>
                  </div>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4">
                <Metric label="Members" value={b.members.toLocaleString()} />
                <Metric label="Attendance" value={attendance.toLocaleString()} />
                <Metric label="Giving (mo)" value={formatCurrency(giving)} />
              </div>
              <Button variant="secondary" size="sm" className="mt-4 w-full">View branch dashboard</Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-ink-faint">{label}</div>
      <div className="mt-0.5 font-display text-lg font-bold">{value}</div>
    </div>
  );
}
