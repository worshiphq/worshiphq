/**
 * Demo / seed data for WorshipHQ — realistic Ghanaian names, churches, ₵ amounts
 * and Accra/Kumasi locations so every screen looks full and alive in stub mode.
 * In production these come from the database (Prisma); the shapes mirror the schema.
 */

export type Role = "Owner" | "Admin" | "Pastor" | "Finance" | "Media" | "Leader" | "Volunteer";
export type Engagement = "thriving" | "steady" | "at-risk" | "new";

export interface Person {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role?: Role;
  household: string;
  ministries: string[];
  branch: string;
  status: "active" | "visitor" | "inactive";
  engagement: Engagement;
  joined: string; // ISO
  birthday: string; // MM-DD
  anniversary?: string; // MM-DD
  location: string;
  avatarSeed: number;
}

export const branches = [
  { id: "accra-central", name: "Accra Central", city: "Accra", isHQ: true, members: 1240 },
  { id: "east-legon", name: "East Legon", city: "Accra", members: 612 },
  { id: "kumasi", name: "Kumasi Campus", city: "Kumasi", members: 845 },
  { id: "tema", name: "Tema Community 7", city: "Tema", members: 388 },
];

export const ministries = [
  "Worship Team",
  "Ushering",
  "Media & Sound",
  "Children's Church",
  "Youth Ministry",
  "Prayer Team",
  "Welfare",
  "Evangelism",
  "Protocol",
  "Choir",
];

const FIRST = [
  "Kwame", "Akosua", "Yaw", "Ama", "Kofi", "Abena", "Kojo", "Adwoa", "Kwabena", "Akua",
  "Kwaku", "Afia", "Yaa", "Kwadwo", "Esi", "Nana", "Kwesi", "Efua", "Fiifi", "Maa",
  "Selorm", "Eyram", "Delali", "Mawuli", "Senyo", "Edem", "Elikem", "Naa", "Araba", "Kukua",
];
const LAST = [
  "Mensah", "Osei", "Boateng", "Asante", "Owusu", "Appiah", "Agyeman", "Adjei", "Darko", "Ofori",
  "Sarpong", "Annan", "Quaye", "Tetteh", "Nkrumah", "Acheampong", "Frimpong", "Gyamfi", "Addo", "Bonsu",
  "Dz-amesi", "Agbeko", "Kuuku", "Lartey", "Amoah", "Antwi", "Baidoo", "Cudjoe", "Ankrah", "Yeboah",
];
const LOCATIONS = [
  "Osu, Accra", "East Legon, Accra", "Adenta, Accra", "Tema", "Spintex, Accra",
  "Kumasi, Ashanti", "Achimota, Accra", "Madina, Accra", "Dansoman, Accra", "Kasoa",
];

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function buildPeople(count: number): Person[] {
  const rand = rng(42);
  const people: Person[] = [];
  const engagements: Engagement[] = ["thriving", "steady", "steady", "at-risk", "new"];
  for (let i = 0; i < count; i++) {
    const first = FIRST[Math.floor(rand() * FIRST.length)];
    const last = LAST[Math.floor(rand() * LAST.length)];
    const branch = branches[Math.floor(rand() * branches.length)].name;
    const mins = ministries
      .filter(() => rand() > 0.7)
      .slice(0, 3);
    const month = String(Math.floor(rand() * 12) + 1).padStart(2, "0");
    const day = String(Math.floor(rand() * 28) + 1).padStart(2, "0");
    const status = rand() > 0.88 ? "visitor" : rand() > 0.95 ? "inactive" : "active";
    people.push({
      id: `p-${i + 1}`,
      firstName: first,
      lastName: last,
      email: `${first.toLowerCase()}.${last.toLowerCase().replace(/[^a-z]/g, "")}@gmail.com`,
      phone: `+233 ${Math.floor(rand() * 5) + 2}${Math.floor(rand() * 9)} ${String(Math.floor(rand() * 900) + 100)} ${String(Math.floor(rand() * 9000) + 1000)}`,
      household: `${last} Household`,
      ministries: mins,
      branch,
      status,
      engagement: status === "visitor" ? "new" : engagements[Math.floor(rand() * engagements.length)],
      joined: new Date(2019 + Math.floor(rand() * 6), Math.floor(rand() * 12), Math.floor(rand() * 28) + 1)
        .toISOString(),
      birthday: `${month}-${day}`,
      anniversary: rand() > 0.6 ? `${String(Math.floor(rand() * 12) + 1).padStart(2, "0")}-${day}` : undefined,
      location: LOCATIONS[Math.floor(rand() * LOCATIONS.length)],
      avatarSeed: i,
    });
  }
  return people;
}

export const people = buildPeople(64);

export function fullName(p: Person) {
  return `${p.firstName} ${p.lastName}`;
}

/** People whose birthday is "today" (uses a fixed demo date so the widget is never empty). */
export const DEMO_TODAY = "06-05"; // 5 June

export const todaysBirthdays = people.filter((p) => p.birthday === DEMO_TODAY).slice(0, 4).length
  ? people.filter((p) => p.birthday === DEMO_TODAY).slice(0, 4)
  : people.slice(0, 3);

// ── Giving ──────────────────────────────────────────────
export const funds = [
  { id: "tithes", name: "Tithes", color: "#0d9488" },
  { id: "offering", name: "Sunday Offering", color: "#14b8a6" },
  { id: "building", name: "Building Fund", color: "#E5B567" },
  { id: "missions", name: "Missions", color: "#34D399" },
  { id: "welfare", name: "Welfare", color: "#60A5FA" },
];

export type GiftMethod = "MTN MoMo" | "Telecel Cash" | "AirtelTigo" | "Card" | "Cash";
export interface Gift {
  id: string;
  donor: string;
  amount: number;
  fund: string;
  method: GiftMethod;
  date: string;
  recurring?: boolean;
}

function buildGifts(): Gift[] {
  const rand = rng(7);
  const methods: GiftMethod[] = ["MTN MoMo", "MTN MoMo", "Telecel Cash", "AirtelTigo", "Card", "Cash"];
  const gifts: Gift[] = [];
  for (let i = 0; i < 40; i++) {
    const p = people[Math.floor(rand() * people.length)];
    const daysAgo = Math.floor(rand() * 30);
    gifts.push({
      id: `g-${i + 1}`,
      donor: fullName(p),
      amount: [20, 50, 100, 150, 200, 300, 500, 1000][Math.floor(rand() * 8)],
      fund: funds[Math.floor(rand() * funds.length)].name,
      method: methods[Math.floor(rand() * methods.length)],
      date: new Date(Date.now() - daysAgo * 86400000).toISOString(),
      recurring: rand() > 0.7,
    });
  }
  return gifts.sort((a, b) => +new Date(b.date) - +new Date(a.date));
}
export const gifts = buildGifts();

export const givingTrend = [
  { month: "Jan", amount: 38200, attendance: 1180 },
  { month: "Feb", amount: 41500, attendance: 1240 },
  { month: "Mar", amount: 39800, attendance: 1205 },
  { month: "Apr", amount: 46300, attendance: 1320 },
  { month: "May", amount: 52100, attendance: 1410 },
  { month: "Jun", amount: 58400, attendance: 1485 },
];

export const fundBreakdown = [
  { name: "Tithes", value: 31200 },
  { name: "Offering", value: 12800 },
  { name: "Building", value: 8600 },
  { name: "Missions", value: 3400 },
  { name: "Welfare", value: 2400 },
];

// ── Events ──────────────────────────────────────────────
export const events = [
  { id: "e1", title: "Sunday Celebration Service", date: "2026-06-07", time: "08:00", type: "Service", branch: "Accra Central", registered: 0, capacity: 1500, paid: false },
  { id: "e2", title: "Midweek Encounter", date: "2026-06-10", time: "18:30", type: "Service", branch: "All branches", registered: 0, capacity: 800, paid: false },
  { id: "e3", title: "Worship Nights: Glory", date: "2026-06-13", time: "17:00", type: "Special", branch: "Accra Central", registered: 642, capacity: 1200, paid: false },
  { id: "e4", title: "Marriage Enrichment Seminar", date: "2026-06-21", time: "09:00", type: "Seminar", branch: "East Legon", registered: 88, capacity: 120, paid: true, price: 150 },
  { id: "e5", title: "Youth Camp 2026", date: "2026-07-04", time: "07:00", type: "Camp", branch: "Kumasi Campus", registered: 214, capacity: 300, paid: true, price: 250 },
  { id: "e6", title: "Leaders' Strategy Retreat", date: "2026-07-18", time: "08:30", type: "Retreat", branch: "All branches", registered: 46, capacity: 60, paid: true, price: 400 },
];

// ── Communications ──────────────────────────────────────
export const campaigns = [
  { id: "c1", name: "Sunday Service Reminder", channel: "SMS", sent: 1240, delivered: 1218, opened: 0, date: "2026-06-04", status: "Sent" },
  { id: "c2", name: "June Newsletter", channel: "Email", sent: 980, delivered: 962, opened: 611, date: "2026-06-01", status: "Sent" },
  { id: "c3", name: "Worship Nights Invite", channel: "SMS", sent: 1240, delivered: 1230, opened: 0, date: "2026-05-30", status: "Sent" },
  { id: "c4", name: "Welcome — First-time Visitors", channel: "Email", sent: 0, delivered: 0, opened: 0, date: "2026-06-08", status: "Scheduled" },
];

// ── Automations ─────────────────────────────────────────
export const automations = [
  { id: "a1", name: "Birthday blessing (SMS)", trigger: "On member birthday", channel: "SMS", active: true, runs: 312, description: "Sends a warm birthday SMS at 7:00am on each member's birthday." },
  { id: "a2", name: "Wedding anniversary (SMS)", trigger: "On anniversary", channel: "SMS", active: true, runs: 96, description: "Celebrates couples on their wedding anniversary." },
  { id: "a3", name: "First-time visitor follow-up", trigger: "1 day after first visit", channel: "Email + SMS", active: true, runs: 148, description: "3-step welcome sequence over the first two weeks." },
  { id: "a4", name: "Lapsed member nudge", trigger: "No attendance for 21 days", channel: "SMS", active: true, runs: 54, description: "A gentle 'we miss you' check-in to re-engage members." },
  { id: "a5", name: "Pledge reminder", trigger: "Building fund pledge due", channel: "SMS", active: false, runs: 0, description: "Reminds members of outstanding building-fund pledges." },
];

// ── Volunteers / scheduling ─────────────────────────────
export const volunteerTeams = [
  { id: "v1", team: "Worship Team", lead: "Akosua Mensah", needed: 8, scheduled: 7, role: "Vocals & Instruments" },
  { id: "v2", team: "Ushering", lead: "Yaw Boateng", needed: 12, scheduled: 12, role: "Welcome & Seating" },
  { id: "v3", team: "Media & Sound", lead: "Kojo Owusu", needed: 5, scheduled: 3, role: "Livestream & FOH" },
  { id: "v4", team: "Children's Church", lead: "Adwoa Sarpong", needed: 10, scheduled: 8, role: "Teachers & Helpers" },
];

// ── Accounting ──────────────────────────────────────────
export const accounts = [
  { id: "t1", date: "2026-06-04", description: "Sunday Offering deposit", category: "Income", fund: "Offering", amount: 12800 },
  { id: "t2", date: "2026-06-03", description: "Generator fuel & maintenance", category: "Operations", fund: "General", amount: -1450 },
  { id: "t3", date: "2026-06-02", description: "Tithes — Mobile Money settlement", category: "Income", fund: "Tithes", amount: 31200 },
  { id: "t4", date: "2026-06-01", description: "Media equipment (mixer)", category: "Equipment", fund: "Building", amount: -6800 },
  { id: "t5", date: "2026-05-30", description: "Pastoral welfare support", category: "Welfare", fund: "Welfare", amount: -2400 },
  { id: "t6", date: "2026-05-29", description: "Missions remittance — Northern outreach", category: "Missions", fund: "Missions", amount: -3400 },
  { id: "t7", date: "2026-05-28", description: "Building fund deposit", category: "Income", fund: "Building", amount: 8600 },
];

export const budgets = [
  { category: "Worship & Production", budget: 8000, spent: 6450 },
  { category: "Children & Youth", budget: 5000, spent: 3120 },
  { category: "Missions & Outreach", budget: 12000, spent: 9800 },
  { category: "Operations & Utilities", budget: 6000, spent: 5640 },
  { category: "Welfare", budget: 4000, spent: 2400 },
];

// ── Tasks / care follow-ups ─────────────────────────────
export const careTasks = [
  { id: "k1", person: "Ama Owusu", reason: "First-time visitor — call to welcome", due: "Today", priority: "high" as const },
  { id: "k2", person: "Kwabena Adjei", reason: "Missed 3 Sundays — check in", due: "Today", priority: "high" as const },
  { id: "k3", person: "Esi Quaye", reason: "Hospital visit — recovering", due: "Tomorrow", priority: "medium" as const },
  { id: "k4", person: "Yaw Frimpong", reason: "New believer — connect to small group", due: "Fri", priority: "medium" as const },
  { id: "k5", person: "Adwoa Darko", reason: "Baby dedication request", due: "Next week", priority: "low" as const },
];

// ── Aggregate KPIs ──────────────────────────────────────
export const kpis = {
  activeMembers: 3085,
  weeklyAttendance: 1485,
  monthlyGiving: 58400,
  messageReach: 2410,
  attendanceChange: 5.3,
  givingChange: 12.1,
  membersChange: 3.4,
  reachChange: 8.7,
};
