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
            <Route path="/events" element={
              <DataListPage title="Events" table="event" webPath="events"
                columns={[
                  { key: "title", label: "Event" },
                  { key: "type", label: "Type" },
                  { key: "starts_at", label: "Date", format: "date" },
                  { key: "capacity", label: "Capacity" },
                ]}
                searchFields={["title", "type"]}
                orderBy="starts_at DESC"
              />
            } />
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
            <Route path="/volunteers" element={
              <DataListPage title="Volunteers" table="volunteer_roster" webPath="volunteers"
                columns={[
                  { key: "name", label: "Roster" },
                  { key: "ministry", label: "Ministry" },
                  { key: "start_date", label: "Start", format: "date" },
                  { key: "end_date", label: "End", format: "date" },
                ]}
                searchFields={["name", "ministry"]}
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
                  { key: "first_name", label: "First Name" },
                  { key: "last_name", label: "Last Name" },
                  { key: "phone", label: "Phone" },
                  { key: "email", label: "Email" },
                  { key: "visit_date", label: "Visit Date", format: "date" },
                ]}
                searchFields={["first_name", "last_name", "phone", "email"]}
                orderBy="visit_date DESC"
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
            <Route path="/reports" element={
              <DataListPage title="Reports" table="audit_log" webPath="reports"
                columns={[
                  { key: "action", label: "Action" },
                  { key: "entity", label: "Type" },
                  { key: "detail", label: "Detail" },
                  { key: "created_at", label: "Date", format: "date" },
                ]}
                searchFields={["action", "entity", "detail"]}
                emptyMessage="Activity logs will appear here after sync."
              />
            } />
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
            <Route path="/pledges" element={
              <DataListPage title="Pledges" table="pledge" webPath="pledges"
                columns={[
                  { key: "donor_name", label: "Donor" },
                  { key: "amount", label: "Amount", format: "currency" },
                  { key: "fulfilled", label: "Fulfilled", format: "currency" },
                  { key: "due_at", label: "Due", format: "date" },
                ]}
                searchFields={["donor_name"]}
                orderBy="due_at DESC"
              />
            } />
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
            <Route path="/expenses" element={
              <DataListPage title="Expenses" table="expense" webPath="expenses"
                columns={[
                  { key: "description", label: "Description" },
                  { key: "category", label: "Category" },
                  { key: "amount", label: "Amount", format: "currency" },
                  { key: "vendor", label: "Vendor" },
                  { key: "date", label: "Date", format: "date" },
                ]}
                searchFields={["description", "category", "vendor"]}
                orderBy="date DESC"
              />
            } />
            <Route path="/budgets" element={
              <DataListPage title="Budgets" table="budget" webPath="budgets"
                columns={[
                  { key: "name", label: "Budget" },
                  { key: "year", label: "Year" },
                  { key: "total", label: "Total", format: "currency" },
                  { key: "status", label: "Status", format: "status" },
                ]}
                searchFields={["name"]}
                orderBy="year DESC"
              />
            } />
            <Route path="/welfare" element={
              <DataListPage title="Welfare" table="welfare_record" webPath="welfare"
                columns={[
                  { key: "recipient_name", label: "Recipient" },
                  { key: "type", label: "Type" },
                  { key: "amount", label: "Amount", format: "currency" },
                  { key: "description", label: "Description" },
                  { key: "date", label: "Date", format: "date" },
                ]}
                searchFields={["recipient_name", "type", "description"]}
                orderBy="date DESC"
              />
            } />
            <Route path="/communications" element={
              <DataListPage title="Communications" table="communication" webPath="communications"
                columns={[
                  { key: "name", label: "Name" },
                  { key: "channel", label: "Channel" },
                  { key: "status", label: "Status", format: "status" },
                  { key: "sent", label: "Sent" },
                  { key: "created_at", label: "Date", format: "date" },
                ]}
                searchFields={["name", "channel"]}
                orderBy="created_at DESC"
              />
            } />
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
            <Route path="/follow-ups" element={
              <DataListPage title="Follow-ups" table="follow_up" webPath="follow-ups"
                columns={[
                  { key: "title", label: "Title" },
                  { key: "type", label: "Type" },
                  { key: "status", label: "Status", format: "status" },
                  { key: "due_date", label: "Due", format: "date" },
                  { key: "created_at", label: "Created", format: "date" },
                ]}
                searchFields={["title", "type"]}
                orderBy="due_date ASC"
              />
            } />
            <Route path="/prayer-requests" element={
              <DataListPage title="Prayer Requests" table="prayer_request" webPath="prayer-requests"
                columns={[
                  { key: "name", label: "From" },
                  { key: "request", label: "Request" },
                  { key: "status", label: "Status", format: "status" },
                  { key: "created_at", label: "Date", format: "date" },
                ]}
                searchFields={["name", "request"]}
                orderBy="created_at DESC"
              />
            } />
            <Route path="/notices" element={
              <DataListPage title="Notices" table="church_notice" webPath="notices"
                columns={[
                  { key: "title", label: "Title" },
                  { key: "body", label: "Content" },
                  { key: "pinned", label: "Pinned" },
                  { key: "created_at", label: "Date", format: "date" },
                ]}
                searchFields={["title", "body"]}
                orderBy="created_at DESC"
              />
            } />
            <Route path="/sermons" element={
              <DataListPage title="Sermons" table="sermon" webPath="sermons"
                columns={[
                  { key: "title", label: "Title" },
                  { key: "preacher", label: "Preacher" },
                  { key: "date", label: "Date", format: "date" },
                  { key: "series", label: "Series" },
                ]}
                searchFields={["title", "preacher", "series"]}
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
                  { key: "title", label: "Title" },
                  { key: "category", label: "Category" },
                  { key: "status", label: "Status", format: "status" },
                  { key: "date", label: "Date", format: "date" },
                ]}
                searchFields={["title", "category"]}
                orderBy="date DESC"
              />
            } />
            <Route path="/counseling" element={
              <DataListPage title="Counseling" table="counseling_session" webPath="counseling"
                columns={[
                  { key: "type", label: "Type" },
                  { key: "summary", label: "Summary" },
                  { key: "status", label: "Status", format: "status" },
                  { key: "date", label: "Date", format: "date" },
                ]}
                searchFields={["type", "summary"]}
                orderBy="date DESC"
              />
            } />
            <Route path="/assets" element={
              <DataListPage title="Assets" table="asset" webPath="assets"
                columns={[
                  { key: "name", label: "Asset" },
                  { key: "category", label: "Category" },
                  { key: "purchase_price", label: "Value", format: "currency" },
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
