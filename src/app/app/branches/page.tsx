import { Plus, Building2, Users, MapPin, HandCoins, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireModule } from "@/lib/auth";
import { getBranches } from "@/lib/data/modules";
import { createBranch, deleteBranch } from "@/app/actions/branches";
import { ActionDialog, Field } from "@/components/app/action-dialog";
import { DeleteForm } from "@/components/app/delete-form";
import { formatCurrency } from "@/config/brand";

export const metadata = { title: "Branches" };

export default async function BranchesPage() {
  const session = await requireModule("branches");
  const branches = await getBranches(session.churchId);
  const canDelete = session.canDelete && !session.isDemo;
  const totalMembers = branches.reduce((s, b) => s + b.members, 0);
  const totalGiving = branches.reduce((s, b) => s + b.giving, 0);

  return (
    <div>
      <PageHeader title="Branches" description="Run every campus from one command center, with roll-up reporting.">
        <ActionDialog
          triggerLabel="Add branch"
          triggerIcon={<Plus />}
          title="Add a branch"
          description="Create a campus or satellite location."
          submitLabel="Add branch"
          action={createBranch}
          disabled={session.isDemo}
        >
          <Field label="Branch name" name="name" placeholder="East Legon" required />
          <Field label="City" name="city" placeholder="Accra" />
        </ActionDialog>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Branches" value={branches.length} icon={Building2} />
        <StatCard label="Total members" value={totalMembers} icon={Users} />
        <StatCard label="Combined giving" value={totalGiving} prefix="₵" icon={HandCoins} />
        <StatCard label="Campuses" value={branches.length} icon={TrendingUp} />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {branches.map((b) => (
          <Card key={b.id} hover className="p-6">
            <div className="flex items-center gap-3">
              <div className="grid size-12 place-items-center rounded-2xl border border-primary/30 bg-primary/10 text-primary-bright"><Building2 className="size-6" /></div>
              <div>
                <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
                  {b.name}
                  {b.isHQ && <Badge variant="primary" className="px-1.5 py-0 text-[9px]">HQ</Badge>}
                </h3>
                <div className="flex items-center gap-1 text-xs text-ink-faint"><MapPin className="size-3" /> {b.city ?? "—"}</div>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4">
              <Metric label="Members" value={b.members.toLocaleString()} />
              <Metric label="Giving" value={formatCurrency(b.giving)} />
            </div>
            {canDelete && !b.isHQ && (
              <div className="mt-3 flex justify-end border-t border-line-soft pt-3">
                <DeleteForm action={deleteBranch.bind(null, b.id)} confirm={`Delete branch "${b.name}"?`} successMessage="Branch deleted" label="Delete" />
              </div>
            )}
          </Card>
        ))}
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
