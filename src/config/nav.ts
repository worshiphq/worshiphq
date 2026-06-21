import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  CalendarCheck2,
  HandCoins,
  CalendarDays,
  HandHelping,
  MessageSquare,
  BellRing,
  Wallet,
  Wheat,
  Settings,
  UserRoundPlus,
  ClipboardList,
  Heart,
  Users2,
  Target,
  BarChart3,
  Cake,
  Megaphone,
  BookUser,
  Calendar,
  ScrollText,
  BookMarked,
  Package,
  Receipt,
  DoorOpen,
  BookHeart,
  Sparkles,
  HeartHandshake,
  PiggyBank,
  CalendarClock,
} from "lucide-react";

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export const nav: NavSection[] = [
  {
    items: [
      { key: "dashboard", label: "Dashboard", href: "/app", icon: LayoutDashboard },
      { key: "dashboard", label: "Reports", href: "/app/reports", icon: BarChart3 },
    ],
  },
  {
    title: "Congregation",
    items: [
      { key: "people", label: "People", href: "/app/people", icon: Users },
      { key: "attendance", label: "Attendance", href: "/app/attendance", icon: CalendarCheck2 },
      { key: "events", label: "Events", href: "/app/events", icon: CalendarDays },
      { key: "events", label: "Calendar", href: "/app/calendar", icon: Calendar },
      { key: "volunteers", label: "Volunteers", href: "/app/volunteers", icon: HandHelping },
      { key: "people", label: "Groups", href: "/app/groups", icon: Users2 },
      { key: "people", label: "Visitors", href: "/app/visitors", icon: UserRoundPlus },
      { key: "people", label: "Birthdays", href: "/app/birthdays", icon: Cake },
      { key: "people", label: "Directory", href: "/app/directory", icon: BookUser },
      { key: "events", label: "Bookings", href: "/app/bookings", icon: DoorOpen },
      { key: "volunteers", label: "Rosters", href: "/app/rosters", icon: CalendarClock },
    ],
  },
  {
    title: "Giving & finance",
    items: [
      { key: "giving", label: "Giving", href: "/app/giving", icon: HandCoins },
      { key: "accounting", label: "Accounting", href: "/app/accounting", icon: Wallet },
      { key: "giving", label: "Pledges", href: "/app/pledges", icon: Target },
      { key: "harvest", label: "Harvest", href: "/app/harvest", icon: Wheat },
      { key: "accounting", label: "Expenses", href: "/app/expenses", icon: Receipt },
      { key: "accounting", label: "Budgets", href: "/app/budgets", icon: PiggyBank },
      { key: "giving", label: "Welfare", href: "/app/welfare", icon: HandHelping },
    ],
  },
  {
    title: "Engagement",
    items: [
      { key: "communications", label: "Communications", href: "/app/communications", icon: MessageSquare },
      { key: "reminders", label: "Reminders", href: "/app/reminders", icon: BellRing, badge: "Auto" },
      { key: "people", label: "Follow-ups", href: "/app/follow-ups", icon: ClipboardList },
      { key: "people", label: "Prayer requests", href: "/app/prayer-requests", icon: Heart },
      { key: "communications", label: "Notices", href: "/app/notices", icon: Megaphone },
      { key: "events", label: "Sermons", href: "/app/sermons", icon: BookMarked },
      { key: "communications", label: "Devotionals", href: "/app/devotionals", icon: BookHeart },
      { key: "communications", label: "Testimonies", href: "/app/testimonies", icon: Sparkles },
      { key: "people", label: "Counseling", href: "/app/counseling", icon: HeartHandshake },
    ],
  },
  {
    title: "Organisation",
    items: [
      { key: "settings", label: "Assets", href: "/app/assets", icon: Package },
      { key: "settings", label: "Audit log", href: "/app/audit-log", icon: ScrollText },
      { key: "settings", label: "Settings", href: "/app/settings", icon: Settings },
    ],
  },
];
