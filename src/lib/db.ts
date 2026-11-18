import "server-only";
import { PrismaClient } from "@prisma/client";

import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Prisma talks to the database through the `pg` driver (Prisma's official driver adapter).
 *
 * Why: with Prisma's own engine, every query cost about five network round trips through the Supabase pooler.
 * The functions run in the US (Netlify us-east-1) and the database in Frankfurt, so each query took ~470 ms there
 * (measured Nov 2026 with /api/admin/region-check). The pg driver sends a query in ONE round trip: ~95 ms there,
 * and 135 ms instead of 690 ms from a PC in Ghana. Same data back, checked field by field before switching.
 *
 * Connections: each instance holds at most DB_CONNECTION_LIMIT (default 3). Through the Supabase pooler every
 * connection takes one of its client slots, and enough warm serverless instances each reserving several made the
 * pooler refuse new ones (EMAXCONN). A query waits up to 25 seconds for a free connection instead of failing.
 * Encrypted (TLS), as the engine was ("sslmode=prefer", which does not check the certificate either).
 */
function makeAdapter() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  // pgbouncer= and connection_limit= are Prisma-engine settings; the pg driver does not use them.
  const url = new URL(raw);
  for (const k of ["pgbouncer", "connection_limit", "pool_timeout", "sslmode"]) url.searchParams.delete(k);
  return new PrismaPg({
    connectionString: url.toString(),
    max: Number(process.env.DB_CONNECTION_LIMIT) || 3,
    connectionTimeoutMillis: 25_000,
    idleTimeoutMillis: 20_000,
    ssl: { rejectUnauthorized: false },
  });
}

/** Prisma client singleton (avoids exhausting connections in dev hot-reload). */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const adapter = makeAdapter();

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    // WHQ_LOG_QUERIES=1 prints every database query, to count what a page costs. Off in normal use.
    log: process.env.WHQ_LOG_QUERIES === "1" ? ["query", "error", "warn"] : process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(adapter ? { adapter } : {}),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
