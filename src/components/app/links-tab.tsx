"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Check, ExternalLink, HandHeart, Heart, Link2, MessageCircleHeart, QrCode as QrIcon, Settings2, Sparkles,
  UserPlus, Users, Baby, GraduationCap, CalendarDays, Wallet, X, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { QrCode } from "@/components/ui/qr-code";
import { cn } from "@/lib/utils";

export type LinkTile = {
  key: string;
  title: string;
  description: string;
  path: string;
  icon: "member" | "visitor" | "children" | "teens" | "prayer" | "testimony" | "counsel" | "give" | "book";
  /** When present the tile gets a "Customize form" button that opens this builder. */
  builder?: React.ReactNode;
};

const ICONS: Record<LinkTile["icon"], LucideIcon> = {
  member: UserPlus, visitor: Users, children: Baby, teens: GraduationCap,
  prayer: HandHeart, testimony: Sparkles, counsel: MessageCircleHeart, give: Wallet, book: CalendarDays,
};

const subscribeNone = () => () => {};
const useOrigin = () => useSyncExternalStore(subscribeNone, () => window.location.origin, () => "");

/**
 * Every public link in one tidy grid. Each tile can copy, open, show a QR code,
 * and (for forms) open its builder in a side panel so the page never becomes a
 * long scroll of builders.
 */
export function LinksTab({
  slugEditor, forms, share,
}: {
  slugEditor: React.ReactNode;
  forms: LinkTile[];
  share: LinkTile[];
}) {
  const origin = useOrigin();
  const [qrFor, setQrFor] = useState<LinkTile | null>(null);
  const [builderFor, setBuilderFor] = useState<LinkTile | null>(null);

  return (
    <div className="space-y-6">
      {slugEditor}

      <section>
        <SectionHead title="Sign-up forms" note="People fill these in themselves and appear in your lists automatically." />
        <div className="grid gap-3 md:grid-cols-2">
          {forms.map((t) => (
            <Tile key={t.key} tile={t} origin={origin} onQr={() => setQrFor(t)} onBuilder={t.builder ? () => setBuilderFor(t) : undefined} />
          ))}
        </div>
      </section>

      <section>
        <SectionHead title="Share with your church" note="Handy links for the pulpit, WhatsApp groups and printed notices." />
        <div className="grid gap-3 md:grid-cols-2">
          {share.map((t) => (
            <Tile key={t.key} tile={t} origin={origin} onQr={() => setQrFor(t)} />
          ))}
        </div>
      </section>

      {qrFor && (
        <Overlay onClose={() => setQrFor(null)} title={qrFor.title} narrow>
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <QrCode value={`${origin}${qrFor.path}`} size={220} />
            <p className="break-all font-mono text-xs text-ink-muted">{origin}{qrFor.path}</p>
            <p className="text-xs text-ink-faint">Print it or show it on the screen. Phones open the link when they scan it.</p>
          </div>
        </Overlay>
      )}

      {builderFor && (
        <Drawer onClose={() => setBuilderFor(null)} title={`${builderFor.title}: customize`}>
          {builderFor.builder}
        </Drawer>
      )}
    </div>
  );
}

function SectionHead({ title, note }: { title: string; note: string }) {
  return (
    <div className="mb-2.5 flex flex-wrap items-baseline gap-x-3">
      <h3 className="font-display text-[1rem] font-semibold">{title}</h3>
      <p className="text-xs text-ink-faint">{note}</p>
    </div>
  );
}

function Tile({ tile, origin, onQr, onBuilder }: { tile: LinkTile; origin: string; onQr: () => void; onBuilder?: () => void }) {
  const Icon = ICONS[tile.icon] ?? Heart;
  const [copied, setCopied] = useState(false);
  const url = `${origin}${tile.path}`;

  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold">{tile.title}</h4>
          <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{tile.description}</p>
        </div>
      </div>
      <div className="mt-3 truncate rounded-lg bg-surface-2/70 px-2.5 py-1.5 font-mono text-[11px] text-ink-muted" title={url}>{url || tile.path}</div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
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
          {copied ? <><Check /> Copied</> : <><Link2 /> Copy link</>}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onQr}><QrIcon /> QR</Button>
        <a href={tile.path} target="_blank" rel="noopener noreferrer">
          <Button type="button" variant="ghost" size="sm"><ExternalLink /> Open</Button>
        </a>
        {onBuilder && (
          <Button type="button" size="sm" className="ml-auto" onClick={onBuilder}><Settings2 /> Customize form</Button>
        )}
      </div>
    </Card>
  );
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
}

function Overlay({ onClose, title, children, narrow }: { onClose: () => void; title: string; children: React.ReactNode; narrow?: boolean }) {
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <Card className={cn("max-h-[90vh] w-full overflow-y-auto p-0", narrow ? "max-w-sm" : "max-w-xl")} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line p-4">
          <h3 className="font-display text-base font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-faint hover:bg-surface-2" aria-label="Close"><X className="size-4" /></button>
        </div>
        <div className="p-4">{children}</div>
      </Card>
    </div>
  );
}

function Drawer({ onClose, title, children }: { onClose: () => void; title: string; children: React.ReactNode }) {
  useEscape(onClose);
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-3xl flex-col border-l border-line bg-base shadow-2xl">
        <div className="flex items-center justify-between border-b border-line bg-surface px-5 py-4">
          <h3 className="font-display text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-faint hover:bg-surface-2" aria-label="Close"><X className="size-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain p-5">{children}</div>
      </div>
    </>
  );
}
