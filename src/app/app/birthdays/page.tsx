import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { BirthdaysClient } from "@/components/app/birthdays-client";
import { BirthdaySettings } from "@/components/app/birthday-settings";
import { PageHeader } from "@/components/app/page-header";

export const metadata = { title: "Birthdays & anniversaries" };

function getMonthDay(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function BirthdaysPage() {
  const session = await requireModule("birthdays");

  const [church, membersWithPhone, adminCount] = await Promise.all([
    db.church.findUnique({
      where: { id: session.churchId },
      select: {
        timezone: true, birthdaySendHour: true, birthdayWishOn: true,
        birthdayAdminAlertOn: true, birthdayDigestOn: true, birthdayDigestDay: true,
        messageTemplates: true,
      },
    }),
    db.person.count({ where: { churchId: session.churchId, status: { not: "inactive" }, phone: { not: null } } }),
    db.user.count({ where: { churchId: session.churchId, role: { in: ["Owner", "Admin", "Pastor"] }, phone: { not: null } } }),
  ]);

  const people = await db.person.findMany({
    where: {
      churchId: session.churchId,
      OR: [
        { birthday: { not: null } },
        { dateOfBirth: { not: null } },
        { anniversary: { not: null } },
      ],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      photoUrl: true,
      birthday: true,
      dateOfBirth: true,
      anniversary: true,
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });

  const now = new Date();
  const today = getMonthDay(now);

  const items = people.map((p) => {
    const bday = p.birthday ?? (p.dateOfBirth ? getMonthDay(p.dateOfBirth) : null);
    return {
      id: p.id,
      name: `${p.firstName} ${p.lastName}`,
      phone: p.phone,
      photoUrl: p.photoUrl,
      birthday: bday,
      anniversary: p.anniversary,
    };
  });

  return (
    <div>
      <PageHeader
        title="Birthdays & anniversaries"
        description="Celebrate your members. See who has a birthday or anniversary coming up."
      />
      <BirthdaySettings
        settings={{
          timezone: church?.timezone ?? "Africa/Accra",
          sendHour: church?.birthdaySendHour ?? 8,
          wishOn: church?.birthdayWishOn ?? true,
          adminAlertOn: church?.birthdayAdminAlertOn ?? false,
          digestOn: church?.birthdayDigestOn ?? false,
          digestDay: church?.birthdayDigestDay ?? 1,
        }}
        membersWithPhone={membersWithPhone}
        adminCount={adminCount}
        messageTemplates={(church?.messageTemplates as Record<string, string> | null) ?? {}}
        canWrite={!session.isDemo}
      />
      <div className="mt-4">
        <BirthdaysClient items={items} today={today} />
      </div>
    </div>
  );
}
