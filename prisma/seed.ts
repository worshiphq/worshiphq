/**
 * Seeds a read-only DEMO church (slug "demo", isDemo=true) using the showcase
 * data in src/lib/demo/data.ts. This is what visitors see on the marketing site's
 * "View live demo". Real churches are created via sign-up and start empty.
 *
 * Run: npx prisma db seed   (idempotent — wipes & rebuilds the demo church only)
 */
import { PrismaClient, GiftMethod, Channel, PersonStatus } from "@prisma/client";
import {
  branches as demoBranches,
  ministries,
  people as demoPeople,
  funds as demoFunds,
  gifts as demoGifts,
  events as demoEvents,
  automations as demoAutomations,
  campaigns as demoCampaigns,
  accounts as demoAccounts,
  fullName,
} from "../src/lib/demo/data";

const db = new PrismaClient();

const methodMap: Record<string, GiftMethod> = {
  "MTN MoMo": "MTN_MoMo",
  "Telecel Cash": "Telecel_Cash",
  AirtelTigo: "AirtelTigo",
  Card: "Card",
  Cash: "Cash",
};

async function main() {
  console.log("🌱 Seeding demo church…");

  // Wipe any existing demo church (cascade clears its children).
  await db.church.deleteMany({ where: { slug: "demo" } });

  const church = await db.church.create({
    data: {
      slug: "demo",
      isDemo: true,
      name: "Grace Temple (Demo)",
      denomination: "Pentecostal",
      city: "Accra",
      country: "Ghana",
      address: "12 Independence Ave, Osu, Accra",
    },
  });

  // Branches
  const branchByName = new Map<string, string>();
  for (const b of demoBranches) {
    const created = await db.branch.create({
      data: { churchId: church.id, name: b.name, city: b.city, isHQ: !!b.isHQ },
    });
    branchByName.set(b.name, created.id);
  }

  // Groups (ministries)
  await db.group.createMany({
    data: ministries.map((m) => ({ churchId: church.id, name: m, type: "ministry" })),
  });

  // People
  await db.person.createMany({
    data: demoPeople.map((p) => ({
      churchId: church.id,
      branchId: branchByName.get(p.branch) ?? null,
      firstName: p.firstName,
      lastName: p.lastName,
      email: p.email,
      phone: p.phone,
      status: p.status as PersonStatus,
      location: p.location,
      birthday: p.birthday,
      anniversary: p.anniversary ?? null,
      joinedAt: new Date(p.joined),
    })),
  });

  const dbPeople = await db.person.findMany({ where: { churchId: church.id } });
  const personByName = new Map(dbPeople.map((p) => [`${p.firstName} ${p.lastName}`, p.id]));

  // Funds
  const fundByName = new Map<string, string>();
  for (const f of demoFunds) {
    const created = await db.fund.create({ data: { churchId: church.id, name: f.name, color: f.color } });
    fundByName.set(f.name, created.id);
  }

  // Gifts
  await db.gift.createMany({
    data: demoGifts.map((g) => ({
      churchId: church.id,
      personId: personByName.get(g.donor) ?? null,
      donorName: g.donor,
      fundId: fundByName.get(g.fund) ?? null,
      amount: g.amount,
      method: methodMap[g.method] ?? "Cash",
      recurring: !!g.recurring,
      date: new Date(g.date),
    })),
  });

  // Events
  for (const e of demoEvents) {
    await db.event.create({
      data: {
        churchId: church.id,
        branchId: branchByName.get(e.branch) ?? null,
        title: e.title,
        type: e.type,
        startsAt: new Date(`${e.date}T${e.time}:00`),
        capacity: e.capacity,
        paid: e.paid,
        price: e.paid ? e.price ?? 0 : null,
      },
    });
  }

  // Automations
  await db.automation.createMany({
    data: demoAutomations.map((a) => ({
      churchId: church.id,
      name: a.name,
      description: a.description,
      trigger: a.trigger,
      channel: (a.channel.includes("Email") ? "Email" : "SMS") as Channel,
      active: a.active,
      runs: a.runs,
    })),
  });

  // Communications (campaigns)
  await db.communication.createMany({
    data: demoCampaigns.map((c) => ({
      churchId: church.id,
      name: c.name,
      channel: c.channel as Channel,
      body: c.name,
      sent: c.sent,
      delivered: c.delivered,
      opened: c.opened,
      status: c.status.toLowerCase(),
      createdAt: new Date(c.date),
    })),
  });

  // Transactions (accounting)
  await db.transaction.createMany({
    data: demoAccounts.map((t) => ({
      churchId: church.id,
      description: t.description,
      category: t.category,
      fund: t.fund,
      amount: t.amount,
      date: new Date(t.date),
    })),
  });

  console.log(
    `✅ Demo church seeded: ${dbPeople.length} people, ${demoGifts.length} gifts, ${demoEvents.length} events.`,
  );
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
