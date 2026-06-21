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
  Building2,
  Settings,
  UserRoundPlus,
  ClipboardList,
  Heart,
  Users2,
  Target,
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
    items: [{ key: "dashboard", label: "Dashboard", href: "/app", icon: LayoutDashboard }],
  },
  {
    title: "Congregation",
    items: [
      { key: "people", label: "People", href: "/app/people", icon: Users },
      { key: "attendance", label: "Attendance", href: "/app/attendance", icon: CalendarCheck2 },
      { key: "events", label: "Events", href: "/app/events", icon: CalendarDays },
      { key: "volunteers", label: "Volunteers", href: "/app/volunteers", icon: HandHelping },
      { key: "people", label: "Groups", href: "/app/groups", icon: Users2 },
      { key: "people", label: "Visitors", href: "/app/visitors", icon: UserRoundPlus },
    ],
  },
  {
    title: "Giving & finance",
    items: [
      { key: "giving", label: "Giving", href: "/app/giving", icon: HandCoins },
      { key: "accounting", label: "Accounting", href: "/app/accounting", icon: Wallet },
      { key: "giving", label: "Pledges", href: "/app/pledges", icon: Target },
      { key: "harvest", label: "Harvest", href: "/app/harvest", icon: Wheat },
    ],
  },
  {
    title: "Engagement",
    items: [
      { key: "communications", label: "Communications", href: "/app/communications", icon: MessageSquare },
      { key: "reminders", label: "Reminders", href: "/app/reminders", icon: BellRing, badge: "Auto" },
      { key: "people", label: "Follow-ups", href: "/app/follow-ups", icon: ClipboardList },
      { key: "people", label: "Prayer requests", href: "/app/prayer-requests", icon: Heart },
    ],
  },
  {
    title: "Organisation",
    items: [
      { key: "branches", label: "Branches", href: "/app/branches", icon: Building2 },
      { key: "settings", label: "Settings", href: "/app/settings", icon: Settings },
    ],
  },
];
