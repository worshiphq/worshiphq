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
  BarChart3,
} from "lucide-react";

export interface Feature {
  icon: LucideIcon;
  title: string;
  blurb: string;
}

export const featureCards: Feature[] = [
  { icon: Users, title: "People & households", blurb: "Rich member profiles, families, groups, tags and smart lists — your whole congregation, organised." },
  { icon: HandCoins, title: "Giving & Mobile Money", blurb: "Accept tithes & offerings via MTN MoMo, Telecel Cash, AirtelTigo and cards. Receipts sent automatically." },
  { icon: Bell, title: "Birthday reminders", blurb: "Never miss a birthday or anniversary — automatic SMS blessings sent on the day, in your church's voice." },
  { icon: CalendarDays, title: "Events & check-in", blurb: "Create services, seminars and camps with registration, ticketing and lightning-fast QR check-in." },
  { icon: MessageSquare, title: "SMS & email broadcasts", blurb: "Reach everyone — or a smart segment — by SMS and email, with delivery analytics you can trust." },
  { icon: BarChart3, title: "Reports & dashboards", blurb: "Attendance, giving and engagement trends in beautiful, real-time dashboards. Decisions, made clear." },
  { icon: CalendarCheck, title: "Volunteer scheduling", blurb: "Drag-and-drop rosters, skill matching, self-scheduling and automatic reminders for every team." },
  { icon: Wallet, title: "Fund accounting", blurb: "Fund-based accounting, budgets, expense tracking and audit-ready financial reports — native in ₵." },
  { icon: Building2, title: "Organisation", blurb: "Departments, assets, audit logs, and customisable settings — everything you need to run your church." },
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
    body: "Build a living picture of your congregation — households, ministries, attendance history and engagement, all in one profile. Spot who's thriving and who needs a call.",
    points: ["Households & family links", "Smart lists & tags", "Engagement scoring", "CSV import with duplicate detection"],
    image: "https://images.unsplash.com/photo-1609234656388-0ff363383899?auto=format&fit=crop&w=1200&q=80",
  },
  {
    eyebrow: "Giving",
    title: "Giving as easy as a text message",
    body: "Your members already use Mobile Money — meet them there. Accept MTN MoMo, Telecel Cash, AirtelTigo and cards, set up recurring giving, and send receipts automatically.",
    points: ["MTN MoMo, Telecel & AirtelTigo", "Recurring giving & pledges", "Automated receipts & year-end statements", "Giving dashboards in ₵"],
    image: "https://images.unsplash.com/photo-1504052434569-70ad5836ab65?auto=format&fit=crop&w=1200&q=80",
  },
  {
    eyebrow: "Reminders & automations",
    title: "Care that never forgets",
    body: "Birthdays, anniversaries, first-time-visitor follow-ups and gentle nudges for members who've been away — all sent automatically, so no one slips through the cracks.",
    points: ["Automatic birthday & anniversary SMS", "First-time visitor sequences", "Lapsed-member nudges", "Custom workflows"],
    image: "https://images.unsplash.com/photo-1478147427282-58a87a120781?auto=format&fit=crop&w=1200&q=80",
  },
  {
    eyebrow: "Communications",
    title: "One message, your whole church",
    body: "Send a Sunday reminder by SMS, a monthly newsletter by email, or a targeted note to your worship team — then see exactly what was delivered.",
    points: ["SMS broadcasts (Ghana-ready)", "Email builder", "Segmentation & scheduling", "Delivery analytics"],
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
  { quote: "We moved 1,200 members onto WorshipHQ in a weekend. Online and mobile giving alone has transformed our offerings.", name: "Rev. Daniel Mensah", role: "Senior Pastor", church: "Grace Temple, Accra · Ghana" },
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
  { q: "Does it support Mobile Money?", a: "Absolutely. WorshipHQ supports MTN MoMo, Telecel Cash and AirtelTigo Money, plus debit/credit cards, all in Ghana Cedi (₵) — powered by Paystack." },
  { q: "Can you help us migrate from our current system?", a: "Yes. Import your members, giving history and groups from a spreadsheet with our guided importer. On paid plans, free assisted migration is included." },
  { q: "Does it work when the internet is slow or down?", a: "Yes. WorshipHQ is a Progressive Web App that caches your recent data on your device, so it loads instantly and keeps working offline, then syncs when you're back online." },
  { q: "Can we install it like an app?", a: "Yes — install it on any phone, tablet or computer straight from the browser. No app store needed. It feels and behaves like a native app." },
  { q: "How much does it cost?", a: "There's a free plan forever for up to 50 members. Paid plans start at ₵99/month, with about two months free when you pay yearly." },
];
