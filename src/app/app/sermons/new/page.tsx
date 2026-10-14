import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { SermonEditor } from "@/components/app/sermon-editor";

export const metadata = { title: "New sermon" };

export default async function NewSermonPage() {
  const session = await requireModule("sermons");
  if (!canEdit(session, "sermons")) redirect("/app/sermons");
  const prior = await db.sermon.findMany({ where: { churchId: session.churchId }, select: { series: true, preacher: true }, take: 300, orderBy: { date: "desc" } });
  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))];
  return (
    <SermonEditor
      canWrite
      seriesSuggestions={uniq(prior.map((p) => p.series))}
      preacherSuggestions={uniq(prior.map((p) => p.preacher))}
      initial={{ title: "", preacher: "", series: "", scripture: "", date: new Date().toISOString().slice(0, 10), audioUrl: "", videoUrl: "", notes: "", published: true }}
    />
  );
}
