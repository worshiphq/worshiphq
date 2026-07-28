import Link from "next/link";

export const metadata = { title: "Thank you" };

export default function TestifyThankYou() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#faf8f4] px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-5 grid size-16 place-items-center rounded-2xl bg-[#0d7377]/10 text-3xl">✨</div>
        <h1 className="font-display text-2xl font-bold text-[#1c1a16]">Thank you for sharing!</h1>
        <p className="mt-2 text-sm text-[#6b6560]">
          Your testimony has been received. Our team will review it before it&rsquo;s shared. God bless you!
        </p>
        <Link href="/" className="mt-6 inline-block text-sm font-semibold text-[#0d7377] hover:underline">← Back to WorshipHQ</Link>
      </div>
    </div>
  );
}
