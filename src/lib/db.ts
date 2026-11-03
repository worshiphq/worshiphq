import "server-only";
import { PrismaClient } from "@prisma/client";

/**
 * Cap the connections one instance may hold.
 *
 * Through the Supabase pooler every connection Prisma opens takes one of the pooler's 200 client
 * slots, and Prisma's own default is `cpus * 2 + 1` - so each warm serverless instance quietly
 * reserved three to five slots whether it used them or not. Enough warm instances and the pooler
 * starts refusing new ones with EMAXCONN, which a cold start sees as a 500.
 *
 * Three is the compromise: well under the old default, but still enough parallelism for the
 * scheduled job, which works on several churches at once. `pool_timeout` is raised to match, so a
 * query that has to wait its turn behind that job queues instead of failing. Tune with
 * DB_CONNECTION_LIMIT if the pooler ever runs hot again.
 *
 * Only applied to a pooled URL (`pgbouncer=true`), and never overrides a limit already set there.
 */
function connectionUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw || !raw.includes("pgbouncer=true") || raw.includes("connection_limit=")) return undefined;
  const limit = Number(process.env.DB_CONNECTION_LIMIT) || 3;
  const sep = raw.includes("?") ? "&" : "?";
  return `${raw}${sep}connection_limit=${limit}&pool_timeout=25`;
}

/** Prisma client singleton (avoids exhausting connections in dev hot-reload). */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const url = connectionUrl();

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(url ? { datasources: { db: { url } } } : {}),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
