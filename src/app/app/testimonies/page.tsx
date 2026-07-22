import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { TestimoniesClient } from "@/components/app/testimonies-client";
import { createTestimony } from "@/app/actions/testimonies";
import { PageHeader } from "@/components/app/page-header";
import { ActionDialog, Field } from "@/components/app/action-dialog";
import { Plus } from "lucide-react";

export const metadata = { title: "Testimonies" };

export default async function TestimoniesPage() {
  const session = await requireModule("testimonies");

  const [testimonies, members] = await Promise.all([
    db.testimony.findMany({
      where: { churchId: session.churchId },
      orderBy: { date: "desc" },
      take: 200,
      include: { person: { select: { firstName: true, lastName: true } } },
    }),
    db.person.findMany({
      where: { churchId: session.churchId },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);

  const memberOptions = members.map((m) => ({ label: `${m.firstName} ${m.lastName}`, value: m.id }));

  return (
    <div>
      <PageHeader
        title="Testimonies & praise reports"
        description="Capture and share what God is doing in your congregation."
      >
        <ActionDialog
          triggerLabel="Add testimony"
          triggerIcon={<Plus />}
          title="Add testimony"
          description="Record a testimony or praise report."
          submitLabel="Save"
          action={createTestimony}
          disabled={session.isDemo}
        >
          <Field label="Title" name="title" placeholder="e.g. Miraculous healing" required />
          <Field label="Category" name="category" type="select" options={[
            { label: "Praise report", value: "praise" },
            { label: "Healing", value: "healing" },
            { label: "Provision", value: "provision" },
            { label: "Deliverance", value: "deliverance" },
            { label: "Salvation", value: "salvation" },
            { label: "Other", value: "other" },
          ]} />
          <Field label="Member (optional)" name="personId" type="select" options={memberOptions} />
          <Field label="Date" name="date" type="date" />
          <Field label="Testimony" name="body" type="textarea" placeholder="Share the testimony..." required />
        </ActionDialog>
      </PageHeader>

      <TestimoniesClient
        testimonies={testimonies.map((t) => ({
          id: t.id,
          title: t.title,
          body: t.body,
          category: t.category,
          status: t.status,
          anonymous: t.anonymous,
          memberName: t.person ? `${t.person.firstName} ${t.person.lastName}` : null,
          date: t.date.toISOString(),
        }))}
      />
    </div>
  );
}
