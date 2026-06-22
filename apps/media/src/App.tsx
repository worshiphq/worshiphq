import { useState } from "react";
import { TitleBar } from "./components/TitleBar";
import { LibraryPanel } from "./components/LibraryPanel";
import { PreviewPanel } from "./components/PreviewPanel";
import { ServicePanel } from "./components/ServicePanel";
import { ControlBar } from "./components/ControlBar";
import type { ServiceItem, Slide } from "./types";

export default function App() {
  const [activeTab, setActiveTab] = useState<"bible" | "songs" | "media">("bible");
  const [serviceItems, setServiceItems] = useState<ServiceItem[]>([]);
  const [currentSlide, setCurrentSlide] = useState<Slide | null>(null);
  const [nextSlide, setNextSlide] = useState<Slide | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [isBlack, setIsBlack] = useState(false);

  function addToService(item: ServiceItem) {
    setServiceItems((prev) => [...prev, { ...item, order: prev.length }]);
  }

  function removeFromService(index: number) {
    setServiceItems((prev) => prev.filter((_, i) => i !== index));
  }

  function reorderService(from: number, to: number) {
    setServiceItems((prev) => {
      const items = [...prev];
      const [moved] = items.splice(from, 1);
      items.splice(to, 0, moved);
      return items.map((item, i) => ({ ...item, order: i }));
    });
  }

  function goLive(slide: Slide) {
    setCurrentSlide(slide);
    setIsLive(true);
    setIsBlack(false);
  }

  function goBlack() {
    setIsBlack(true);
  }

  function goLogo() {
    setCurrentSlide({
      type: "logo",
      content: { primaryText: "" },
      template: { background: "#000", textLayout: "center" },
    });
    setIsLive(true);
    setIsBlack(false);
  }

  function goClear() {
    setCurrentSlide(null);
    setIsLive(false);
    setIsBlack(false);
  }

  return (
    <div className="flex h-full flex-col">
      <TitleBar />

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Library */}
        <div className="flex w-80 flex-col border-r border-line">
          <LibraryPanel
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onAddToService={addToService}
            onGoLive={goLive}
          />
        </div>

        {/* Center: Preview */}
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

        {/* Right: Service Plan */}
        <div className="flex w-72 flex-col border-l border-line">
          <ServicePanel
            items={serviceItems}
            currentSlide={currentSlide}
            onRemove={removeFromService}
            onReorder={reorderService}
            onSelect={(item) => {
              const slide: Slide = {
                type: item.type,
                content: { primaryText: item.title },
                template: { background: "#000", textLayout: "center" },
              };
              setNextSlide(slide);
            }}
            onGoLive={goLive}
          />
        </div>
      </div>
    </div>
  );
}
