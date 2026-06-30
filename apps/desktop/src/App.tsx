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
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/people" element={<PeoplePage />} />
            <Route path="/leaders" element={
              <DataListPage title="Leaders" table="person" webPath="leaders"
                columns={[
                  { key: "first_name", label: "First Name" },
                  { key: "last_name", label: "Last Name" },
                  { key: "leader_title", label: "Title" },
                  { key: "phone", label: "Phone" },
                  { key: "email", label: "Email" },
                  { key: "status", label: "Status", format: "status" },
                ]}
                searchFields={["first_name", "last_name", "leader_title", "phone", "email"]}
                orderBy="leader_sort_order ASC, first_name ASC"
              />
            } />
            <Route path="/attendance" element={<AttendancePage />} />
            <Route path="/giving" element={<GivingPage />} />
            <Route path="/dayborn" element={
              <DataListPage title="Day Born" table="day_born_week" webPath="dayborn"
                columns={[
                  { key: "week_of", label: "Week Of", format: "date" },
                  { key: "monday", label: "Mon", format: "currency" },
                  { key: "tuesday", label: "Tue", format: "currency" },
                  { key: "wednesday", label: "Wed", format: "currency" },
                  { key: "thursday", label: "Thu", format: "currency" },
                  { key: "friday", label: "Fri", format: "currency" },
                  { key: "saturday", label: "Sat", format: "currency" },
                  { key: "sunday", label: "Sun", format: "currency" },
                ]}
                searchFields={[]}
                orderBy="week_of DESC"
              />
            } />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/calendar" element={
              <DataListPage title="Calendar" table="event" webPath="calendar"
                columns={[
                  { key: "title", label: "Event" },
                  { key: "type", label: "Type" },
                  { key: "starts_at", label: "Date", format: "date" },
                ]}
                searchFields={["title"]}
                orderBy="starts_at ASC"
              />
            } />
            <Route path="/volunteers" element={<VolunteersPage />} />
            <Route path="/groups" element={<GroupsPage />} />
            <Route path="/visitors" element={<VisitorsPage />} />
            <Route path="/birthdays" element={
              <DataListPage title="Birthdays" table="person" webPath="birthdays"
                columns={[
                  { key: "first_name", label: "First Name" },
                  { key: "last_name", label: "Last Name" },
                  { key: "date_of_birth", label: "Birthday", format: "date" },
                  { key: "phone", label: "Phone" },
                ]}
                searchFields={["first_name", "last_name"]}
                orderBy="date_of_birth ASC"
              />
            } />
            <Route path="/directory" element={
              <DataListPage title="Directory" table="person" webPath="directory"
                columns={[
                  { key: "first_name", label: "First Name" },
                  { key: "last_name", label: "Last Name" },
                  { key: "phone", label: "Phone" },
                  { key: "email", label: "Email" },
                  { key: "status", label: "Status", format: "status" },
                ]}
                searchFields={["first_name", "last_name", "phone", "email"]}
                orderBy="first_name ASC"
              />
            } />
            <Route path="/bookings" element={
              <DataListPage title="Bookings" table="booking" webPath="bookings"
                columns={[
                  { key: "title", label: "Booking" },
                  { key: "booked_by", label: "Booked By" },
                  { key: "start_time", label: "Start", format: "date" },
                  { key: "end_time", label: "End", format: "date" },
                  { key: "status", label: "Status", format: "status" },
                ]}
                searchFields={["title", "booked_by"]}
                orderBy="start_time DESC"
              />
            } />
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
            <Route path="/accounting" element={
              <DataListPage title="Accounting" table="transaction" webPath="accounting"
                columns={[
                  { key: "description", label: "Description" },
                  { key: "category", label: "Category" },
                  { key: "amount", label: "Amount", format: "currency" },
                  { key: "date", label: "Date", format: "date" },
                ]}
                searchFields={["description", "category"]}
                orderBy="date DESC"
              />
            } />
            <Route path="/pledges" element={<PledgesPage />} />
            <Route path="/harvest" element={
              <DataListPage title="Harvest" table="harvest" webPath="harvest"
                columns={[
                  { key: "title", label: "Harvest" },
                  { key: "year", label: "Year" },
                  { key: "goal", label: "Goal", format: "currency" },
                  { key: "raised", label: "Raised", format: "currency" },
                  { key: "date", label: "Date", format: "date" },
                ]}
                searchFields={["title"]}
                orderBy="year DESC"
              />
            } />
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
            <Route path="/audit-log" element={
              <DataListPage title="Audit Log" table="audit_log" webPath="audit-log"
                columns={[
                  { key: "action", label: "Action" },
                  { key: "entity", label: "Entity" },
                  { key: "detail", label: "Detail" },
                  { key: "created_at", label: "Date", format: "date" },
                ]}
                searchFields={["action", "entity", "detail"]}
                orderBy="created_at DESC"
              />
            } />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </div>
        <Toast />
        <SyncOverlay />
      </div>
    </div>
  );
}
