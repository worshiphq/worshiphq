import Link from "next/link";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { InviteAcceptClient } from "@/components/invite-accept-client";

export const metadata = { title: "Accept your invite · WorshipHQ" };

function maskPhone(phone: string | null): string {
  if (!phone) return "your number";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "your number";
  return `•••• ${digits.slice(-3)}`;
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const user = await db.user.findUnique({
    where: { inviteToken: token },
    select: {
      name: true,
      phone: true,
      role: true,
      inviteAcceptedAt: true,
      customRole: { select: { name: true } },
      church: { select: { name: true, logoUrl: true } },
    },
  });

  if (!user || user.inviteAcceptedAt) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
        <Card className="p-8 text-center">
          <h1 className="font-display text-xl font-bold">This invite isn&rsquo;t valid</h1>
          <p className="mt-2 text-sm text-ink-muted">
            It may have already been accepted or expired. Ask your church admin to send a new one.
          </p>
          <Link href="/sign-in" className="mt-4 inline-block text-sm font-semibold text-primary hover:underline">
            Go to sign in →
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <InviteAcceptClient
      token={token}
      name={user.name}
      churchName={user.church.name}
      churchLogo={user.church.logoUrl}
      role={user.customRole?.name ?? user.role}
      phoneMasked={maskPhone(user.phone)}
    />
  );
}
