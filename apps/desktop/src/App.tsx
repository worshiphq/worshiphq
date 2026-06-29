import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { auth, sync } from "./lib/api";
import { useAppStore } from "./stores/app-store";
import { LoginPage } from "./components/LoginPage";
import { Sidebar } from "./components/Sidebar";
import { TitleBar } from "./components/TitleBar";
import { Toast } from "./components/Toast";
import { DashboardPage } from "./pages/DashboardPage";
import { PeoplePage } from "./pages/PeoplePage";
import { GivingPage } from "./pages/GivingPage";
import { AttendancePage } from "./pages/AttendancePage";
import { PlaceholderPage } from "./pages/PlaceholderPage";

export default function App() {
  const { session, setSession, setSyncStatus } = useAppStore();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function init() {
      const stored = await auth.getSession();
      if (stored) {
        setSession(stored);
        const status = await sync.status();
        setSyncStatus(status);
      }
      setChecking(false);
    }
    init();

    // Listen for sync progress
    const unsub = sync.onProgress((p) => {
      if (p.phase === "done") {
        sync.status().then(setSyncStatus);
      }
    });

    return unsub;
  }, []);

  if (checking) {
    return (
      <div className="flex h-screen flex-col bg-base">
        <TitleBar />
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-8 text-primary-bright whq-spin" />
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex h-screen flex-col">
        <TitleBar />
        <LoginPage />
        <Toast />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <TitleBar />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <div className="flex flex-1 flex-col min-w-0">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/people" element={<PeoplePage />} />
          <Route path="/leaders" element={<PlaceholderPage title="Leaders" />} />
          <Route path="/attendance" element={<AttendancePage />} />
          <Route path="/giving" element={<GivingPage />} />
          <Route path="/dayborn" element={<PlaceholderPage title="Day Born" />} />
          <Route path="/events" element={<PlaceholderPage title="Events" />} />
          <Route path="/calendar" element={<PlaceholderPage title="Calendar" />} />
          <Route path="/volunteers" element={<PlaceholderPage title="Volunteers" />} />
          <Route path="/groups" element={<PlaceholderPage title="Groups" />} />
          <Route path="/visitors" element={<PlaceholderPage title="Visitors" />} />
          <Route path="/birthdays" element={<PlaceholderPage title="Birthdays" />} />
          <Route path="/directory" element={<PlaceholderPage title="Directory" />} />
          <Route path="/bookings" element={<PlaceholderPage title="Bookings" />} />
          <Route path="/rosters" element={<PlaceholderPage title="Rosters" />} />
          <Route path="/reports" element={<PlaceholderPage title="Reports" />} />
          <Route path="/accounting" element={<PlaceholderPage title="Accounting" />} />
          <Route path="/pledges" element={<PlaceholderPage title="Pledges" />} />
          <Route path="/harvest" element={<PlaceholderPage title="Harvest" />} />
          <Route path="/expenses" element={<PlaceholderPage title="Expenses" />} />
          <Route path="/budgets" element={<PlaceholderPage title="Budgets" />} />
          <Route path="/welfare" element={<PlaceholderPage title="Welfare" />} />
          <Route path="/communications" element={<PlaceholderPage title="Communications" />} />
          <Route path="/reminders" element={<PlaceholderPage title="Reminders" />} />
          <Route path="/follow-ups" element={<PlaceholderPage title="Follow-ups" />} />
          <Route path="/prayer-requests" element={<PlaceholderPage title="Prayer Requests" />} />
          <Route path="/notices" element={<PlaceholderPage title="Notices" />} />
          <Route path="/sermons" element={<PlaceholderPage title="Sermons" />} />
          <Route path="/devotionals" element={<PlaceholderPage title="Devotionals" />} />
          <Route path="/testimonies" element={<PlaceholderPage title="Testimonies" />} />
          <Route path="/counseling" element={<PlaceholderPage title="Counseling" />} />
          <Route path="/assets" element={<PlaceholderPage title="Assets" />} />
          <Route path="/audit-log" element={<PlaceholderPage title="Audit Log" />} />
          <Route path="/settings" element={<PlaceholderPage title="Settings" />} />
        </Routes>
        </div>
        <Toast />
      </div>
    </div>
  );
}
