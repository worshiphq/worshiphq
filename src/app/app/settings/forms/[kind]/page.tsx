import { notFound, redirect } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { FORM_KINDS, isFormKind } from "@/lib/forms/kinds";
import { FormStudio } from "@/components/app/form-studio";

export const metadata = { title: "Customize form" };

export default async function FormStudioPage({ params }: { params: Promise<{ kind: string }> }) {
  const session = await requireModule("settings");
  if (session.role !== "Owner" && session.role !== "Admin") redirect("/app/settings");
  const { kind } = await params;
  if (!isFormKind(kind)) notFound();
  const info = FORM_KINDS[kind];

  const church = await db.church.findUnique({
    where: { id: session.churchId },
    select: {
      name: true, slug: true, accentColor: true,
      registrationFields: true, visitorFormFields: true, childrenFormFields: true, teensFormFields: true,
      prayerFormFields: true, testimonyFormFields: true, counselFormFields: true, giveFormFields: true, bookingFormFields: true,
      departments: { select: { id: true, name: true }, orderBy: { name: "asc" } },
    },
  });
  if (!church) notFound();

  const raw = (church as unknown as Record<string, unknown>)[info.column];
  return (
    <FormStudio
      kind={kind}
      initial={info.resolve(raw)}
      accent={church.accentColor}
      churchName={church.name}
      slug={church.slug}
      departments={church.departments}
      readOnly={session.isDemo}
    />
  );
}
