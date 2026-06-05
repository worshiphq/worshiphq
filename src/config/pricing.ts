/** Pricing plans — edit here to change every pricing surface. Prices in GHS (₵). */

export interface Plan {
  id: string;
  name: string;
  tagline: string;
  monthly: number;
  yearly: number; // ~17% off (≈2 months free)
  members: string;
  branches: string;
  featured?: boolean;
  cta: string;
  features: string[];
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
    branches: "1 branch",
    cta: "Start free",
    features: [
      "People & households",
      "Giving & offerings (₵)",
      "Events & attendance",
      "QR check-in",
      "Mobile app (PWA)",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    tagline: "For growing churches",
    monthly: 99,
    yearly: 990,
    members: "Up to 250 members",
    branches: "1 branch",
    cta: "Choose Starter",
    features: [
      "Everything in Free",
      "SMS broadcasts",
      "Birthday & anniversary reminders",
      "Recurring giving",
      "Free data migration",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    tagline: "For established ministries",
    monthly: 249,
    yearly: 2490,
    members: "Up to 1,000 members",
    branches: "Up to 3 branches",
    featured: true,
    cta: "Choose Growth",
    features: [
      "Everything in Starter",
      "Automations & workflows",
      "Advanced reports & dashboards",
      "Volunteer scheduling",
      "Priority support",
    ],
  },
  {
    id: "unlimited",
    name: "Unlimited",
    tagline: "For multi-branch churches",
    monthly: 499,
    yearly: 4990,
    members: "Unlimited members",
    branches: "Unlimited branches",
    cta: "Choose Unlimited",
    features: [
      "Everything in Growth",
      "Fund accounting & budgets",
      "Multi-branch roll-up reporting",
      "API access",
      "Dedicated success manager",
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
      { label: "Branches", values: ["1", "1", "3", "Unlimited"] },
      { label: "API access", values: [false, false, false, true] },
      { label: "Support", values: ["Community", "Email", "Priority", "Dedicated"] },
    ],
  },
];
