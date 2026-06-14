import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { getPublicSession } from "@/lib/data/attendance";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Checked in" };

export default async function CheckInDonePage({
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
      <div className="w-full max-w-md rounded-2xl border border-[#e8e2d6] bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full" style={{ backgroundColor: `${accent}20` }}>
          <CheckCircle2 className="size-8" style={{ color: accent }} />
        </div>
        <h1 className="font-display text-2xl font-bold text-[#1c1a16]">You&apos;re checked in!</h1>
        <p className="mt-3 text-sm text-[#6b6560]">
          Thank you for being part of {s.church.name} today. Enjoy the service! 🙏
        </p>
      </div>
    </div>
  );
}
