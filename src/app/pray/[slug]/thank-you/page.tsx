import { Heart } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Thank you" };

export default async function PrayerThankYouPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await params;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#faf8f4] px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-[#6366f1]/10">
          <Heart className="size-8 text-[#6366f1]" />
        </div>
        <h1 className="font-display text-3xl font-bold text-[#1c1a16]">
          Thank you for sharing
        </h1>
        <p className="mt-3 text-sm text-[#6b6560]">
          Your prayer request has been received. Our community will be lifting you up in prayer.
        </p>
        <p className="mt-6 text-xs text-[#a09890]">
          Powered by <span className="font-semibold">WorshipHQ</span>
        </p>
      </div>
    </div>
  );
}
