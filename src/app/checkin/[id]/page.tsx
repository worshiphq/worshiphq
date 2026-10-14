import { notFound } from "next/navigation";
import { UserCheck } from "lucide-react";
import { getPublicSession } from "@/lib/data/attendance";
import { db } from "@/lib/db";
import { SelfCheckInFlow } from "./self-check-in-flow";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const s = await getPublicSession(id);
  return { title: s ? `Check in - ${s.church.name}` : "Check in" };
}

export default async function CheckInPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const s = await getPublicSession(id);
  if (!s) notFound();
  const accent = s.church.accentColor;
  const rulesRow = await db.attendanceSession.findUnique({ where: { id }, select: { church: { select: { qrVerify: true, qrGeoOn: true, qrGeoLat: true } } } });
  const rules = {
    verify: (rulesRow?.church.qrVerify === "digits" || rulesRow?.church.qrVerify === "sms" ? rulesRow.church.qrVerify : "none") as "none" | "digits" | "sms",
    geoOn: !!rulesRow?.church.qrGeoOn && rulesRow.church.qrGeoLat != null,
  };

  return (
    <div className="grid min-h-screen place-items-center bg-[#faf8f4] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          {s.church.logoUrl ? (
            <img src={s.church.logoUrl} alt={s.church.name} className="mx-auto mb-3 size-16 rounded-2xl object-cover" />
          ) : (
            <div className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl" style={{ backgroundColor: `${accent}18` }}>
              <UserCheck className="size-7" style={{ color: accent }} />
            </div>
          )}
          <h1 className="font-display text-2xl font-bold text-[#1c1a16]">Welcome to {s.church.name}</h1>
          <p className="mt-1 text-sm text-[#6b6560]">
            {s.serviceName} ·{" "}
            {new Date(s.date).toLocaleDateString("en-GH", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>

        <SelfCheckInFlow sessionId={s.id} accent={accent} verify={rules.verify} geoOn={rules.geoOn} />
      </div>
    </div>
  );
}
