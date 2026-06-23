import { useState, useCallback } from "react";
import { TitleBar } from "./components/TitleBar";
import { Toolbar } from "./components/Toolbar";
import { SchedulePanel } from "./components/SchedulePanel";
import { ResourcesPanel } from "./components/ResourcesPanel";
import { PreviewTextPanel } from "./components/PreviewTextPanel";
import { LiveTextPanel } from "./components/LiveTextPanel";
import { MonitorOutputs } from "./components/MonitorOutputs";
import { AudioBar } from "./components/AudioBar";
import { ResizablePanel } from "./components/ResizablePanel";
import { LicenseGate } from "./components/LicenseGate";
import { useProjectionStore } from "./stores/projection-store";
import type { ServiceItem, Slide } from "./types";

export default function App() {
  const { addToService, goLive } = useProjectionStore();
  const [previewSlide, setPreviewSlide] = useState<Slide | null>(null);
  const [previewSlideIndex, setPreviewSlideIndex] = useState(0);

  const handleAddToService = useCallback(
    (item: ServiceItem) => addToService(item),
    [addToService],
  );

  const handleGoLive = useCallback(
    (slide: Slide) => goLive(slide),
    [goLive],
  );

  const handleSelectScheduleItem = useCallback(
    (index: number) => {
      const items = useProjectionStore.getState().serviceItems;
      const item = items[index];
      if (item?.slides?.[0]) {
        setPreviewSlide(item.slides[0]);
        setPreviewSlideIndex(0);
      }
    },
    [],
  );

  const handlePreviewSlide = useCallback((slide: Slide, index: number) => {
    setPreviewSlide(slide);
    setPreviewSlideIndex(index);
  }, []);

  return (
    <LicenseGate>
      <div className="flex h-full flex-col bg-surface">
        <TitleBar />
        <Toolbar />

        {/* ═══ EW2009 grid: left sidebar | preview + live text (top) | monitors (bottom) ═══ */}
        <div
          className="flex-1 overflow-hidden"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(180px, 320px) 1fr minmax(160px, 320px)",
            gridTemplateRows: "1fr minmax(120px, 28%)",
            minHeight: 0,
          }}
        >
          {/* ─── LEFT COLUMN: Schedule + Resources (spans both rows) ─── */}
          <div className="border-r border-line bg-surface-2 flex flex-col min-h-0" style={{ gridRow: "1 / -1" }}>
            <ResizablePanel direction="vertical" initialSize={200} minSize={80} maxSize={500}>
              <div className="h-full border-b border-line">
                <SchedulePanel onSelectItem={handleSelectScheduleItem} />
              </div>
            </ResizablePanel>
            <div className="flex flex-1 flex-col min-h-0">
              <ResourcesPanel
                onAddToService={handleAddToService}
                onGoLive={handleGoLive}
              />
            </div>
          </div>

          {/* ─── PREVIEW TEXT (center, row 1) ─── */}
          <div className="border-r border-line flex flex-col min-h-0 min-w-0">
            <PreviewTextPanel
              onPreviewSlide={handlePreviewSlide}
              previewSlideIndex={previewSlideIndex}
            />
          </div>

          {/* ─── LIVE TEXT (right, row 1) ─── */}
          <div className="flex flex-col min-h-0 min-w-0">
            <LiveTextPanel />
          </div>

          {/* ─── MONITOR OUTPUTS (bottom, spans preview + live columns) ─── */}
          <div className="border-t border-line bg-surface-2/50 min-h-0" style={{ gridColumn: "2 / -1" }}>
            <MonitorOutputs previewSlide={previewSlide} />
          </div>
        </div>

        <AudioBar />
      </div>
    </LicenseGate>
  );
}
