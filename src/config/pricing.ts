/** Pricing plans - edit here to change every pricing surface. Prices are in USD ($);
 * Paystack charges the GHS equivalent at checkout using PlatformConfig.usdToGhsRate. */

export interface Plan {
  id: string;
  name: string;
  tagline: string;
  monthly: number;
  yearly: number;
  members: string;
  featured?: boolean;
  cta: string;
  features: string[];
  upgradeTips: string[];
}

export const YEARLY_DISCOUNT_LABEL = "Save ~17%";

export const plans: Plan[] = [
  {
    id: "free",
    name: "Free",
    tagline: "For new & small fellowships",
    monthly: 0,
    yearly: 0,
    members: "Up to 40 members",
    cta: "Start free",
    features: [
      "People & households",
      "Giving & offerings",
      "Events & attendance",
      "QR check-in",
      "Mobile app (PWA)",
    ],
    upgradeTips: [],
  },
  {
    id: "starter",
    name: "Starter",
    tagline: "For growing churches",
    monthly: 10,
    yearly: 100,
    members: "Up to 150 members",
    cta: "Choose Starter",
    features: [
      "Everything in Free",
      "SMS broadcasts to your whole church",
      "Birthday & anniversary reminders",
      "Printable member ID cards & QR codes",
      "Design & print QR posters for your forms and check-in",
      "Custom join forms & CSV import/export",
      "Automatic giving receipts & follow-ups",
    ],
    upgradeTips: [
      "Text your entire church, a department, or one person",
      "Members get automatic birthday & anniversary messages",
      "Give every member an ID card with a scannable QR code",
      "Design a poster for the door, with your logo and colours, and print it",
      "Build your own registration forms and import your data",
      "Up to 150 members - room to grow",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For established ministries",
    monthly: 24,
    yearly: 240,
    members: "Up to 300 members",
    featured: true,
    cta: "Choose Pro",
    features: [
      "Everything in Starter",
      "Service rosters & volunteers",
      "Harvest & pledges",
      "Church accounts & expenses",
      "Sermons, devotionals & testimonies library",
      "Facility & room bookings + welfare records",
      "Custom roles & free assisted migration",
      "Send records for every SMS your church sends",
      "Automations: welcome, follow-up & custom reminders",
      "Coming soon: recurring giving & volunteer scheduling",
    ],
    upgradeTips: [
      "Schedule volunteers and build service rosters",
      "Run harvest campaigns and pledges",
      "Publish a sermon library and share devotionals",
      "Take facility bookings and track welfare support",
      "Up to 300 members - built for established churches",
    ],
  },
  {
    id: "max",
    name: "Max",
    tagline: "For large & multi-site churches",
    monthly: 47,
    yearly: 470,
    members: "Unlimited members",
    cta: "Choose Max",
    features: [
      "Everything in Pro",
      "Check-in by fingerprint, face or palm for fast queues",
      "Posters without the WorshipHQ credit line",
      "Your own SMS sender name",
      "Engagement scoring & at-risk member alerts",
      "Advanced analytics & giving intelligence",
      "Restricted funds with enforced balances, budgets & assets",
      "Members marked inactive automatically after weeks away",
      "Confidential counseling notes & audit log",
      "Unlimited members & priority support",
      "Coming soon: API access",
    ],
    upgradeTips: [
      "Check members in by fingerprint, face or palm - no queues, no double check-ins",
      "Members who drift away are marked inactive for you",
      "See who's active, cooling off or at risk of leaving",
      "Deep analytics across giving, attendance and engagement",
      "Ring-fence money for the building fund, and see each fund balance",
      "Unlimited members and priority support",
    ],
  },
];

/** Full feature-comparison matrix shown below the cards.
 *  Columns: Free, Starter, Pro, Max - kept in sync with the plan-gate ladder. */
export const comparison: { group: string; rows: { label: string; values: (boolean | string)[] }[] }[] = [
  {
    group: "People & engagement",
    rows: [
      { label: "Member directory, profiles & photos", values: [true, true, true, true] },
      { label: "Households, groups & departments", values: [true, true, true, true] },
      { label: "QR check-in & attendance", values: [true, true, true, true] },
      { label: "Member ID cards & QR codes", values: [false, true, true, true] },
      { label: "QR poster maker: design, print or save as PDF", values: [false, true, true, true] },
      { label: "Posters without the WorshipHQ credit line", values: [false, false, false, true] },
      { label: "Custom join forms & import/export", values: [false, true, true, true] },
      { label: "Fingerprint, face and palm check-in (devices sold separately)", values: [false, false, false, true] },
      { label: "Engagement scoring & at-risk alerts", values: [false, false, false, true] },
    ],
  },
  {
    group: "Giving & finance",
    rows: [
      { label: "Mobile Money & card giving", values: [true, true, true, true] },
      { label: "Automatic receipts", values: [false, true, true, true] },
      { label: "Harvest & pledges", values: [false, false, true, true] },
      { label: "Recurring giving", values: [false, false, "Coming soon", "Coming soon"] },
      { label: "Church accounts, income & expenses", values: [false, false, true, true] },
      { label: "Restricted funds with enforced balances", values: [false, false, false, true] },
      { label: "Budgets & asset register", values: [false, false, false, true] },
    ],
  },
  {
    group: "Communication & care",
    rows: [
      { label: "SMS broadcasts", values: [false, true, true, true] },
      { label: "Your own SMS sender name", values: [false, false, false, true] },
      { label: "Send records for every SMS sent", values: [false, false, true, true] },
      { label: "Birthday & anniversary reminders", values: [false, true, true, true] },
      { label: "Visitor follow-ups", values: [false, true, true, true] },
      { label: "Welfare & counseling records", values: [false, false, "Welfare", "All"] },
      { label: "Automations: welcome, follow-up & custom reminders", values: [false, false, true, true] },
      { label: "Members marked inactive automatically", values: [false, false, false, true] },
    ],
  },
  {
    group: "Teams, content & operations",
    rows: [
      { label: "Custom roles & permissions", values: [false, false, true, true] },
      { label: "Volunteers & rosters", values: [false, false, true, true] },
      { label: "Volunteer scheduling", values: [false, false, "Coming soon", "Coming soon"] },
      { label: "Sermons, devotionals & testimonies", values: [false, false, true, true] },
      { label: "Facility & room bookings", values: [false, false, true, true] },
    ],
  },
  {
    group: "Analytics, scale & support",
    rows: [
      { label: "Advanced analytics & dashboards", values: [false, false, false, true] },
      { label: "Audit log", values: [false, false, false, true] },
      { label: "API access", values: [false, false, false, "Coming soon"] },
      { label: "Members", values: ["40", "150", "300", "Unlimited"] },
      { label: "Support", values: ["Community", "Email", "Priority", "Dedicated"] },
    ],
  },
];
