/** Pricing plans — edit here to change every pricing surface. Prices in GHS (₵). */

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
    members: "Up to 50 members",
    cta: "Start free",
    features: [
      "People & households",
      "Giving & offerings (₵)",
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
    monthly: 99,
    yearly: 990,
    members: "Up to 250 members",
    cta: "Choose Starter",
    features: [
      "Everything in Free",
      "SMS broadcasts",
      "Birthday & anniversary reminders",
      "Recurring giving",
      "Free data migration",
    ],
    upgradeTips: [
      "Send SMS broadcasts to your entire church in one click",
      "Members get automatic birthday & anniversary messages",
      "Set up recurring giving so members never miss an offering",
      "We'll migrate your existing data for free — just ask",
      "Up to 250 members — room to grow",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For established ministries",
    monthly: 249,
    yearly: 2490,
    members: "Up to 1,000 members",
    featured: true,
    cta: "Choose Pro",
    features: [
      "Everything in Starter",
      "Automations & workflows",
      "Advanced reports & dashboards",
      "Volunteer scheduling",
      "Priority support",
    ],
    upgradeTips: [
      "Automate follow-ups, new member welcomes and reminders",
      "Advanced dashboards with giving trends and engagement scores",
      "Schedule and manage volunteers across services",
      "Priority support — we respond within hours, not days",
      "Up to 1,000 members — built for established churches",
    ],
  },
  {
    id: "max",
    name: "Max",
    tagline: "For large churches",
    monthly: 499,
    yearly: 4990,
    members: "Unlimited members",
    cta: "Choose Max",
    features: [
      "Everything in Pro",
      "Fund accounting & budgets",
      "Advanced analytics",
      "API access",
      "Dedicated success manager",
    ],
    upgradeTips: [
      "Full fund accounting with budgets and financial reports",
      "Deep analytics across giving, attendance and engagement",
      "API access to integrate with your existing church tools",
      "A dedicated success manager to help your church thrive",
      "Unlimited members — no caps, no limits",
    ],
  },
];

/** Full feature-comparison matrix shown below the cards. */
export const comparison: { group: string; rows: { label: string; values: (boolean | string)[] }[] }[] = [
  {
    group: "People & engagement",
    rows: [
      { label: "Member directory & profiles", values: [true, true, true, true] },
      { label: "Households & groups", values: [true, true, true, true] },
      { label: "QR check-in & attendance", values: [true, true, true, true] },
      { label: "Smart lists & tags", values: [false, true, true, true] },
      { label: "Engagement scoring", values: [false, false, true, true] },
    ],
  },
  {
    group: "Giving & finance",
    rows: [
      { label: "Mobile Money & card giving", values: [true, true, true, true] },
      { label: "Recurring giving & pledges", values: [false, true, true, true] },
      { label: "Automated receipts & statements", values: [false, true, true, true] },
      { label: "Fund accounting & budgets", values: [false, false, false, true] },
    ],
  },
  {
    group: "Communications",
    rows: [
      { label: "Email broadcasts", values: [true, true, true, true] },
      { label: "SMS broadcasts", values: [false, true, true, true] },
      { label: "Birthday & anniversary reminders", values: [false, true, true, true] },
      { label: "Automations & sequences", values: [false, false, true, true] },
    ],
  },
  {
    group: "Scale & support",
    rows: [
      { label: "API access", values: [false, false, false, true] },
      { label: "Support", values: ["Community", "Email", "Priority", "Dedicated"] },
    ],
  },
];
