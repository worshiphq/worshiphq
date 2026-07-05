import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function Lightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-md"
        onClick={onClose}
      />
      <div
        className="fixed inset-0 z-[90] flex items-center justify-center p-6"
        onClick={onClose}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
        >
          <X className="size-5" />
        </button>
        <img
          src={src}
          alt={alt || ""}
          onClick={(e) => e.stopPropagation()}
          className="max-h-[80vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl ring-1 ring-white/10"
        />
      </div>
    </>,
    document.body,
  );
}
