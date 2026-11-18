// Fills a private TEACHING church with sample data in every main area, so the owner can teach people with it.
// Every member phone starts 010 (not a real Ghana number, and src/lib/integrations/sms.ts never texts them) and
// every email is @example.com (never sent). Refuses to run if the church already has members.
//   npx tsx --require ./scripts/qa/preload.cjs --env-file=.env scripts/seed-teaching-church.ts <churchId>
import { db } from "@/lib/db";
import { TEACHING_CHURCH_IDS } from "@/config/teaching-churches";

const churchId = process.argv[2] ?? "";
if (!TEACHING_CHURCH_IDS.includes(churchId)) { console.error("Not a teaching church id"); process.exit(1); }

let seed = 20261118;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]!;
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const DAY = 86_400_000;
const NOW = new Date();
const daysAgo = (n: number, h = 10) => { const d = new Date(NOW.getTime() - n * DAY); d.setHours(h, 0, 0, 0); return d; };
const daysAhead = (n: number, h = 10) => daysAgo(-n, h);
// Sundays, most recent first.
const lastSunday = (() => { const d = new Date(NOW); d.setHours(9, 0, 0, 0); d.setDate(d.getDate() - d.getDay()); if (d > NOW) d.setDate(d.getDate() - 7); return d; })();
const sunday = (weeksBack: number) => new Date(lastSunday.getTime() - weeksBack * 7 * DAY);
let phoneSeq = 1000;
const samplePhone = () => `010${String(++phoneSeq).padStart(7, "0")}`; // 010 0001001 … never texted
const sampleEmail = (f: string, l: string) => `${f}.${l}`.toLowerCase().replace(/[^a-z.]/g, "") + "@example.com";

const MALE = ["Kwame", "Kofi", "Yaw", "Kwabena", "Kwaku", "Kojo", "Kwesi", "Emmanuel", "Daniel", "Samuel", "Isaac", "Joseph", "Michael", "Prince", "Richard", "Eric", "Stephen", "Felix", "Ebenezer", "Benjamin"];
const FEMALE = ["Ama", "Akosua", "Abena", "Akua", "Yaa", "Afua", "Esi", "Adwoa", "Grace", "Mercy", "Gifty", "Comfort", "Patience", "Esther", "Joyce", "Priscilla", "Linda", "Vida", "Rita", "Doris"];
const LAST = ["Mensah", "Boateng", "Owusu", "Asante", "Darko", "Appiah", "Osei", "Adjei", "Ofori", "Agyeman", "Amoah", "Badu", "Frimpong", "Kyei", "Opoku", "Sarpong", "Acheampong", "Antwi", "Gyamfi", "Nkrumah"];
const TOWNS = ["Bantama", "Asokwa", "Ahodwo", "Suame", "Tafo", "Santasi", "Kwadaso", "Ayigya", "Adum", "Ejisu"];
const JOBS = ["Teacher", "Nurse", "Trader", "Accountant", "Driver", "Engineer", "Student", "Seamstress", "Banker", "Farmer", "Civil servant", "Mechanic", "Pharmacist", "Caterer"];

(async () => {
  const church = await db.church.findUnique({ where: { id: churchId }, select: { name: true } });
  if (!church) throw new Error("church not found");
  if (await db.person.count({ where: { churchId } })) throw new Error("This church already has members: not seeding twice.");
  const owner = await db.user.findFirst({ where: { churchId, role: "Owner" }, select: { id: true, name: true } });
  const hq = await db.branch.findFirst({ where: { churchId }, orderBy: { createdAt: "asc" } });
  const log = (s: string) => console.log("·", s);

  // ---------- Church settings, plan, branches ----------
  await db.church.update({ where: { id: churchId }, data: { memberPrefix: "WC", denomination: "Pentecostal", address: "Bantama High Street, Kumasi", smsCredits: 5000, publicBookingOn: true } });
  await db.subscription.update({ where: { churchId }, data: { plan: "max", interval: "yearly", status: "active", periodStart: NOW, renewsAt: daysAhead(365), autoRenew: false } });
  const ejisu = await db.branch.create({ data: { churchId, name: "Ejisu Branch", city: "Ejisu" } });
  log("church, Max plan, branches");

  // ---------- Departments, roles, categories ----------
  const deptNames = ["Choir", "Ushering", "Media", "Children's Ministry", "Youth", "Welfare", "Protocol", "Prayer Team"];
  for (const name of deptNames) await db.department.create({ data: { churchId, name, description: `${name} department` } });
  const depts = await db.department.findMany({ where: { churchId } });
  const cat = await db.memberCategory.create({ data: { churchId, name: "Fellowship", showOnJoinForm: true } });
  for (const [i, name] of ["Men's Fellowship", "Women's Fellowship", "Youth Fellowship", "Singles"].entries()) await db.memberCategoryOption.create({ data: { churchId, categoryId: cat.id, name, sortOrder: i } });
  for (const [i, name] of ["Worship leader", "Preacher", "Usher", "Sound", "Projection", "Greeter", "Offering counter"].entries()) await db.serviceRole.create({ data: { churchId, name, sortOrder: i } });
  log("departments, categories, service roles");

  // ---------- Households and members ----------
  const households = [];
  for (const l of ["Mensah", "Boateng", "Owusu", "Asante", "Darko", "Appiah"]) households.push(await db.household.create({ data: { churchId, name: `The ${l} Family`, kind: "family" } }));
  const people: { id: string; firstName: string; lastName: string; phone: string; active: boolean; ageGroup: string; gender: string }[] = [];
  let seq = 0;
  for (let i = 0; i < 64; i++) {
    const gender = i % 2 ? "Female" : "Male";
    const firstName = pick(gender === "Male" ? MALE : FEMALE);
    const lastName = i < 18 ? households[i % 6]!.name.split(" ")[1]! : pick(LAST);
    const ageGroup = i >= 56 ? "child" : i >= 50 ? "teen" : "adult";
    const age = ageGroup === "child" ? int(5, 11) : ageGroup === "teen" ? int(13, 17) : int(20, 68);
    const dob = new Date(NOW.getFullYear() - age, int(0, 11), int(1, 28));
    // A few birthdays this week so the dashboard widget has people in it.
    if (i % 13 === 0) { dob.setMonth(NOW.getMonth()); dob.setDate(Math.min(28, NOW.getDate() + (i % 5))); }
    const status = i % 16 === 7 ? "inactive" : "active";
    const phone = samplePhone();
    const p = await db.person.create({
      data: {
        churchId, branchId: i % 9 === 0 ? ejisu.id : hq?.id ?? null, memberId: `WC-${String(++seq).padStart(4, "0")}`,
        firstName, lastName, gender, title: ageGroup !== "adult" ? null : gender === "Male" ? "Mr" : pick(["Mrs", "Miss"]),
        phone, email: ageGroup === "adult" && i % 3 !== 0 ? sampleEmail(firstName, lastName) : null,
        birthday: `${String(dob.getMonth() + 1).padStart(2, "0")}-${String(dob.getDate()).padStart(2, "0")}`, dateOfBirth: dob,
        ageGroup, status: status as never, location: pick(TOWNS), town: pick(TOWNS), region: "Ashanti", country: "Ghana", nationality: "Ghanaian",
        occupation: ageGroup === "adult" ? pick(JOBS) : "Student", maritalStatus: ageGroup === "adult" ? pick(["Married", "Married", "Single", "Widowed"]) : "Single",
        baptized: ageGroup === "adult" ? rnd() > 0.2 : false, departmentId: ageGroup === "adult" ? pick(depts).id : null,
        householdId: i < 18 ? households[i % 6]!.id : null, householdRole: i < 18 ? (i < 6 ? "Head" : i < 12 ? "Spouse" : "Child") : null,
        joinedAt: daysAgo(int(10, 900)), dateOfMembership: daysAgo(int(30, 900)),
        emergencyName: `${pick(FEMALE)} ${lastName}`, emergencyPhone: samplePhone(), emergencyRelation: pick(["Spouse", "Sister", "Brother", "Mother"]),
        guardianName: ageGroup !== "adult" ? `${pick(MALE)} ${lastName}` : null, guardianPhone: ageGroup !== "adult" ? samplePhone() : null,
        school: ageGroup !== "adult" ? pick(["Prempeh College", "Yaa Asantewaa Girls", "Bantama M/A JHS", "St. Louis JHS", "Kumasi Academy"]) : null,
        leaderTitle: i === 0 ? "Senior Pastor" : i === 1 ? "Pastor's Wife" : i === 2 ? "Associate Pastor" : i === 3 ? "Church Secretary" : i === 4 ? "Treasurer" : null,
        featured: i < 5, leaderSortOrder: i < 5 ? i : 0,
      },
    });
    people.push({ id: p.id, firstName, lastName, phone, active: status === "active", ageGroup, gender });
  }
  await db.church.update({ where: { id: churchId }, data: { memberSeq: seq } });
  const adults = people.filter((p) => p.ageGroup === "adult");
  const full = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;
  log(`${people.length} members`);

  // ---------- Groups ----------
  const groupDefs = [
    ["Men's Fellowship", "fellowship", "Saturday", "07:00"], ["Women's Fellowship", "fellowship", "Saturday", "16:00"],
    ["Youth Fellowship", "fellowship", "Friday", "18:30"], ["Bantama Home Cell", "small_group", "Tuesday", "18:30"],
    ["Asokwa Home Cell", "small_group", "Thursday", "18:30"], ["Finance Committee", "committee", "Monday", "19:00"],
    ["Evangelism Ministry", "ministry", "Saturday", "09:00"],
  ] as const;
  for (const [k, [name, type, day, time]] of groupDefs.entries()) {
    const members = (k === 0 ? adults.filter((p) => p.gender === "Male") : k === 1 ? adults.filter((p) => p.gender === "Female") : k === 2 ? people.filter((p) => p.ageGroup === "teen").concat(adults.slice(40, 46)) : adults.slice(k * 5, k * 5 + 9));
    await db.group.create({ data: { churchId, name, type, meetingDay: day, meetingDays: [day], meetingTime: time, location: "Church auditorium", leaderId: members[0]?.id, description: `${name} of ${church.name}`, members: { connect: members.map((m) => ({ id: m.id })) } } });
  }
  log("groups");

  // ---------- Service times and attendance (13 Sundays + midweek) ----------
  const sunSlot = await db.serviceSlot.create({ data: { churchId, name: "Sunday Service", weekday: 0, startMinute: 8 * 60 + 30, endMinute: 12 * 60 } });
  const wedSlot = await db.serviceSlot.create({ data: { churchId, name: "Midweek Service", weekday: 3, startMinute: 18 * 60 + 30, endMinute: 20 * 60 } });
  // Three faithful members stopped coming 3 weeks ago, so "who is missing" and follow-ups have real names.
  const lapsed = new Set(adults.slice(20, 23).map((p) => p.id));
  for (let w = 12; w >= 0; w--) {
    for (const [slot, date, name, share] of [[sunSlot, sunday(w), "Sunday Service", 0.82], [wedSlot, new Date(sunday(w).getTime() - 4 * DAY + 9.5 * 3_600_000), "Midweek Service", 0.4]] as const) {
      if (date > NOW) continue;
      const present = people.filter((p) => p.active && !(lapsed.has(p.id) && w < 3) && rnd() < share);
      const visitors = name === "Sunday Service" ? int(2, 6) : int(0, 2);
      const s = await db.attendanceSession.create({ data: { churchId, branchId: hq?.id, serviceName: name, date, slotId: slot.id, endedAt: new Date(date.getTime() + 3 * 3_600_000),
        adults: present.filter((p) => p.ageGroup === "adult").length, teens: present.filter((p) => p.ageGroup === "teen").length, children: present.filter((p) => p.ageGroup === "child").length, visitors } });
      await db.attendanceRecord.createMany({ data: present.map((p) => ({ churchId, branchId: hq?.id, personId: p.id, sessionId: s.id, category: p.ageGroup, serviceName: name, date: new Date(date.getTime() + int(0, 50) * 60_000), method: pick(["manual", "qr", "self", "qr"]) })) });
    }
  }
  log("attendance");

  // ---------- Visitors ----------
  const visitorIds: string[] = [];
  for (let i = 0; i < 12; i++) {
    const g = i % 2 ? FEMALE : MALE; const firstName = pick(g); const lastName = pick(LAST);
    const v = await db.visitor.create({ data: { churchId, firstName, lastName, phone: samplePhone(), email: i % 3 ? null : sampleEmail(firstName, lastName), purpose: pick(["First time visit", "Invited by a member", "Looking for a church home", "Special programme"]), invitedByName: i % 2 ? full(pick(adults)) : null, visitCount: int(1, 3), visitDate: sunday(int(0, 8)), lastVisit: sunday(int(0, 3)), isRegular: i < 2, notes: i === 0 ? "Wants to join the choir" : null } });
    visitorIds.push(v.id);
  }
  log("visitors");

  // ---------- Follow-ups ----------
  const fu: [string, string, string | null, string | null, string][] = [
    ...[...lapsed].map((id) => ["pastoral", `Call ${full(people.find((p) => p.id === id)!)}: missed 3 Sundays`, id, null, "open"] as [string, string, string | null, string | null, string]),
    ...visitorIds.slice(0, 5).map((id, i) => ["new_visitor", "Welcome call to new visitor", null, id, i < 2 ? "done" : i < 4 ? "in_progress" : "open"] as [string, string, string | null, string | null, string]),
    ["new_member", `Membership class for ${full(adults[30]!)}`, adults[30]!.id, null, "open"],
    ["custom", "Hospital visit: Deacon's mother at Komfo Anokye", adults[8]!.id, null, "in_progress"],
  ];
  for (const [type, title, personId, visitorId, status] of fu) await db.followUp.create({ data: { churchId, type, title, personId, visitorId, status, assigneeId: owner?.id, dueDate: daysAhead(int(1, 6)), completedAt: status === "done" ? daysAgo(1) : null, note: status === "done" ? "Spoke with them, coming next Sunday." : null } });
  log("follow-ups");

  // ---------- Money: accounts, funds, giving ----------
  const bank = await db.churchAccount.create({ data: { churchId, name: "GCB Main Account", type: "bank", bankName: "GCB Bank", accountNumber: "1011XXXXXX", openingBalance: 25000, isDefault: true } });
  const momo = await db.churchAccount.create({ data: { churchId, name: "Church MoMo", type: "mobile-money", openingBalance: 1500 } });
  const cash = await db.churchAccount.create({ data: { churchId, name: "Cash box", type: "cash", openingBalance: 300 } });
  const fund = async (name: string, color: string, restricted = false) => db.fund.create({ data: { churchId, name, color, restricted, accountId: bank.id, inServiceSheet: true } });
  const tithe = await fund("Tithe", "#0d7377"); const offering = await fund("Offering", "#c9a24a"); const building = await fund("Building Fund", "#6d28d9", true);
  const missions = await fund("Missions", "#2563eb"); const thanks = await fund("Thanksgiving", "#16a34a"); const welfareFund = await fund("Welfare", "#e11d48", true);
  const methods = ["Cash", "MTN_MoMo", "Telecel_Cash", "Bank", "Cash", "MTN_MoMo"] as const;
  const gifts = [];
  for (let w = 12; w >= 0; w--) {
    const d = sunday(w);
    gifts.push({ churchId, donorName: "Sunday Offering (loose)", fundId: offering.id, accountId: cash.id, amount: int(1800, 3200), method: "Cash" as const, date: d, receiptSent: false });
    for (const p of adults.filter(() => rnd() < 0.35)) {
      const m = pick(methods);
      gifts.push({ churchId, personId: p.id, fundId: rnd() < 0.7 ? tithe.id : pick([building.id, missions.id, thanks.id]), accountId: m === "Cash" ? cash.id : m === "Bank" ? bank.id : momo.id, amount: pick([50, 100, 150, 200, 250, 300, 500, 80, 120]), method: m, date: new Date(d.getTime() + int(0, 120) * 60_000), receiptSent: true, reference: m === "Cash" ? null : `REF${int(100000, 999999)}` });
    }
  }
  await db.gift.createMany({ data: gifts });
  log(`${gifts.length} gifts`);

  const camp = await db.campaign.create({ data: { churchId, name: "New Auditorium Project", goal: 250000, raised: 86400, endsAt: daysAhead(300) } });
  // Day Born
  for (let w = 3; w >= 0; w--) {
    const weekOf = new Date(sunday(w).getTime() - 6 * DAY);
    const amts = [int(80, 200), int(80, 200), int(80, 200), int(80, 200), int(120, 260), int(120, 260), int(150, 300)];
    const wk = await db.dayBornWeek.create({ data: { churchId, branchId: hq?.id, weekOf, monday: amts[0]!, tuesday: amts[1]!, wednesday: amts[2]!, thursday: amts[3]!, friday: amts[4]!, saturday: amts[5]!, sunday: amts[6]!, posted: w > 0, postedAt: w > 0 ? sunday(w) : null } });
    for (const [i, day] of ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].entries()) await db.dayBornEntry.create({ data: { weekId: wk.id, day, personName: `${day[0]!.toUpperCase()}${day.slice(1)}-born group`, method: pick(["MTN_MoMo", "Telecel_Cash", "bank_transfer"]), amount: amts[i]! } });
  }
  log("campaign, day born");

  // Harvest with contributions and pledges
  const harvest = await db.harvest.create({ data: { churchId, year: NOW.getFullYear(), title: `${NOW.getFullYear()} Harvest Thanksgiving`, date: daysAhead(25), goal: 60000, raised: 0 } });
  let raised = 0;
  for (const p of adults.slice(0, 22)) {
    const amount = pick([200, 300, 500, 1000, 150, 250]); raised += amount;
    await db.harvestContribution.create({ data: { harvestId: harvest.id, churchId, personId: p.id, donorName: full(p), donorPhone: p.phone, amount, method: pick(methods), date: daysAgo(int(1, 40)), receiptSent: true } });
  }
  await db.harvest.update({ where: { id: harvest.id }, data: { raised } });
  for (const [i, p] of adults.slice(10, 26).entries()) {
    const amount = pick([500, 1000, 2000, 1500, 3000]); const paid = i % 4 === 0 ? amount : i % 4 === 1 ? 0 : Math.round(amount * pick([0.25, 0.5, 0.75]));
    const pl = await db.pledge.create({ data: { churchId, personId: p.id, donorName: full(p), donorPhone: p.phone, amount, fulfilled: paid, dueAt: daysAhead(int(-10, 90)), harvestId: i < 8 ? harvest.id : null, campaignId: i >= 8 ? camp.id : null, fundId: i >= 8 ? building.id : null, notes: i === 3 ? "Paying monthly" : null } });
    if (paid) await db.pledgePayment.create({ data: { churchId, pledgeId: pl.id, amount: paid, method: pick(methods), date: daysAgo(int(1, 30)) } });
  }
  log("harvest and pledges");

  // Vendors, expenses, budgets, transactions
  const vendorDefs = [["ECG Prepaid", "Utilities"], ["Ghana Water", "Utilities"], ["Kofi Sound Systems", "Instruments"], ["Ama's Catering", "Events"], ["Bantama Printing Press", "Supplies"]];
  const vendors = [];
  for (const [name, category] of vendorDefs) vendors.push(await db.vendor.create({ data: { churchId, name: name!, category, phone: samplePhone() } }));
  const budget = await db.budget.create({ data: { churchId, name: `${NOW.getFullYear()} Church Budget`, year: NOW.getFullYear(), status: "active", total: 180000, notes: "Approved at the AGM" } });
  const items = [];
  for (const [category, amount] of [["Utilities", 18000], ["Salaries", 72000], ["Missions", 20000], ["Events", 25000], ["Maintenance", 15000], ["Welfare", 12000], ["Supplies", 18000]] as const)
    items.push(await db.budgetItem.create({ data: { churchId, budgetId: budget.id, category, description: `${category} for the year`, amount } }));
  const expDefs: [string, string, number, number][] = [
    ["ECG prepaid units", "Utilities", 850, 0], ["Water bill", "Utilities", 240, 1], ["Sound desk repair", "Instruments", 1200, 2], ["Harvest planning lunch", "Events", 950, 3],
    ["Printing of programme sheets", "Supplies", 420, 4], ["Pastor's monthly stipend", "Salaries", 3500, -1], ["Guest minister honorarium", "Honorarium", 1500, -1],
    ["Transport for evangelism outreach", "Transport", 600, -1], ["Plumbing repairs", "Maintenance", 780, -1], ["Missions support: Northern outreach", "Missions", 2000, -1],
    ["Welfare: hospital bill support", "Welfare", 1000, -1], ["Cleaning supplies", "Supplies", 310, 4], ["District levy", "Levies & remittances", 1800, -1],
  ];
  for (const [k, [description, category, amount, v]] of expDefs.entries()) {
    const item = items.find((it) => it.category === category);
    await db.expense.create({ data: { churchId, description, category, amount, vendorId: v >= 0 ? vendors[v]!.id : null, vendor: v >= 0 ? vendors[v]!.name : null, accountId: k % 3 ? bank.id : cash.id, paymentMethod: pick(["cash", "momo", "bank"]), approvedBy: "Treasurer", budgetId: item ? budget.id : null, budgetItemId: item?.id ?? null, date: daysAgo(int(1, 80)), createdById: owner?.id, createdByName: owner?.name } });
    if (item) await db.budgetItem.update({ where: { id: item.id }, data: { spent: { increment: amount } } });
  }
  for (const [description, category, amount, d] of [["Hall rental income", "Rentals", 1200, 12], ["Bank interest", "Interest", 85, 30], ["Transfer to building fund", "Transfer", -5000, 20], ["Bank charges", "Charges", -45, 30]] as const)
    await db.transaction.create({ data: { churchId, description, category, fund: "General", accountId: bank.id, amount, date: daysAgo(d) } });
  log("vendors, expenses, budget, transactions");

  // Welfare
  await db.welfareRate.create({ data: { churchId, year: NOW.getFullYear(), amount: 20 } });
  const dues = [];
  for (const p of adults.slice(0, 30)) for (let m = 1; m <= NOW.getMonth() + 1; m++) if (rnd() < 0.75) dues.push({ churchId, personId: p.id, year: NOW.getFullYear(), month: m, amount: 20 });
  await db.welfareDue.createMany({ data: dues });
  for (const [type, name, amount, description] of [["medical", full(adults[12]!), 1000, "Support towards surgery at KATH"], ["food", full(adults[25]!), 400, "Food items for the family"], ["education", full(adults[33]!), 800, "School fees support"], ["financial", full(adults[40]!), 500, "Bereavement support"]] as const)
    await db.welfareRecord.create({ data: { churchId, kind: "aid", type, recipientName: name, amount, description, date: daysAgo(int(5, 60)) } });
  log("welfare");

  // ---------- Events, facilities, bookings ----------
  const evs = [["Harvest Thanksgiving Service", "service", 25], ["Youth Camp 2026", "camp", 38], ["Couples' Dinner", "fellowship", 12], ["Leadership Retreat", "conference", -10], ["Carols Night", "service", 37]] as const;
  for (const [title, type, d] of evs) {
    const e = await db.event.create({ data: { churchId, title, type, startsAt: daysAhead(d, 16), endsAt: daysAhead(d, 20), location: d === 38 ? "Kwahu Camp Grounds" : "Main Auditorium", capacity: 200, paid: title === "Couples' Dinner", price: title === "Couples' Dinner" ? 150 : null, notes: `${title} at ${church.name}` } });
    for (const p of adults.slice(int(0, 20), int(25, 40))) await db.registration.create({ data: { eventId: e.id, name: full(p), phone: p.phone, checkedIn: d < 0 } });
  }
  const hall = await db.facility.create({ data: { churchId, name: "Main Auditorium", capacity: 500, location: "Ground floor", rate: 1500, rateUnit: "event", publicBookable: true } });
  const annex = await db.facility.create({ data: { churchId, name: "Annex Hall", capacity: 120, location: "Behind the main building", rate: 600, rateUnit: "event", publicBookable: true } });
  const conf = await db.facility.create({ data: { churchId, name: "Conference Room", capacity: 20, rate: 50, rateUnit: "hour" } });
  for (const [f, title, by, d, status] of [[hall, "Wedding: Kofi and Ama", "Kofi Mensah", 9, "confirmed"], [annex, "Birthday party", "Grace Owusu", 4, "confirmed"], [conf, "Finance committee meeting", "Treasurer", 2, "confirmed"], [hall, "Funeral reception", "Asante family", 16, "pending"], [annex, "Choir rehearsal", "Choir", 1, "confirmed"]] as const)
    await db.booking.create({ data: { churchId, facilityId: f.id, title, bookedBy: by, startTime: daysAhead(d, 9), endTime: daysAhead(d, 14), status, source: status === "pending" ? "public" : "admin", contactPhone: samplePhone(), amount: f.rate ?? undefined } });
  log("events, facilities, bookings");

  // ---------- Pastoral: prayer, testimonies, counselling, baptisms ----------
  for (const [i, req] of ["Pray for my mother's healing", "Journey mercies for my trip to Accra", "Favour in my job interview this week", "Peace in my home", "My exams next month", "Financial breakthrough for my business", "Safe delivery for my wife", "God's direction for my career"].entries())
    await db.prayerRequest.create({ data: { churchId, personId: adults[i + 5]!.id, name: full(adults[i + 5]!), request: req, isAnonymous: i === 3, status: i < 3 ? "prayed" : "active", prayerCount: int(0, 12), prayedAt: i < 3 ? daysAgo(2) : null, prayedBy: i < 3 ? owner?.name : null, createdAt: daysAgo(int(1, 20)) } });
  for (const [i, [title, category]] of [["God healed my back", "healing"], ["I got the job!", "provision"], ["Safe delivery of our baby", "praise"], ["Freed from debt", "provision"], ["I gave my life to Christ", "salvation"]].entries())
    await db.testimony.create({ data: { churchId, personId: adults[i + 15]!.id, title: title!, body: `${title}. I thank God and the church family for standing with me in prayer.`, category: category!, status: i === 0 ? "featured" : i < 3 ? "approved" : "pending", date: daysAgo(int(1, 40)) } });
  for (const [i, [type, status]] of [["marriage", "open"], ["grief", "follow-up"], ["spiritual", "closed"], ["family", "open"]].entries())
    await db.counselingSession.create({ data: { churchId, personId: adults[i + 35]!.id, counseleeName: full(adults[i + 35]!), counselorId: owner?.id, type: type!, status: status!, summary: `${type![0]!.toUpperCase()}${type!.slice(1)} counselling session`, notes: "Confidential notes are kept here.", date: daysAgo(int(1, 30)), followUpDate: status === "follow-up" ? daysAhead(5) : null, scheduledAt: status === "open" ? daysAhead(int(1, 7), 15) : null } });
  for (const [i, p] of adults.slice(44, 50).entries())
    await db.baptism.create({ data: { churchId, personId: p.id, name: full(p), status: i < 4 ? "baptised" : "candidate", date: i < 4 ? daysAgo(int(30, 300)) : daysAhead(30), place: "Church baptismal pool", officiant: full(adults[0]!), certificateNo: i < 4 ? `WC-BAP-${String(i + 1).padStart(3, "0")}` : null } });
  log("prayer, testimonies, counselling, baptisms");

  // ---------- Teaching content ----------
  const series = ["Walking by Faith", "Walking by Faith", "Walking by Faith", "The Good Shepherd", "The Good Shepherd", "Kingdom Living"];
  for (const [i, [title, scripture]] of [["Faith that moves mountains", "Mark 11:22-24"], ["Trusting God in the waiting", "Isaiah 40:31"], ["Faith and works", "James 2:14-26"], ["The Lord is my Shepherd", "Psalm 23"], ["He knows His sheep", "John 10:14-16"], ["Seek first the Kingdom", "Matthew 6:33"]].entries())
    await db.sermon.create({ data: { churchId, title: title!, scripture, preacher: full(adults[i % 3]!), series: series[i], date: sunday(i), notes: "Key points and application for the week.", published: true } });
  for (const [i, [title, scripture]] of [["New mercies every morning", "Lamentations 3:22-23"], ["Be still", "Psalm 46:10"], ["Strength for today", "Philippians 4:13"], ["A lamp to my feet", "Psalm 119:105"], ["Cast your cares", "1 Peter 5:7"]].entries())
    await db.devotional.create({ data: { churchId, title: title!, scripture, body: `Today, read ${scripture} and take a moment to thank God for His faithfulness.`, author: full(adults[0]!), date: daysAgo(i), published: true } });
  for (const [title, body, pinned] of [["Harvest Thanksgiving", "Our Harvest Thanksgiving is coming up. Bring your harvest envelopes.", true], ["Choir rehearsals", "Choir rehearses every Thursday at 6:30 pm.", false], ["Youth camp registration", "Registration for Youth Camp is open. See the youth leader.", false]] as const)
    await db.churchNotice.create({ data: { churchId, title, body, pinned } });
  log("sermons, devotionals, notices");

  // ---------- Volunteers ----------
  const roster = await db.volunteerRoster.create({ data: { churchId, name: "Sunday Service Roster", ministry: "All departments", startDate: sunday(1), endDate: daysAhead(28) } });
  const roles = ["Worship leader", "Preacher", "Usher", "Usher", "Sound", "Projection", "Greeter", "Offering counter"];
  for (let w = -1; w <= 3; w++) {
    const date = new Date(lastSunday.getTime() + w * 7 * DAY);
    for (const role of roles) await db.volunteerSlot.create({ data: { churchId, rosterId: roster.id, personId: role === "Preacher" ? null : pick(adults).id, personName: role === "Preacher" ? full(adults[w % 2 ? 0 : 2]!) : null, service: "Sunday Service", role, date, status: w < 0 ? "confirmed" : pick(["assigned", "confirmed"]) } });
  }
  log("volunteer roster");

  // ---------- Assets and a vehicle ----------
  const assetDefs = [["Yamaha Keyboard PSR", "musical", 6500], ["Drum set", "musical", 9000], ["Mixer 16-channel", "audio-visual", 7800], ["Projector Epson", "audio-visual", 5200], ["Plastic chairs (200)", "furniture", 12000], ["Office laptop", "IT", 6800], ["Gas cooker", "kitchen", 2500], ["Generator 20kVA", "general", 38000]] as const;
  for (const [i, [name, category, price]] of assetDefs.entries())
    await db.asset.create({ data: { churchId, name, category, purchasePrice: price, purchaseDate: daysAgo(int(100, 900)), condition: pick(["good", "good", "fair"]), status: i === 3 ? "in-repair" : "in-service", location: "Main Auditorium", tagCode: `WC-A${String(i + 1).padStart(3, "0")}`, quantity: name.includes("200") ? 200 : 1, serialNo: `SN${int(100000, 999999)}` } });
  await db.church.update({ where: { id: churchId }, data: { assetTagSeq: assetDefs.length + 1 } });
  const busAsset = await db.asset.create({ data: { churchId, name: "Church bus (Toyota Coaster)", category: "vehicle", purchasePrice: 280000, purchaseDate: daysAgo(700), condition: "good", status: "in-service", tagCode: "WC-A009" } });
  await db.vehicle.create({ data: { churchId, assetId: busAsset.id, regNumber: "AS 1234-21", make: "Toyota", model: "Coaster", year: 2019, colour: "White", kind: "bus", seats: 30, fuelType: "diesel", odometerKm: 84200, insuranceExpires: daysAhead(120), roadworthyExpires: daysAhead(45) } });
  await db.church.update({ where: { id: churchId }, data: { assetTagSeq: 10 } });
  log("assets, vehicle");

  // ---------- Messages history (no texts are sent: these are past records) ----------
  for (const [name, body, d] of [["Sunday reminder", "Join us this Sunday at 8:30am. God bless you!", 3], ["Harvest announcement", "Harvest Thanksgiving is coming. Bring your envelopes.", 10], ["Midweek service", "Midweek service tonight at 6:30pm.", 6], ["Youth camp", "Youth camp registration is open.", 15]] as const) {
    const recips = people.filter((p) => p.active).slice(0, 50);
    const c = await db.communication.create({ data: { churchId, name, body, channel: "SMS", segment: "All members", status: "sent", sent: recips.length, delivered: recips.length - 1, createdAt: daysAgo(d) } });
    await db.communicationRecipient.createMany({ data: recips.map((p) => ({ communicationId: c.id, personId: p.id, name: full(p), contact: p.phone, status: "delivered" })) });
  }
  log("message history");
  console.log("DONE");
  process.exit(0);
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
