import { useEffect } from "react";
import { X, ZoomIn, ZoomOut } from "lucide-react";
import { useState } from "react";

export function Lightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt?: string;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "+" || e.key === "=") setScale((s) => Math.min(s + 0.25, 3));
      if (e.key === "-") setScale((s) => Math.max(s - 0.25, 0.5));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); setScale((s) => Math.max(s - 0.25, 0.5)); }}
          className="grid size-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
        >
          <ZoomOut className="size-5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setScale((s) => Math.min(s + 0.25, 3)); }}
          className="grid size-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
        >
          <ZoomIn className="size-5" />
        </button>
        <button
          onClick={onClose}
          className="grid size-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
        >
          <X className="size-5" />
        </button>
      </div>
      <img
        src={src}
        alt={alt || ""}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain shadow-2xl transition-transform duration-200"
        style={{ transform: `scale(${scale})` }}
      />
    </div>
  );
}
