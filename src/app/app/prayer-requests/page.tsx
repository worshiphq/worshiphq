import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { db } from "@/lib/db";
import { PrayerRequestsClient } from "@/components/app/prayer-requests-client";
import { createPrayerRequest } from "@/app/actions/prayer-requests";
import { PageHeader } from "@/components/app/page-header";
import { ActionDialog, Field } from "@/components/app/action-dialog";
import { Plus } from "lucide-react";
import { headers } from "next/headers";
import { asExtra } from "@/components/app/extra-answers";

export const metadata = { title: "Prayer requests" };

export default async function PrayerRequestsPage() {
  const session = await requireModule("prayer-requests");

  const [requests, church] = await Promise.all([
    db.prayerRequest.findMany({
      where: { churchId: session.churchId },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 2000,
    }),
    db.church.findUnique({
      where: { id: session.churchId },
      select: { slug: true },
    }),
  ]);

  const h = await headers();
  const host = h.get("host") ?? "worshiphq.com";
  const proto = host.includes("localhost") ? "http" : "https";
  const prayUrl = church?.slug ? `${proto}://${host}/pray/${church.slug}` : "";

  return (
    <div>
      <PageHeader
        title="Prayer requests"
        description="View and manage prayer requests from your congregation."
      >
        <ActionDialog
          triggerLabel="Add request"
          triggerIcon={<Plus />}
          title="New prayer request"
          description="Add a prayer request on behalf of a member."
          submitLabel="Submit"
          action={createPrayerRequest}
          disabled={!canEdit(session, "prayer-requests")}
        >
          <Field label="Name" name="name" placeholder="Full name" required />
          <Field label="Prayer request" name="request" placeholder="What would you like prayer for?" required />
          <Field label="Anonymous" name="isAnonymous" type="checkbox" />
        </ActionDialog>
      </PageHeader>

      <PrayerRequestsClient
        prayUrl={prayUrl}
        canWrite={canEdit(session, "prayer-requests")}
        items={requests.map((r) => ({
          id: r.id,
          name: r.name,
          request: r.request,
          isAnonymous: r.isAnonymous,
          status: r.status,
          extra: asExtra(r.extra),
          prayedAt: r.prayedAt?.toISOString() ?? null,
          prayedBy: r.prayedBy,
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
