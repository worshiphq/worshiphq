import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audienceOptions } from "@/lib/sms/audience";
import { DevotionalEditor } from "@/components/app/devotional-editor";

export const metadata = { title: "New devotional" };

export default async function NewDevotionalPage() {
  const session = await requireModule("devotionals");
  if (!canEdit(session, "devotionals")) redirect("/app/devotionals");
  const [audiences, prior] = await Promise.all([
    audienceOptions(session.churchId),
    db.devotional.findMany({ where: { churchId: session.churchId }, select: { author: true }, take: 200, orderBy: { date: "desc" } }),
  ]);
  return (
    <DevotionalEditor
      canWrite
      audiences={audiences}
      authorSuggestions={[...new Set(prior.map((p) => p.author).filter((x): x is string => !!x))]}
      initial={{ title: "", scripture: "", author: "", date: new Date().toISOString().slice(0, 10), body: "", published: true }}
    />
  );
}
