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
  { icon: Users, title: "People & profiles", blurb: "Rich member profiles with photos, IDs, departments, custom fields and smart search - your whole congregation, organised." },
  { icon: HandCoins, title: "Giving & online payments", blurb: "Record tithes and offerings. Accept online giving via Mobile Money and cards with Paystack. Receipts sent automatically." },
  { icon: Bell, title: "Birthday & anniversary reminders", blurb: "Never miss a birthday or anniversary - automatic SMS blessings sent on the day, in your church's voice." },
  { icon: CalendarDays, title: "Attendance & QR check-in", blurb: "Create attendance sessions, mark members present by name or scan their QR code for lightning-fast check-in." },
  { icon: MessageSquare, title: "SMS broadcasts", blurb: "Reach your entire church, a department, or hand-picked members by SMS. Targeted messaging, and your own sender name on Max." },
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
  /** A real screenshot of the app (browser frame included), an optional phone screenshot, and a short floating note. */
  shot: string;
  phone?: string;
  chip: string;
}

export const spotlights: Spotlight[] = [
  {
    eyebrow: "People",
    title: "Know every member by name",
    body: "Profiles with photos, departments, households and attendance history. Share a link and members fill in their own details, or import a spreadsheet.",
    points: ["Profiles, households & departments", "Members register themselves by link", "Visitor and prayer request forms", "Member ID cards & spreadsheet import (Starter)"],
    shot: "/marketing/app/people.webp",
    phone: "/marketing/app/m-join.webp",
    chip: "Members fill in their own details",
  },
  {
    eyebrow: "Giving",
    title: "Giving made simple",
    body: "Record tithes, offerings and Day Born on every plan. On Starter, givers get a receipt by text. On Pro, members can give online by Mobile Money and card, straight into the church account.",
    points: ["Tithes, offerings and Day Born (every plan)", "Automatic receipts by text (Starter)", "Online giving by Mobile Money & card (Pro)", "Harvest, pledges and church accounts (Pro)"],
    shot: "/marketing/app/giving.webp",
    phone: "/marketing/app/m-give.webp",
    chip: "Receipt texted in seconds",
  },
  {
    eyebrow: "Reminders & automations",
    title: "Care that never forgets",
    body: "Birthday wishes go out on the day, and the people who missed Sunday are on a list for a leader to call. No one slips through the cracks.",
    points: ["Automatic birthday texts (Starter and up)", "Absentee follow-up the same day", "Reminders you set up (Starter)", "Your church's own sender name (Max)"],
    shot: "/marketing/app/follow-ups.webp",
    phone: "/marketing/app/m-visit.webp",
    chip: "Every visitor gets a call back",
  },
  {
    eyebrow: "Communications",
    title: "One message, your whole church",
    body: "Send a Sunday reminder to everyone, a note to the choir, or a text to one member. It reaches every phone, even the ones without data.",
    points: ["Text the whole church in one tap", "Pick a department, group or person", "A record of every text sent (Pro)", "Your church's own sender name (Max)"],
    shot: "/marketing/app/communications.webp",
    chip: "One tap reaches every phone",
  },
];

export interface Step {
  n: string;
  title: string;
  body: string;
}

export const steps: Step[] = [
  { n: "01", title: "Set up your church", body: "Add your logo and departments, then share your registration link so members fill in their own details." },
  { n: "02", title: "Invite your team", body: "Bring in pastors, finance officers and ministry leaders with role-based access. Everyone sees exactly what they should." },
  { n: "03", title: "Engage your congregation", body: "Check people in on Sunday, record the offering, text the absentees. On a phone, a tablet or a laptop." },
];

export interface Testimonial {
  quote: string;
  name: string;
  role: string;
  church: string;
}

/**
 * Real testimonials only: a real person at a real church who agreed to be quoted. Added in SuperAdmin, Content.
 * The landing page hides the section while this is empty. Never put invented quotes here.
 */
export const testimonials: Testimonial[] = [];

export interface Faq {
  q: string;
  a: string;
}

export const faqs: Faq[] = [
  { q: "Is my church's data private?", a: "Yes. Each church's records are kept separate, so no other church can see them, and everything travels encrypted. Inside your church, roles decide who on your team sees what." },
  { q: "Does it take Mobile Money?", a: "Yes. Churches pay for WorshipHQ with Mobile Money or card. On the Pro plan and above, your members can also give to the church online by Mobile Money or card, paid into the church's own account." },
  { q: "Do we need the face or fingerprint devices?", a: "No. Every plan can mark attendance by name, and Starter adds QR check-in. The face, palm and fingerprint devices at the door are part of Max, and we can supply and set them up for you." },
  { q: "Can we bring our members from a spreadsheet?", a: "Yes. On Starter and above, import your members from Excel or a CSV file. Or share your registration link and let members fill in their own details on any plan." },
  { q: "What happens on a poor connection?", a: "WorshipHQ is light and loads quickly on mobile data, and pages you have opened recently open fast. You do need a connection to save changes." },
  { q: "Can we install it like an app?", a: "Yes. Add it to the home screen of any phone, tablet or computer from the browser. No app store needed." },
  { q: "How much does it cost?", a: "There's a free plan forever for {FREE_MEMBERS}. Paid plans start at {PRICE} a month, and paying yearly costs less. New churches can try bulk SMS free for 14 days." },
];
