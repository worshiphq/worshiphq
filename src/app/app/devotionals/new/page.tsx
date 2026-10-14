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
  const [audiences, prior, people] = await Promise.all([
    audienceOptions(session.churchId),
    db.devotional.findMany({ where: { churchId: session.churchId }, select: { author: true }, take: 200, orderBy: { date: "desc" } }),
    db.person.findMany({ where: { churchId: session.churchId, phone: { not: null }, status: { not: "inactive" } }, select: { id: true, firstName: true, lastName: true, phone: true }, orderBy: [{ firstName: "asc" }, { lastName: "asc" }], take: 3000 }),
  ]);
  return (
    <DevotionalEditor
      canWrite
      audiences={audiences}
      members={people.map((m) => ({ value: m.id, label: `${m.firstName} ${m.lastName}`.trim(), hint: m.phone ?? undefined }))}
      authorSuggestions={[...new Set(prior.map((p) => p.author).filter((x): x is string => !!x))]}
      initial={{ title: "", scripture: "", author: "", date: new Date().toISOString().slice(0, 10), body: "", published: true }}
    />
  );
}
