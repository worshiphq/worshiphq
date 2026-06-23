import { useProjectionStore } from "../stores/projection-store";

export function LiveTextPanel() {
  const { serviceItems, activeItemIndex, currentSlide, isLive, goLive } = useProjectionStore();
  const activeItem = activeItemIndex >= 0 ? serviceItems[activeItemIndex] : null;

  if (!activeItem || !activeItem.slides?.length) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-line bg-surface-2 px-3 py-1.5">
          <span className="text-[10px] font-semibold text-ink-muted">Live</span>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-[10px] text-ink-faint/40">No live content</p>
        </div>
      </div>
    );
  }

  const slides = activeItem.slides;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line bg-surface-2 px-3 py-1.5">
        <span className="text-[10px] font-semibold text-ink-muted">Live</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {slides.map((slide, i) => {
          const isCurrentlyLive =
            isLive && currentSlide?.content.primaryText === slide.content.primaryText;
          const secondary = slide.content.secondaryText ?? "";
          const dashIdx = secondary.lastIndexOf("—");
          const label = dashIdx >= 0 ? secondary.slice(dashIdx + 1).trim() : `Slide ${i + 1}`;

          return (
            <div
              key={i}
              onClick={() => goLive(slide)}
              className={`mb-2 cursor-pointer rounded-md p-2.5 transition-colors ${
                isCurrentlyLive ? "bg-danger/5" : "hover:bg-surface-4"
              }`}
            >
              <div
                className={`mb-1 text-[9px] font-bold ${
                  isCurrentlyLive ? "text-danger" : "text-ink-faint"
                }`}
              >
                {label}
              </div>
              <div
                className={`text-[10px] leading-[1.65] whitespace-pre-line ${
                  isCurrentlyLive ? "text-ink" : "text-ink-muted"
                }`}
              >
                {slide.content.primaryText}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
