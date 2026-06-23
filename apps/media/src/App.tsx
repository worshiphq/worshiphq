import { useState, useCallback } from "react";
import { TitleBar } from "./components/TitleBar";
import { IconNav, type NavSection } from "./components/IconNav";
import { AssetsPanel } from "./components/AssetsPanel";
import { Dashboard } from "./components/Dashboard";
import { RightPanel } from "./components/RightPanel";
import { AudioBar } from "./components/AudioBar";
import { LicenseGate } from "./components/LicenseGate";
import { useProjectionStore } from "./stores/projection-store";
import type { ServiceItem, Slide } from "./types";

export default function App() {
  const [navSection, setNavSection] = useState<NavSection>("songs");
  const { addToService, goLive } = useProjectionStore();

  const handleAddToService = useCallback((item: ServiceItem) => {
    addToService(item);
  }, [addToService]);

  const handleGoLive = useCallback((slide: Slide) => {
    goLive(slide);
  }, [goLive]);

  return (
    <LicenseGate>
      <div className="flex h-full flex-col bg-surface">
        {/* Title bar */}
        <TitleBar />

        {/* Main content area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Icon nav */}
          <IconNav active={navSection} onChange={setNavSection} />

          {/* Left: Assets panel */}
          <div className="flex w-60 shrink-0 flex-col border-r border-line bg-surface-2">
            <AssetsPanel
              section={navSection}
              onAddToService={handleAddToService}
              onGoLive={handleGoLive}
            />
          </div>

          {/* Center: Dashboard with dual preview monitors */}
          <div className="flex flex-1 flex-col overflow-hidden bg-surface">
            <Dashboard />
          </div>

          {/* Right: Properties + Analytics */}
          <RightPanel />
        </div>

        {/* Bottom: AI Audio bar */}
        <AudioBar />
      </div>
    </LicenseGate>
  );
}
