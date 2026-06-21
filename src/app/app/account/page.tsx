import { PageHeader } from "@/components/app/page-header";
import { requireSession } from "@/lib/auth";
import { AccountForm } from "@/components/app/account-form";
import { db } from "@/lib/db";

export const metadata = { title: "My account" };

export default async function AccountPage() {
  const session = await requireSession();

  if (session.isDemo || session.impersonating) {
    return (
      <div>
        <PageHeader title="My account" description="Manage your profile and password." />
        <div className="rounded-2xl border border-dashed border-line p-8 text-sm text-ink-faint">
          Account editing isn&rsquo;t available in the demo / support view.
        </div>
      </div>
    );
  }

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { phone: true, phoneVerified: true },
  });

  return (
    <div>
      <PageHeader title="My account" description="Update your name, photo and password." />
      <AccountForm
        name={session.name}
        email={session.email}
        role={session.customRole ?? session.role}
        photoUrl={session.avatarUrl ?? null}
        phone={user?.phone ?? null}
        phoneVerified={user?.phoneVerified ?? false}
      />
    </div>
  );
}
