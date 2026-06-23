import { Trash2 } from "lucide-react";
import { useProjectionStore } from "../stores/projection-store";

export function SchedulePanel({ onSelectItem }: { onSelectItem: (index: number) => void }) {
  const { serviceItems, activeItemIndex, setActiveItem, removeFromService } = useProjectionStore();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line bg-surface-2 px-3 py-1.5">
        <span className="text-[10px] font-semibold text-ink-muted">Schedule</span>
        <span className="text-[9px] text-ink-faint">{serviceItems.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto px-1.5 py-1">
        {serviceItems.map((item, i) => (
          <div
            key={item.id}
            onClick={() => {
              setActiveItem(i);
              onSelectItem(i);
            }}
            className={`group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors ${
              i === activeItemIndex
                ? "bg-primary/10 border border-primary/25"
                : "border border-transparent hover:bg-surface-4"
            }`}
          >
            <div className="size-8 shrink-0 rounded bg-surface-4 flex items-center justify-center overflow-hidden">
              <div className="size-full bg-gradient-to-br from-surface-5 to-surface-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[10px] font-medium text-ink">
                {i + 1}. {item.title}
              </div>
              {item.subtitle && (
                <div className="truncate text-[8px] text-ink-faint">{item.subtitle}</div>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeFromService(i);
              }}
              className="grid size-5 shrink-0 place-items-center rounded text-ink-faint opacity-0 transition-all hover:bg-danger/15 hover:text-danger group-hover:opacity-100"
            >
              <Trash2 className="size-2.5" />
            </button>
          </div>
        ))}
        {serviceItems.length === 0 && (
          <div className="flex items-center justify-center py-8 text-[10px] text-ink-faint/40">
            Drag items here to build your service
          </div>
        )}
      </div>
    </div>
  );
}
