import type { ChurchFacts } from "./steps";

/** Made-up details for previews and test emails only. Never sent to a real church. */
export const SAMPLE: { name: string; church: string; slug: string; facts: ChurchFacts } = {
  name: "Rev. Kofi Mensah",
  church: "Grace Chapel",
  slug: "grace-chapel",
  facts: {
    ageDays: 22,
    plan: "free",
    members: 26,
    attendanceEver: 48,
    lastSunday: { present: 21, absent: 5, date: "2026-11-15" },
    activeRecently: true,
    weekday: 1,
  },
};
