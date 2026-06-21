import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { BirthdaysClient } from "@/components/app/birthdays-client";
import { PageHeader } from "@/components/app/page-header";

export const metadata = { title: "Birthdays & anniversaries" };

function getMonthDay(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function BirthdaysPage() {
  const session = await requireModule("people");

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
      <BirthdaysClient items={items} today={today} />
    </div>
  );
}
