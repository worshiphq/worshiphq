import type { LucideIcon } from "lucide-react";
import {
  Users,
  HandCoins,
  CalendarDays,
  MessageSquare,
  Bell,
  CalendarCheck,
  Wallet,
  Building2,
  QrCode,
} from "lucide-react";

export interface Feature {
  icon: LucideIcon;
  title: string;
  blurb: string;
}

export const featureCards: Feature[] = [
  { icon: Users, title: "People & profiles", blurb: "Rich member profiles with photos, IDs, departments, custom fields and smart search — your whole congregation, organised." },
  { icon: HandCoins, title: "Giving & online payments", blurb: "Record tithes and offerings. Accept online giving via Mobile Money and cards with Paystack. Receipts sent automatically." },
  { icon: Bell, title: "Birthday & anniversary reminders", blurb: "Never miss a birthday or anniversary — automatic SMS blessings sent on the day, in your church's voice." },
  { icon: CalendarDays, title: "Attendance & QR check-in", blurb: "Create attendance sessions, mark members present by name or scan their QR code for lightning-fast check-in." },
  { icon: MessageSquare, title: "SMS broadcasts", blurb: "Reach your entire church, a department, or hand-picked members by SMS. Targeted messaging with custom sender ID." },
  { icon: QrCode, title: "Member IDs & QR codes", blurb: "Every member gets a unique ID and QR code. Scan to check in, view profiles, or verify membership instantly." },
  { icon: CalendarCheck, title: "Events & registration", blurb: "Create services, seminars and camps with date, time, capacity and optional pricing. Members register online." },
  { icon: Wallet, title: "Harvest & fund tracking", blurb: "Track annual harvest contributions, pledges and multiple giving funds. Export detailed reports to Excel." },
  { icon: Building2, title: "Departments & settings", blurb: "Departments, custom roles, team management, form builder, branding and everything you need to run your church." },
];

export interface Spotlight {
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  image: string;
}

export const spotlights: Spotlight[] = [
  {
    eyebrow: "People",
    title: "Know every member by name",
    body: "Build a living picture of your congregation — profiles with photos, departments, attendance history and custom fields. Import from CSV or let members register themselves.",
    points: ["Rich profiles with photos & member IDs", "Departments & custom fields", "CSV import & export", "Self-registration via shared link"],
    image: "https://images.unsplash.com/photo-1609234656388-0ff363383899?auto=format&fit=crop&w=1200&q=80",
  },
  {
    eyebrow: "Giving",
    title: "Giving made simple",
    body: "Record tithes and offerings with ease. Accept online giving via Mobile Money and cards through Paystack. Track funds, harvest contributions and send receipts automatically.",
    points: ["Mobile Money & card payments", "Multiple funds & harvest tracking", "Automated receipts", "Giving reports & Excel export"],
    image: "https://images.unsplash.com/photo-1504052434569-70ad5836ab65?auto=format&fit=crop&w=1200&q=80",
  },
  {
    eyebrow: "Reminders & automations",
    title: "Care that never forgets",
    body: "Birthdays, anniversaries and custom reminders — all sent automatically via SMS, so no one slips through the cracks.",
    points: ["Automatic birthday & anniversary SMS", "Custom recurring reminders", "Targeted messaging", "Custom sender ID"],
    image: "https://images.unsplash.com/photo-1478147427282-58a87a120781?auto=format&fit=crop&w=1200&q=80",
  },
  {
    eyebrow: "Communications",
    title: "One message, your whole church",
    body: "Send a Sunday reminder by SMS, a targeted note to your worship team, or a message to individual members — with delivery tracking.",
    points: ["SMS broadcasts", "Department & individual targeting", "Custom sender ID", "Delivery tracking"],
    image: "https://images.unsplash.com/photo-1507692049790-de58290a4334?auto=format&fit=crop&w=1200&q=80",
  },
];

export interface Step {
  n: string;
  title: string;
  body: string;
}

export const steps: Step[] = [
  { n: "01", title: "Set up your church", body: "Add your departments, funds and branding in minutes. Import members from a spreadsheet — we'll handle duplicates." },
  { n: "02", title: "Invite your team", body: "Bring in pastors, finance officers and ministry leaders with role-based access. Everyone sees exactly what they should." },
  { n: "03", title: "Engage your congregation", body: "Start giving, check-in, reminders and broadcasts. Watch attendance and giving grow — beautifully, on every device." },
];

export interface Testimonial {
  quote: string;
  name: string;
  role: string;
  church: string;
}

export const testimonials: Testimonial[] = [
  { quote: "We moved 1,200 members onto WorshipHQ in a weekend. Online giving alone has transformed our offerings.", name: "Rev. Daniel Mensah", role: "Senior Pastor", church: "Grace Temple, Accra · Ghana" },
  { quote: "The automatic birthday messages make every member feel seen. Our follow-up of first-time visitors has never been this consistent.", name: "Pastor Grace Adeyemi", role: "Connections Pastor", church: "City Light Chapel, Lagos · Nigeria" },
  { quote: "As a finance officer, the fund accounting and audit trail give me total peace of mind. Reports that used to take days now take minutes.", name: "James Whitfield", role: "Finance Director", church: "Cornerstone Church, Dallas · USA" },
  { quote: "Running four campuses from one dashboard is a game-changer. Leadership finally sees the whole picture in real time.", name: "Bishop Selorm Agbeko", role: "Presiding Bishop", church: "Faith Cathedral, Nairobi · Kenya" },
  { quote: "Even when the network drops, the app still works. That reliability has been everything for our church.", name: "Maria Santos", role: "Administrator", church: "Igreja da Esperança, São Paulo · Brazil" },
  { quote: "Our youth love the QR check-in. Camp registration that used to be chaos is now effortless.", name: "Daniel Park", role: "Youth Director", church: "Living Hope, Manila · Philippines" },
  { quote: "Volunteer scheduling used to eat my whole week. Now the rosters and reminders just run themselves.", name: "Sarah Thompson", role: "Operations Pastor", church: "Riverside Community, London · UK" },
  { quote: "The giving statements and reports keep us fully transparent with our congregation and our board.", name: "Emeka Okafor", role: "Church Treasurer", church: "Redeemed Assembly, Abuja · Nigeria" },
];

export interface Faq {
  q: string;
  a: string;
}

export const faqs: Faq[] = [
  { q: "Is my church's data secure?", a: "Yes. Every church's data is fully isolated (multi-tenant), encrypted in transit and at rest, and backed up regularly. You control who on your team can see what through role-based permissions." },
  { q: "Does it support Mobile Money?", a: "Absolutely. WorshipHQ supports Mobile Money wallets, debit/credit cards and bank transfers — powered by Paystack." },
  { q: "Can you help us migrate from our current system?", a: "Yes. Import your members, giving history and groups from a spreadsheet with our guided importer. On paid plans, free assisted migration is included." },
  { q: "Does it work when the internet is slow or down?", a: "Yes. WorshipHQ is a Progressive Web App that caches your recent data on your device, so it loads instantly and keeps working offline, then syncs when you're back online." },
  { q: "Can we install it like an app?", a: "Yes — install it on any phone, tablet or computer straight from the browser. No app store needed. It feels and behaves like a native app." },
  { q: "How much does it cost?", a: "There's a free plan forever for up to 50 members. Paid plans start at {PRICE}/month, with about two months free when you pay yearly. Billing is handled securely by Paystack." },
];
