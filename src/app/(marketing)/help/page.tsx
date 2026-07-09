import type { Metadata } from "next";
import { PageHero } from "@/components/marketing/page-hero";
import { FinalCTA } from "@/components/marketing/final-cta";
import {
  Users, HandCoins, CalendarCheck2, Megaphone, Bell, ClipboardList,
  QrCode, Upload, Download, Shield, Palette, Link2, BarChart3, Smartphone,
  Heart, UserPlus, Settings, CreditCard,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Help center",
  description: "Learn how to use every feature in WorshipHQ — your church management headquarters.",
};

const sections = [
  {
    title: "People management",
    icon: Users,
    features: [
      {
        name: "Member directory",
        desc: "Every member has a rich profile with contact details, birthday, occupation, emergency contacts and custom fields. Use the search bar and filters (department, engagement level, status) to find anyone instantly.",
      },
      {
        name: "Add members",
        desc: "Click the + button on the People page to add a member manually, or share the self-registration link (Settings → Join link) so members register themselves from their phones.",
      },
      {
        name: "Departments",
        desc: "Create departments like Choir, Ushering, Youth, etc. in Settings → Departments. Assign members to one or more departments from their profile.",
      },
      {
        name: "Member photos & IDs",
        desc: "Upload a member's photo in their profile. Each member also gets a unique member ID that can be displayed as a QR code for quick check-in.",
      },
      {
        name: "Import & export",
        desc: "Import members from a CSV or Excel file via People → Import. Export your entire directory to CSV or Excel (XLSX) using the download button.",
      },
    ],
  },
  {
    title: "Giving & finance",
    icon: HandCoins,
    features: [
      {
        name: "Record giving",
        desc: "Record tithes, offerings and special gifts. Click the + button on the Giving page, select the member, amount, fund and method (Mobile Money, cash, card, bank transfer).",
      },
      {
        name: "Online giving",
        desc: "Share your online giving link so members can give from their phones using Mobile Money or card via Paystack. Receipts are sent automatically.",
      },
      {
        name: "Funds",
        desc: "Create custom funds (Tithes, Building Fund, Missions, etc.) to categorize giving. Track each fund's total separately.",
      },
      {
        name: "Harvest",
        desc: "Track annual harvest/thanksgiving contributions separately. Members can pledge and pay over time. Export harvest reports to Excel.",
      },
      {
        name: "Accounting",
        desc: "Record church expenses and transactions. View income vs expenses reports. Export monthly or yearly financial reports to Excel.",
      },
      {
        name: "Reports & export",
        desc: "Export giving, tithes, harvest and transaction data to CSV or Excel. Tithe reports show member-by-member contributions per month.",
      },
    ],
  },
  {
    title: "Attendance & events",
    icon: CalendarCheck2,
    features: [
      {
        name: "Attendance tracking",
        desc: "Create attendance sessions for each service. Mark members present by searching their name, or use the QR scanner for quick check-in.",
      },
      {
        name: "QR check-in",
        desc: "Open the scanner on the Attendance page and scan a member's QR code (from their profile or member card) to check them in instantly.",
      },
      {
        name: "Public check-in",
        desc: "Share the public attendance link so members can check themselves in from their own phones when they arrive at service.",
      },
      {
        name: "Events",
        desc: "Create events (services, retreats, seminars, camps) with date, time, capacity and optional pricing. Members can register online.",
      },
    ],
  },
  {
    title: "Communications",
    icon: Megaphone,
    features: [
      {
        name: "SMS broadcasts",
        desc: "Send SMS messages to your entire church, a specific department, or individual members. Purchase SMS credits in Settings → Billing. Messages are delivered via Hubtel/Arkesel.",
      },
      {
        name: "Targeted SMS",
        desc: "Send messages to specific groups — all active members, a department, birthday celebrants this month, or hand-picked individuals.",
      },
      {
        name: "Custom sender ID",
        desc: "Request a custom SMS sender ID (e.g. your church name) in Settings → SMS Settings. Once approved, your messages appear with your church's name instead of a random number.",
      },
    ],
  },
  {
    title: "Reminders & automations",
    icon: Bell,
    features: [
      {
        name: "Birthday reminders",
        desc: "Automatically send birthday greetings to members. Enable in Reminders and customise the message template.",
      },
      {
        name: "Anniversary reminders",
        desc: "Send wedding anniversary messages automatically. Dates are pulled from member profiles.",
      },
      {
        name: "Custom reminders",
        desc: "Create your own recurring reminders — weekly prayer night notices, monthly meetings, annual events. Set the date, recurrence (once/weekly/monthly/yearly), audience and message.",
      },
    ],
  },
  {
    title: "Shared links & forms",
    icon: Link2,
    features: [
      {
        name: "Member registration link",
        desc: "Share your /join link so new members can register themselves. The form is fully customisable — add or remove fields, reorder them, set conditions and make fields required.",
      },
      {
        name: "Visitor form",
        desc: "A simpler form at /visit for first-time visitors. Collects name, phone, purpose of visit and prayer requests. Also fully customisable from Settings.",
      },
      {
        name: "Prayer requests",
        desc: "Share your /pray link so members can submit prayer requests online. Requests appear in your dashboard for the pastoral team to follow up.",
      },
      {
        name: "Customisable slug",
        desc: "Change your church's URL slug in Settings → Join link. This updates all three links (join, visit, pray) at once. Pick something short and memorable.",
      },
    ],
  },
  {
    title: "Settings & admin",
    icon: Settings,
    features: [
      {
        name: "Church profile",
        desc: "Set your church name, denomination, city, country and address in Settings → Church profile.",
      },
      {
        name: "Branding",
        desc: "Upload your church logo and choose an accent colour. The entire dashboard, loading screens and shared forms automatically adapt to your brand.",
      },
      {
        name: "Team management",
        desc: "Invite teammates and assign roles (Owner, Admin, Pastor, Finance, Media, Leader, Volunteer). Create custom roles with specific module access.",
      },
      {
        name: "Form builder",
        desc: "Drag-and-drop builder for your registration and visitor forms. Add standard fields (phone, email, gender, etc.) or custom questions. Set conditional logic to show fields based on other answers.",
      },
    ],
  },
  {
    title: "Billing & plans",
    icon: CreditCard,
    features: [
      {
        name: "Plans",
        desc: "Choose from Free (up to 50 members), Starter (250 members, SMS, reminders), Pro (1,000 members, automations, reports) or Max (unlimited members, accounting, API, dedicated support).",
      },
      {
        name: "SMS credits",
        desc: "Purchase SMS bundles in Settings → Billing. Credits are deducted per message sent. Bundles range from 500 to 10,000 credits.",
      },
      {
        name: "Upgrade tips",
        desc: "When you upgrade, you'll see exactly what new features your plan unlocks — so you know what to explore first.",
      },
    ],
  },
  {
    title: "Mobile & offline",
    icon: Smartphone,
    features: [
      {
        name: "Progressive Web App",
        desc: "WorshipHQ works as a PWA — install it on any phone or tablet from the browser. It works like a native app with offline support.",
      },
      {
        name: "Responsive design",
        desc: "Every page is fully responsive. Use WorshipHQ on desktop, tablet or phone — the layout adapts automatically.",
      },
    ],
  },
];

export default function HelpPage() {
  return (
    <>
      <PageHero
        eyebrow="Help center"
        title={
          <>
            Everything,
            <br />
            <span className="text-primary">explained.</span>
          </>
        }
        subtitle="A complete guide to every feature in WorshipHQ."
      />

      <section className="mx-auto max-w-5xl px-4 pb-24 pt-4 sm:px-6">
        <div className="space-y-16">
          {sections.map((section) => (
            <div key={section.title}>
              {/* Chapter heading */}
              <div className="flex items-center gap-4 border-t-2 border-evergreen pt-6">
                <div className="grid size-10 place-items-center border border-evergreen/20 bg-evergreen/5 text-evergreen">
                  <section.icon className="size-4.5" strokeWidth={1.75} />
                </div>
                <h2 className="font-display text-2xl font-bold text-evergreen-deep sm:text-3xl">
                  {section.title}
                </h2>
              </div>
              <div className="mt-8 grid gap-x-12 gap-y-8 sm:grid-cols-2">
                {section.features.map((f) => (
                  <div key={f.name} className="border-t border-ink/10 pt-4">
                    <h3 className="font-display text-lg font-bold text-evergreen-deep">
                      {f.name}
                    </h3>
                    <p className="mt-2.5 text-sm leading-[1.8] text-ink-muted">{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <FinalCTA />
    </>
  );
}
