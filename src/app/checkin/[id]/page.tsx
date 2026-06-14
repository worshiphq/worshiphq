import { notFound } from "next/navigation";
import { UserCheck } from "lucide-react";
import { getPublicSession } from "@/lib/data/attendance";
import { selfCheckIn } from "@/app/actions/attendance";
import { SubmitButton } from "@/components/ui/submit-button";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const s = await getPublicSession(id);
  return { title: s ? `Check in — ${s.church.name}` : "Check in" };
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

        <form action={selfCheckIn} className="space-y-4 rounded-2xl border border-[#e8e2d6] bg-white p-6 shadow-sm">
          <input type="hidden" name="sessionId" value={s.id} />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#6b6560]">Your name</label>
            <input
              name="name"
              required
              placeholder="Kwame Mensah"
              className="h-11 w-full rounded-xl border border-[#e8e2d6] bg-white px-3.5 text-sm text-[#1c1a16] placeholder:text-[#a09888] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d7377]/20"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#6b6560]">Phone (optional)</label>
            <input
              name="phone"
              placeholder="+233 24 000 0000"
              className="h-11 w-full rounded-xl border border-[#e8e2d6] bg-white px-3.5 text-sm text-[#1c1a16] placeholder:text-[#a09888] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d7377]/20"
            />
          </div>
          <SubmitButton
            pendingLabel="Checking in…"
            className="w-full rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: accent }}
          >
            I&apos;m here — check me in
          </SubmitButton>
          <p className="text-center text-xs text-[#a09888]">Helps {s.church.name} know you were present today.</p>
        </form>
      </div>
    </div>
  );
}
