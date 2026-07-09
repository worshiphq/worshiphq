import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { auth, sync } from "./lib/api";
import { useAppStore } from "./stores/app-store";
import { LoginPage } from "./components/LoginPage";
import { Sidebar } from "./components/Sidebar";
import { TitleBar } from "./components/TitleBar";
import { Toast } from "./components/Toast";
import { SyncOverlay } from "./components/SyncOverlay";
import { PlanGate } from "./components/PlanGate";
import { TourProvider } from "./components/Tour";
import { DashboardPage } from "./pages/DashboardPage";
import { PeoplePage } from "./pages/PeoplePage";
import { GivingPage } from "./pages/GivingPage";
import { AttendancePage } from "./pages/AttendancePage";
import { SettingsPage } from "./pages/SettingsPage";
import { EventsPage } from "./pages/EventsPage";
import { GroupsPage } from "./pages/GroupsPage";
import { VolunteersPage } from "./pages/VolunteersPage";
import { ReportsPage } from "./pages/ReportsPage";
import { PledgesPage } from "./pages/PledgesPage";
import { ExpensesPage } from "./pages/ExpensesPage";
import { BudgetsPage } from "./pages/BudgetsPage";
import { WelfarePage } from "./pages/WelfarePage";
import { CommunicationsPage } from "./pages/CommunicationsPage";
import { SermonsPage } from "./pages/SermonsPage";
import { PrayerRequestsPage } from "./pages/PrayerRequestsPage";
import { FollowUpsPage } from "./pages/FollowUpsPage";
import { VisitorsPage } from "./pages/VisitorsPage";
import { NoticesPage } from "./pages/NoticesPage";
import { DevotionalsPage } from "./pages/DevotionalsPage";
import { TestimoniesPage } from "./pages/TestimoniesPage";
import { CounselingPage } from "./pages/CounselingPage";
import { AssetsPage } from "./pages/AssetsPage";
import { CalendarPage } from "./pages/CalendarPage";
import { LeadersPage } from "./pages/LeadersPage";
import { DirectoryPage } from "./pages/DirectoryPage";
import { BirthdaysPage } from "./pages/BirthdaysPage";
import { BookingsPage } from "./pages/BookingsPage";
import { HarvestPage } from "./pages/HarvestPage";
import { AuditLogPage } from "./pages/AuditLogPage";
import { DaybornPage } from "./pages/DaybornPage";
import { ChildrenPage } from "./pages/ChildrenPage";
import { AccountingPage } from "./pages/AccountingPage";
import { DataListPage } from "./pages/DataListPage";

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

    return () => {};
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
      <PlanGate>
      <TourProvider>
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/people" element={<PeoplePage />} />
            <Route path="/leaders" element={<LeadersPage />} />
            <Route path="/attendance" element={<AttendancePage />} />
            <Route path="/giving" element={<GivingPage />} />
            <Route path="/dayborn" element={<DaybornPage />} />
            <Route path="/children" element={<ChildrenPage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/volunteers" element={<VolunteersPage />} />
            <Route path="/groups" element={<GroupsPage />} />
            <Route path="/visitors" element={<VisitorsPage />} />
            <Route path="/birthdays" element={<BirthdaysPage />} />
            <Route path="/directory" element={<DirectoryPage />} />
            <Route path="/bookings" element={<BookingsPage />} />
            <Route path="/rosters" element={
              <DataListPage title="Rosters" table="volunteer_roster" webPath="rosters"
                columns={[
                  { key: "name", label: "Roster" },
                  { key: "ministry", label: "Ministry" },
                  { key: "start_date", label: "Start", format: "date" },
                  { key: "end_date", label: "End", format: "date" },
                ]}
                searchFields={["name", "ministry"]}
              />
            } />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/accounting" element={<AccountingPage />} />
            <Route path="/pledges" element={<PledgesPage />} />
            <Route path="/harvest" element={<HarvestPage />} />
            <Route path="/expenses" element={<ExpensesPage />} />
            <Route path="/budgets" element={<BudgetsPage />} />
            <Route path="/welfare" element={<WelfarePage />} />
            <Route path="/communications" element={<CommunicationsPage />} />
            <Route path="/reminders" element={
              <DataListPage title="Reminders" table="automation" webPath="reminders"
                columns={[
                  { key: "name", label: "Reminder" },
                  { key: "trigger_type", label: "Trigger" },
                  { key: "channel", label: "Channel" },
                  { key: "runs", label: "Runs" },
                  { key: "last_run_at", label: "Last Run", format: "date" },
                ]}
                searchFields={["name", "trigger_type"]}
              />
            } />
            <Route path="/follow-ups" element={<FollowUpsPage />} />
            <Route path="/prayer-requests" element={<PrayerRequestsPage />} />
            <Route path="/notices" element={<NoticesPage />} />
            <Route path="/sermons" element={<SermonsPage />} />
            <Route path="/devotionals" element={<DevotionalsPage />} />
            <Route path="/testimonies" element={<TestimoniesPage />} />
            <Route path="/counseling" element={<CounselingPage />} />
            <Route path="/assets" element={<AssetsPage />} />
            <Route path="/audit-log" element={<AuditLogPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </div>
        <Toast />
        <SyncOverlay />
      </div>
      </TourProvider>
      </PlanGate>
    </div>
  );
}
