import { useCallback } from "react";
import { TitleBar } from "./components/TitleBar";
import { LibraryPanel } from "./components/LibraryPanel";
import { PreviewPanel } from "./components/PreviewPanel";
import { ServicePanel } from "./components/ServicePanel";
import { ControlBar } from "./components/ControlBar";
import { LicenseGate } from "./components/LicenseGate";
import { useProjectionStore } from "./stores/projection-store";
import type { ServiceItem, Slide } from "./types";
import { useState } from "react";

export default function App() {
  const [activeTab, setActiveTab] = useState<"bible" | "songs" | "media">("bible");
  const {
    serviceItems, currentSlide, nextSlide, isLive, isBlack,
    goLive, goBlack, goLogo, goClear,
    addToService, removeFromService, reorderService, setNextSlide,
  } = useProjectionStore();

  const handleAddToService = useCallback((item: ServiceItem) => {
    addToService(item);
  }, [addToService]);

  const handleGoLive = useCallback((slide: Slide) => {
    goLive(slide);
  }, [goLive]);

  return (
    <LicenseGate>
      <div className="flex h-full flex-col">
        <TitleBar />

        <div className="flex flex-1 overflow-hidden">
          <div className="flex w-80 flex-col border-r border-line">
            <LibraryPanel
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onAddToService={handleAddToService}
              onGoLive={handleGoLive}
            />
          </div>

          <div className="flex flex-1 flex-col">
            <PreviewPanel
              currentSlide={currentSlide}
              nextSlide={nextSlide}
              isLive={isLive}
              isBlack={isBlack}
            />
            <ControlBar
              isLive={isLive}
              isBlack={isBlack}
              onGoLive={() => currentSlide && goLive(currentSlide)}
              onGoBlack={goBlack}
              onGoLogo={goLogo}
              onGoClear={goClear}
            />
          </div>

          <div className="flex w-72 flex-col border-l border-line">
            <ServicePanel
              items={serviceItems}
              currentSlide={currentSlide}
              onRemove={removeFromService}
              onReorder={reorderService}
              onSelect={(item) => {
                if (item.slides && item.slides.length > 0) {
                  setNextSlide(item.slides[0]);
                } else {
                  const slide: Slide = {
                    type: item.type === "media" ? "media" : item.type === "song" ? "song" : "scripture",
                    content: { primaryText: item.title, secondaryText: item.subtitle },
                    template: { background: "#000", textLayout: "center" },
                  };
                  setNextSlide(slide);
                }
              }}
              onGoLive={handleGoLive}
            />
          </div>
        </div>
      </div>
    </LicenseGate>
  );
}
