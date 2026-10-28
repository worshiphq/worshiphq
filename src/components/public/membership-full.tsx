import { UsersRound } from "lucide-react";

/**
 * Shown on a church's public join, children's and teens' forms when the church has reached its plan's member limit,
 * instead of the form, so nobody fills it in for nothing.
 */
export function MembershipFull({ churchName, accentColor }: { churchName: string; accentColor?: string | null }) {
  return (
    <div className="rounded-2xl border border-[#e8e2d6] bg-white p-8 text-center shadow-sm">
      <div
        className="mx-auto mb-4 grid size-14 place-items-center rounded-full"
        style={{ background: `${accentColor || "#0f766e"}1a`, color: accentColor || "#0f766e" }}
      >
        <UsersRound className="size-7" />
      </div>
      <h2 className="font-display text-xl font-bold text-[#1c1a16]">Registration is full for now</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[#6b6560]">
        {churchName} can&apos;t take new registrations online at the moment. Please speak to the church office or a church
        admin, and they&apos;ll make sure you&apos;re added.
      </p>
    </div>
  );
}
