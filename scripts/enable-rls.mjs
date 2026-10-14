// Turns on row level security for every table in the public schema that does not have it yet.
// Run this after adding tables with `prisma db push`:  node scripts/enable-rls.mjs
// The app connects as the table owner, which is not affected by RLS, so nothing in WorshipHQ changes. What it does is
// close the Supabase public API (PostgREST) to those tables, which is what the Supabase Security Advisor flags.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
try {
  const rows = await db.$queryRawUnsafe("select tablename from pg_tables where schemaname = 'public' and not rowsecurity order by tablename");
  for (const { tablename } of rows) {
    await db.$executeRawUnsafe(`ALTER TABLE public."${tablename}" ENABLE ROW LEVEL SECURITY`);
    console.log("RLS on:", tablename);
  }
  console.log(rows.length ? `Done. ${rows.length} table(s) secured.` : "Every table already has RLS.");
} finally {
  await db.$disconnect();
}
