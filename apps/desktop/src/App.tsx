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
import { SettingsPage } from "./pages/SettingsPage";
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

    const unsub = sync.onProgress((p) => {
      if (p.phase === "done" || p.phase === "error") {
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
                  { key: "week_start", label: "Week Start", format: "date" },
                  { key: "week_end", label: "Week End", format: "date" },
                  { key: "total_amount", label: "Total", format: "currency" },
                  { key: "created_at", label: "Created", format: "date" },
                ]}
                searchFields={[]}
              />
            } />
            <Route path="/events" element={
              <DataListPage title="Events" table="event" webPath="events"
                columns={[
                  { key: "title", label: "Event" },
                  { key: "date", label: "Date", format: "date" },
                  { key: "location", label: "Location" },
                  { key: "status", label: "Status", format: "status" },
                ]}
                searchFields={["title", "location"]}
                orderBy="date DESC"
              />
            } />
            <Route path="/calendar" element={
              <DataListPage title="Calendar" table="event" webPath="calendar"
                columns={[
                  { key: "title", label: "Event" },
                  { key: "date", label: "Date", format: "date" },
                  { key: "location", label: "Location" },
                ]}
                searchFields={["title"]}
                orderBy="date ASC"
              />
            } />
            <Route path="/volunteers" element={
              <DataListPage title="Volunteers" table="volunteer_roster" webPath="volunteers"
                columns={[
                  { key: "name", label: "Roster" },
                  { key: "department_name", label: "Department" },
                  { key: "created_at", label: "Created", format: "date" },
                ]}
                searchFields={["name", "department_name"]}
              />
            } />
            <Route path="/groups" element={
              <DataListPage title="Groups" table="[group]" webPath="groups"
                columns={[
                  { key: "name", label: "Group Name" },
                  { key: "description", label: "Description" },
                  { key: "type", label: "Type" },
                  { key: "created_at", label: "Created", format: "date" },
                ]}
                searchFields={["name", "description"]}
              />
            } />
            <Route path="/visitors" element={
              <DataListPage title="Visitors" table="visitor" webPath="visitors"
                columns={[
                  { key: "name", label: "Name" },
                  { key: "phone", label: "Phone" },
                  { key: "email", label: "Email" },
                  { key: "first_visit", label: "First Visit", format: "date" },
                  { key: "status", label: "Status", format: "status" },
                ]}
                searchFields={["name", "phone", "email"]}
                orderBy="first_visit DESC"
              />
            } />
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
                  { key: "facility_name", label: "Facility" },
                  { key: "date", label: "Date", format: "date" },
                  { key: "status", label: "Status", format: "status" },
                ]}
                searchFields={["title"]}
                orderBy="date DESC"
              />
            } />
            <Route path="/rosters" element={
              <DataListPage title="Rosters" table="volunteer_roster" webPath="rosters"
                columns={[
                  { key: "name", label: "Roster" },
                  { key: "department_name", label: "Department" },
                  { key: "created_at", label: "Created", format: "date" },
                ]}
                searchFields={["name"]}
              />
            } />
            <Route path="/reports" element={
              <DataListPage title="Reports" table="audit_log" webPath="reports"
                columns={[
                  { key: "action", label: "Action" },
                  { key: "entity_type", label: "Type" },
                  { key: "user_name", label: "By" },
                  { key: "created_at", label: "Date", format: "date" },
                ]}
                searchFields={["action", "entity_type", "user_name"]}
                emptyMessage="Activity logs will appear here after sync."
              />
            } />
            <Route path="/accounting" element={
              <DataListPage title="Accounting" table="transaction" webPath="accounting"
                columns={[
                  { key: "description", label: "Description" },
                  { key: "type", label: "Type" },
                  { key: "amount", label: "Amount", format: "currency" },
                  { key: "date", label: "Date", format: "date" },
                ]}
                searchFields={["description", "type"]}
                orderBy="date DESC"
              />
            } />
            <Route path="/pledges" element={
              <DataListPage title="Pledges" table="pledge" webPath="pledges"
                columns={[
                  { key: "member_name", label: "Member" },
                  { key: "amount", label: "Amount", format: "currency" },
                  { key: "paid", label: "Paid", format: "currency" },
                  { key: "due_date", label: "Due", format: "date" },
                  { key: "status", label: "Status", format: "status" },
                ]}
                searchFields={["member_name"]}
                orderBy="due_date DESC"
              />
            } />
            <Route path="/harvest" element={
              <DataListPage title="Harvest" table="harvest" webPath="harvest"
                columns={[
                  { key: "title", label: "Harvest" },
                  { key: "target_amount", label: "Target", format: "currency" },
                  { key: "total_raised", label: "Raised", format: "currency" },
                  { key: "start_date", label: "Start", format: "date" },
                  { key: "status", label: "Status", format: "status" },
                ]}
                searchFields={["title"]}
                orderBy="start_date DESC"
              />
            } />
            <Route path="/expenses" element={
              <DataListPage title="Expenses" table="expense" webPath="expenses"
                columns={[
                  { key: "description", label: "Description" },
                  { key: "category", label: "Category" },
                  { key: "amount", label: "Amount", format: "currency" },
                  { key: "date", label: "Date", format: "date" },
                  { key: "status", label: "Status", format: "status" },
                ]}
                searchFields={["description", "category"]}
                orderBy="date DESC"
              />
            } />
            <Route path="/budgets" element={
              <DataListPage title="Budgets" table="budget" webPath="budgets"
                columns={[
                  { key: "name", label: "Budget" },
                  { key: "total_amount", label: "Total", format: "currency" },
                  { key: "period", label: "Period" },
                  { key: "status", label: "Status", format: "status" },
                ]}
                searchFields={["name"]}
              />
            } />
            <Route path="/welfare" element={
              <DataListPage title="Welfare" table="welfare_record" webPath="welfare"
                columns={[
                  { key: "member_name", label: "Member" },
                  { key: "type", label: "Type" },
                  { key: "amount", label: "Amount", format: "currency" },
                  { key: "date", label: "Date", format: "date" },
                  { key: "status", label: "Status", format: "status" },
                ]}
                searchFields={["member_name", "type"]}
                orderBy="date DESC"
              />
            } />
            <Route path="/communications" element={
              <DataListPage title="Communications" table="communication" webPath="communications"
                columns={[
                  { key: "subject", label: "Subject" },
                  { key: "type", label: "Type" },
                  { key: "recipients", label: "Recipients" },
                  { key: "sent_at", label: "Sent", format: "date" },
                  { key: "status", label: "Status", format: "status" },
                ]}
                searchFields={["subject"]}
                orderBy="sent_at DESC"
              />
            } />
            <Route path="/reminders" element={
              <DataListPage title="Reminders" table="automation" webPath="reminders"
                columns={[
                  { key: "name", label: "Reminder" },
                  { key: "type", label: "Type" },
                  { key: "next_run", label: "Next Run", format: "date" },
                  { key: "status", label: "Status", format: "status" },
                ]}
                searchFields={["name"]}
              />
            } />
            <Route path="/follow-ups" element={
              <DataListPage title="Follow-ups" table="follow_up" webPath="follow-ups"
                columns={[
                  { key: "member_name", label: "Member" },
                  { key: "type", label: "Type" },
                  { key: "priority", label: "Priority" },
                  { key: "due_date", label: "Due", format: "date" },
                  { key: "status", label: "Status", format: "status" },
                ]}
                searchFields={["member_name", "type"]}
                orderBy="due_date ASC"
              />
            } />
            <Route path="/prayer-requests" element={
              <DataListPage title="Prayer Requests" table="prayer_request" webPath="prayer-requests"
                columns={[
                  { key: "member_name", label: "From" },
                  { key: "request", label: "Request" },
                  { key: "created_at", label: "Date", format: "date" },
                  { key: "status", label: "Status", format: "status" },
                ]}
                searchFields={["member_name", "request"]}
                orderBy="created_at DESC"
              />
            } />
            <Route path="/notices" element={
              <DataListPage title="Notices" table="church_notice" webPath="notices"
                columns={[
                  { key: "title", label: "Title" },
                  { key: "content", label: "Content" },
                  { key: "created_at", label: "Date", format: "date" },
                ]}
                searchFields={["title", "content"]}
                orderBy="created_at DESC"
              />
            } />
            <Route path="/sermons" element={
              <DataListPage title="Sermons" table="sermon" webPath="sermons"
                columns={[
                  { key: "title", label: "Title" },
                  { key: "speaker", label: "Speaker" },
                  { key: "date", label: "Date", format: "date" },
                  { key: "series", label: "Series" },
                ]}
                searchFields={["title", "speaker", "series"]}
                orderBy="date DESC"
              />
            } />
            <Route path="/devotionals" element={
              <DataListPage title="Devotionals" table="devotional" webPath="devotionals"
                columns={[
                  { key: "title", label: "Title" },
                  { key: "author", label: "Author" },
                  { key: "date", label: "Date", format: "date" },
                ]}
                searchFields={["title", "author"]}
                orderBy="date DESC"
              />
            } />
            <Route path="/testimonies" element={
              <DataListPage title="Testimonies" table="testimony" webPath="testimonies"
                columns={[
                  { key: "member_name", label: "By" },
                  { key: "title", label: "Title" },
                  { key: "created_at", label: "Date", format: "date" },
                  { key: "status", label: "Status", format: "status" },
                ]}
                searchFields={["member_name", "title"]}
                orderBy="created_at DESC"
              />
            } />
            <Route path="/counseling" element={
              <DataListPage title="Counseling" table="counseling_session" webPath="counseling"
                columns={[
                  { key: "member_name", label: "Member" },
                  { key: "counselor_name", label: "Counselor" },
                  { key: "date", label: "Date", format: "date" },
                  { key: "status", label: "Status", format: "status" },
                ]}
                searchFields={["member_name", "counselor_name"]}
                orderBy="date DESC"
              />
            } />
            <Route path="/assets" element={
              <DataListPage title="Assets" table="asset" webPath="assets"
                columns={[
                  { key: "name", label: "Asset" },
                  { key: "category", label: "Category" },
                  { key: "value", label: "Value", format: "currency" },
                  { key: "condition", label: "Condition" },
                  { key: "location", label: "Location" },
                ]}
                searchFields={["name", "category", "location"]}
              />
            } />
            <Route path="/audit-log" element={
              <DataListPage title="Audit Log" table="audit_log" webPath="audit-log"
                columns={[
                  { key: "action", label: "Action" },
                  { key: "entity_type", label: "Entity" },
                  { key: "user_name", label: "User" },
                  { key: "created_at", label: "Date", format: "date" },
                ]}
                searchFields={["action", "entity_type", "user_name"]}
                orderBy="created_at DESC"
              />
            } />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </div>
        <Toast />
      </div>
    </div>
  );
}
