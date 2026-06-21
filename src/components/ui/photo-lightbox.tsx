"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MemberAvatar } from "@/components/ui/member-avatar";

export function ClickableAvatar({
  name,
  photoUrl,
  gender,
  size = "md",
  className,
}: {
  name: string;
  photoUrl?: string | null;
  gender?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (photoUrl) setOpen(true);
        }}
        className={cn(photoUrl && "cursor-pointer", "shrink-0")}
      >
        <MemberAvatar name={name} photoUrl={photoUrl} gender={gender} size={size} className={className} />
      </button>
      {open && photoUrl && createPortal(
        <PhotoLightbox src={photoUrl} alt={name} onClose={(e) => { e?.stopPropagation(); setOpen(false); }} />,
        document.body,
      )}
    </>
  );
}

export function PhotoLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: (e?: React.MouseEvent) => void }) {
  return (
    <>
      <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-md" onClick={(e) => { e.stopPropagation(); onClose(e); }} />
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-6" onClick={(e) => { e.stopPropagation(); onClose(e); }}>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(e); }}
          className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
        >
          <X className="size-5" />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          onClick={(e) => e.stopPropagation()}
          className="max-h-[80vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl ring-1 ring-white/10"
        />
      </div>
    </>
  );
}
