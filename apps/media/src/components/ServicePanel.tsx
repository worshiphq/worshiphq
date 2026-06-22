import { Book, Music, Image, Play, Trash2, GripVertical, Plus } from "lucide-react";
import type { ServiceItem, Slide } from "../types";

const TYPE_CONFIG = {
  scripture: { icon: Book, color: "text-primary-bright", bg: "bg-primary/10" },
  song: { icon: Music, color: "text-gold", bg: "bg-gold/10" },
  media: { icon: Image, color: "text-success", bg: "bg-success/10" },
  announcement: { icon: Image, color: "text-ink-muted", bg: "bg-surface-4" },
  custom: { icon: Image, color: "text-ink-muted", bg: "bg-surface-4" },
} as const;

export function ServicePanel({
  items,
  currentSlide,
  onRemove,
  onReorder,
  onSelect,
  onGoLive,
}: {
  items: ServiceItem[];
  currentSlide: Slide | null;
  onRemove: (index: number) => void;
  onReorder: (from: number, to: number) => void;
  onSelect: (item: ServiceItem) => void;
  onGoLive: (slide: Slide) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
          Service Plan
        </h3>
        <span className="rounded-full bg-surface-3 px-1.5 py-0.5 text-[10px] text-ink-faint">
          {items.length} items
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <div className="grid size-10 place-items-center rounded-xl bg-surface-3">
              <Plus className="size-4 text-ink-faint" />
            </div>
            <p className="mt-2 text-xs font-medium text-ink-muted">No items yet</p>
            <p className="mt-0.5 text-[10px] text-ink-faint">
              Add scriptures, songs, and media from the library
            </p>
          </div>
        ) : (
          <div className="space-y-0.5 p-1.5">
            {items.map((item, index) => {
              const config = TYPE_CONFIG[item.type];
              const Icon = config.icon;
              return (
                <div
                  key={item.id}
                  className="group flex items-center gap-1.5 rounded-lg p-1.5 transition-colors hover:bg-surface-3"
                >
                  <div className="cursor-grab text-ink-faint/50 hover:text-ink-faint">
                    <GripVertical className="size-3" />
                  </div>
                  <div className={`grid size-7 shrink-0 place-items-center rounded-md ${config.bg}`}>
                    <Icon className={`size-3.5 ${config.color}`} />
                  </div>
                  <button
                    onClick={() => onSelect(item)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="truncate text-xs font-medium text-ink">{item.title}</div>
                    {item.subtitle && (
                      <div className="truncate text-[10px] text-ink-faint">{item.subtitle}</div>
                    )}
                  </button>
                  <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => {
                        const slide: Slide = {
                          type: item.type === "media" ? "media" : item.type === "song" ? "song" : "scripture",
                          content: { primaryText: item.title, secondaryText: item.subtitle },
                          template: { background: "#000", textLayout: "center" },
                        };
                        onGoLive(slide);
                      }}
                      className="grid size-5 place-items-center rounded bg-primary/10 text-primary-bright hover:bg-primary/20"
                      title="Go live"
                    >
                      <Play className="size-2.5" />
                    </button>
                    <button
                      onClick={() => onRemove(index)}
                      className="grid size-5 place-items-center rounded text-ink-faint hover:bg-danger/10 hover:text-danger"
                      title="Remove"
                    >
                      <Trash2 className="size-2.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-line p-2">
        <button className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line py-2 text-[11px] text-ink-faint transition-colors hover:border-primary/40 hover:text-primary-bright">
          <Plus className="size-3" />
          Add item
        </button>
      </div>
    </div>
  );
}
