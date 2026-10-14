import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { db } from "@/lib/db";
import { SermonEditor } from "@/components/app/sermon-editor";

export const metadata = { title: "Sermon" };

export default async function SermonPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireModule("sermons");
  const { id } = await params;
  const [s, prior] = await Promise.all([
    db.sermon.findFirst({ where: { id, churchId: session.churchId } }),
    db.sermon.findMany({ where: { churchId: session.churchId }, select: { series: true, preacher: true }, take: 300, orderBy: { date: "desc" } }),
  ]);
  if (!s) notFound();
  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))];
  return (
    <SermonEditor
      canWrite={canEdit(session, "sermons")}
      seriesSuggestions={uniq(prior.map((p) => p.series))}
      preacherSuggestions={uniq(prior.map((p) => p.preacher))}
      initial={{
        id: s.id, title: s.title, preacher: s.preacher ?? "", series: s.series ?? "", scripture: s.scripture ?? "",
        date: s.date.toISOString().slice(0, 10), audioUrl: s.audioUrl ?? "", videoUrl: s.videoUrl ?? "", notes: s.notes ?? "", published: s.published,
      }}
    />
  );
}
