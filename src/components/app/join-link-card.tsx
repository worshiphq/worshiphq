"use client";

import { useState } from "react";
import { Link2, Check, UserPlus, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Shareable public self-registration link for members to fill in themselves. */
export function JoinLinkCard({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== "undefined" ? `${window.location.origin}/join/${slug}` : `/join/${slug}`;

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
          <UserPlus className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-ink">Member registration link</h3>
          <p className="mt-0.5 text-xs text-ink-faint">
            Share this so members register themselves — they appear here automatically.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Input value={url} readOnly className="min-w-0 flex-1 font-mono text-xs" />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              }}
            >
              {copied ? <Check className="size-4" /> : <Link2 className="size-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <a href={url} target="_blank" rel="noreferrer">
              <Button type="button" variant="ghost" size="sm">
                <ExternalLink className="size-4" /> Preview
              </Button>
            </a>
          </div>
        </div>
      </div>
    </Card>
  );
}
