import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { db } from "@/lib/db";
import { audienceOptions } from "@/lib/sms/audience";
import { DevotionalEditor } from "@/components/app/devotional-editor";

export const metadata = { title: "Devotional" };

export default async function DevotionalPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireModule("devotionals");
  const { id } = await params;
  const [d, audiences, prior] = await Promise.all([
    db.devotional.findFirst({ where: { id, churchId: session.churchId } }),
    audienceOptions(session.churchId),
    db.devotional.findMany({ where: { churchId: session.churchId }, select: { author: true }, take: 200, orderBy: { date: "desc" } }),
  ]);
  if (!d) notFound();
  return (
    <DevotionalEditor
      canWrite={canEdit(session, "devotionals")}
      audiences={audiences}
      authorSuggestions={[...new Set(prior.map((p) => p.author).filter((x): x is string => !!x))]}
      initial={{
        id: d.id, title: d.title, scripture: d.scripture ?? "", author: d.author ?? "",
        date: d.date.toISOString().slice(0, 10), body: d.body, published: d.published,
      }}
    />
  );
}
