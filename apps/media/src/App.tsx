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
        {/* Menu bar */}
        <TitleBar />

        {/* Toolbar: New, Open, Save, Background, Go Live etc. */}
        <Toolbar />

        {/* ═══ Main content: EW2009 layout ═══ */}
        <div className="flex flex-1 overflow-hidden">

          {/* ─── LEFT COLUMN: Schedule (top) + Resources (bottom) ─── */}
          <ResizablePanel direction="horizontal" initialSize={220} minSize={160} maxSize={360}>
            <div className="flex h-full flex-col border-r border-line bg-surface-2">
              {/* Schedule — top half, resizable */}
              <ResizablePanel direction="vertical" initialSize={200} minSize={100} maxSize={500}>
                <div className="h-full border-b border-line">
                  <SchedulePanel onSelectItem={handleSelectScheduleItem} />
                </div>
              </ResizablePanel>

              {/* Resources — bottom half (fills remaining) */}
              <div className="flex flex-1 flex-col min-h-0">
                <ResourcesPanel
                  onAddToService={handleAddToService}
                  onGoLive={handleGoLive}
                />
              </div>
            </div>
          </ResizablePanel>

          {/* ─── RIGHT AREA: Text panels (top) + Monitors (bottom) ─── */}
          <div className="flex flex-1 flex-col min-w-0">

            {/* Top: Preview text + Live text panels */}
            <div className="flex flex-1 min-h-0">
              {/* Preview text panel (center) */}
              <div className="flex flex-1 flex-col border-r border-line min-w-0">
                <PreviewTextPanel
                  onPreviewSlide={handlePreviewSlide}
                  previewSlideIndex={previewSlideIndex}
                />
              </div>

              {/* Live text panel (right) — resizable width */}
              <ResizablePanel
                direction="horizontal"
                initialSize={220}
                minSize={160}
                maxSize={400}
                resizerPosition="start"
              >
                <LiveTextPanel />
              </ResizablePanel>
            </div>

            {/* Bottom: Preview Output + Live Output monitors — equal size, resizable height */}
            <ResizablePanel
              direction="vertical"
              initialSize={180}
              minSize={120}
              maxSize={350}
              resizerPosition="start"
            >
              <div className="h-full border-t border-line bg-surface-2/50">
                <MonitorOutputs previewSlide={previewSlide} />
              </div>
            </ResizablePanel>
          </div>
        </div>

        {/* Audio Transcription bar */}
        <AudioBar />
      </div>
    </LicenseGate>
  );
}
