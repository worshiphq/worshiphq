import { requireSuperAdmin } from "@/lib/auth";
import { AdminShell } from "@/components/admin/admin-shell";
import { TeamClient, type TeamAdmin } from "@/components/admin/team-client";
import { listSaAdmins, saEmail } from "@/lib/superadmin-security";
import { lockStatus, saPasswordKey, saCodeKey } from "@/lib/lockout";

export const metadata = { title: "Admin team" };

export default async function AdminTeamPage() {
  const sa = await requireSuperAdmin();
  const { ready, admins } = await listSaAdmins();
  const rows: TeamAdmin[] = await Promise.all(
    admins.map(async (a) => ({
      id: a.id, name: a.name, email: a.email, phone: a.phone, active: a.active,
      invited: !a.passwordHash,
      lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
      locked: (await lockStatus(saPasswordKey(a.email))).locked || (await lockStatus(saCodeKey(a.email))).locked,
    })),
  );

  return (
    <AdminShell>
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">Admin team</h1>
        <p className="mt-1 text-sm text-slate-400">The people who can sign in to this platform admin area. You are signed in as {sa.role === "owner" ? "the owner" : sa.name}.</p>
      </div>
      <TeamClient isOwner={sa.role === "owner"} ready={ready} ownerEmail={saEmail()} admins={rows} />
    </AdminShell>
  );
}
