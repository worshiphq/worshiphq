import { useState, useEffect } from "react";
import { AppHeader, AppSidebar, type Workspace } from "./components/AppShell";
import { LiveView } from "./components/LiveView";
import { ScriptureView } from "./components/ScriptureView";
import { LicenseGate } from "./components/LicenseGate";
import { Launcher } from "./components/Launcher";

export default function App() {
  const [launched, setLaunched] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace>("live");

  // Ctrl+B opens the Bible, Ctrl+L goes back to Live, from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.shiftKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "b") { e.preventDefault(); setWorkspace("bible"); }
      else if (k === "l") { e.preventDefault(); setWorkspace("live"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!launched) {
    return <Launcher onEnter={() => setLaunched(true)} />;
  }

  return (
    <LicenseGate>
      <div className="flex h-full flex-col bg-surface">
        <AppHeader />
        <div className="flex min-h-0 flex-1">
          <AppSidebar workspace={workspace} onChange={setWorkspace} />
          <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
            {workspace === "bible" ? <ScriptureView /> : <LiveView onOpenBible={() => setWorkspace("bible")} />}
          </main>
        </div>
      </div>
    </LicenseGate>
  );
}
