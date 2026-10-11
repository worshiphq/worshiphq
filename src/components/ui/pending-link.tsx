"use client";

import Link, { useLinkStatus } from "next/link";
import { Loader2 } from "lucide-react";
import type { VariantProps } from "class-variance-authority";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Inner({ icon, children, pendingLabel }: { icon?: React.ReactNode; children: React.ReactNode; pendingLabel: string }) {
  const { pending } = useLinkStatus();
  return pending ? (
    <>
      <Loader2 className="animate-spin" /> {pendingLabel}
    </>
  ) : (
    <>
      {icon}
      {children}
    </>
  );
}

/** A button-styled link that shows a spinner and message while the page loads. */
export function PendingLink({
  href,
  icon,
  children,
  pendingLabel = "Opening…",
  variant = "secondary",
  size,
  className,
}: {
  href: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
} & VariantProps<typeof buttonVariants>) {
  return (
    <Link href={href} prefetch={false} className={cn(buttonVariants({ variant, size }), className)}>
      <Inner icon={icon} pendingLabel={pendingLabel}>
        {children}
      </Inner>
    </Link>
  );
}
