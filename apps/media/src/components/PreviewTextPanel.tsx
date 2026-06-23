import { useProjectionStore } from "../stores/projection-store";
import type { Slide } from "../types";

export function PreviewTextPanel({
  onPreviewSlide,
  previewSlideIndex,
}: {
  onPreviewSlide: (slide: Slide, index: number) => void;
  previewSlideIndex: number;
}) {
  const { serviceItems, activeItemIndex, goLive } = useProjectionStore();
  const activeItem = activeItemIndex >= 0 ? serviceItems[activeItemIndex] : null;

  if (!activeItem || !activeItem.slides?.length) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-line bg-surface-2 px-3 py-1.5">
          <span className="text-[10px] font-semibold text-ink-muted">Preview</span>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-[10px] text-ink-faint/40">Select a schedule item to preview</p>
        </div>
      </div>
    );
  }

  const sections = groupSlidesBySections(activeItem.slides);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line bg-surface-2 px-3 py-1.5">
        <span className="text-[10px] font-semibold text-ink-muted">Preview</span>
        <div className="flex items-center gap-2">
          <button className="grid size-5 place-items-center rounded bg-success text-white text-[10px] font-bold hover:bg-success/80">
            +
          </button>
          <button className="grid size-5 place-items-center rounded bg-danger/15 text-[9px] text-danger hover:bg-danger/25">
            ♥
          </button>
          <button className="grid size-5 place-items-center rounded bg-surface-4 text-[9px] text-ink-faint hover:bg-surface-5">
            ⚙
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {sections.map((section, si) => (
          <div
            key={si}
            onClick={() => onPreviewSlide(section.slide, section.globalIndex)}
            onDoubleClick={() => goLive(section.slide)}
            className={`mb-2 cursor-pointer rounded-md p-2.5 transition-colors ${
              previewSlideIndex === section.globalIndex
                ? "bg-primary/8 border-l-[3px] border-primary-bright"
                : "border-l-[3px] border-transparent hover:bg-surface-4"
            }`}
          >
            <div
              className={`mb-1 text-[9px] font-bold ${
                previewSlideIndex === section.globalIndex ? "text-primary-bright" : "text-ink-faint"
              }`}
            >
              {section.label}
            </div>
            <div
              className={`text-[11px] leading-[1.65] whitespace-pre-line ${
                previewSlideIndex === section.globalIndex ? "text-ink" : "text-ink-muted"
              }`}
            >
              {section.slide.content.primaryText}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface SectionGroup {
  label: string;
  slide: Slide;
  globalIndex: number;
}

function groupSlidesBySections(slides: Slide[]): SectionGroup[] {
  return slides.map((slide, i) => {
    const secondary = slide.content.secondaryText ?? "";
    const dashIdx = secondary.lastIndexOf("—");
    const label = dashIdx >= 0 ? secondary.slice(dashIdx + 1).trim() : `Slide ${i + 1}`;
    return { label, slide, globalIndex: i };
  });
}
