import { db } from "@/lib/db";
import { getSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * SuperAdmin only: where the server functions run, and how long one trip to the database takes from there.
 * The database is in Frankfurt (eu-central-1); a function running far from it pays that distance on every query.
 */
export async function GET(request: Request) {
  if (!(await getSuperAdmin())) return new Response("Not found", { status: 404 });
  const trips: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    await db.$queryRawUnsafe("select 1");
    trips.push(Math.round(performance.now() - t));
  }
  return Response.json({
    functionRegion: process.env.AWS_REGION ?? process.env.VERCEL_REGION ?? "unknown",
    host: process.env.NETLIFY || new URL(request.url).hostname.endsWith(".netlify.app") ? "netlify" : process.env.VERCEL ? "vercel" : "other",
    requestHost: new URL(request.url).hostname,
    databaseRegion: "eu-central-1 (Frankfurt)",
    dbRoundTripMs: trips,
  });
}
