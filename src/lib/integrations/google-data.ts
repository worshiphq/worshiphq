import "server-only";
import crypto from "node:crypto";
import { env } from "@/lib/env";
import { ttlCached } from "@/lib/ttl-cache";

/**
 * Read-only reports from Google Analytics 4 and Search Console for SuperAdmin > Growth.
 * Signs in as a service account (a JWT signed with its private key, no library), asks for read-only scopes only,
 * and keeps each report in memory for 6 hours so viewing the page costs almost nothing.
 */

const SIX_HOURS = 6 * 60 * 60_000;

type ServiceAccount = { client_email: string; private_key: string };

function serviceAccount(): ServiceAccount | null {
  const raw = env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const j = JSON.parse(text) as Partial<ServiceAccount>;
    if (!j.client_email || !j.private_key) return null;
    return { client_email: j.client_email, private_key: j.private_key.replace(/\\n/g, "\n") };
  } catch {
    return null;
  }
}

/** The service account's email, so the SuperAdmin page can say exactly who to give access to. */
export function serviceAccountEmail(): string | null {
  return serviceAccount()?.client_email ?? null;
}

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");

async function accessToken(scope: string): Promise<string> {
  return ttlCached(`google-token:${scope}`, 50 * 60_000, async () => {
    const sa = serviceAccount();
    if (!sa) throw new Error("not-configured");
    const now = Math.floor(Date.now() / 1000);
    const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = b64url(JSON.stringify({ iss: sa.client_email, scope, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
    const sig = crypto.createSign("RSA-SHA256").update(`${head}.${claims}`).sign(sa.private_key).toString("base64url");
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claims}.${sig}` }),
      cache: "no-store",
    });
    const j = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
    if (!res.ok || !j.access_token) throw new Error(`token: ${j.error ?? res.status}`);
    return j.access_token;
  });
}

async function googlePost<T>(url: string, scope: string, body: unknown): Promise<T> {
  const token = await accessToken(scope);
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const j = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; status?: string } };
  if (!res.ok) throw new Error(j.error?.status === "PERMISSION_DENIED" ? "no-access" : (j.error?.message ?? `HTTP ${res.status}`).slice(0, 160));
  return j;
}

export type Result<T> = { ok: true; data: T } | { ok: false; reason: "not-configured" | "no-access" | "error"; message?: string };

async function safe<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    const m = (e as Error).message;
    if (m === "not-configured") return { ok: false, reason: "not-configured" };
    if (m === "no-access") return { ok: false, reason: "no-access" };
    return { ok: false, reason: "error", message: m };
  }
}

// ── Google Analytics 4 ────────────────────────────────────────────────────────

type GaRow = { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] };
type GaResponse = { rows?: GaRow[] };

export type Ga4Report = {
  totals: { users: number; newUsers: number; sessions: number; views: number; signUpViews: number };
  prevTotals: { users: number; sessions: number };
  daily: { date: string; users: number; sessions: number }[];
  pages: { path: string; views: number; users: number }[];
  sources: { channel: string; source: string; sessions: number; users: number }[];
  places: { country: string; city: string; users: number }[];
  devices: { device: string; users: number }[];
};

const num = (v?: string) => Number(v ?? 0) || 0;

export function getGa4Report(): Promise<Result<Ga4Report>> {
  return safe(() =>
    ttlCached("ga4-report", SIX_HOURS, async () => {
      // The property number is not secret; the setting can point it elsewhere.
      const property = (env.GA4_PROPERTY_ID ?? "564977197").replace(/\D/g, "");
      if (!property || !serviceAccount()) throw new Error("not-configured");
      const url = `https://analyticsdata.googleapis.com/v1beta/properties/${property}:batchRunReports`;
      const scope = "https://www.googleapis.com/auth/analytics.readonly";
      const last28 = [{ startDate: "28daysAgo", endDate: "yesterday" }];
      const res = await googlePost<{ reports?: GaResponse[] }>(url, scope, {
        requests: [
          { dateRanges: [{ startDate: "28daysAgo", endDate: "yesterday" }, { startDate: "56daysAgo", endDate: "29daysAgo" }], metrics: [{ name: "totalUsers" }, { name: "newUsers" }, { name: "sessions" }, { name: "screenPageViews" }] },
          { dateRanges: last28, dimensions: [{ name: "date" }], metrics: [{ name: "totalUsers" }, { name: "sessions" }], orderBys: [{ dimension: { dimensionName: "date" } }] },
          { dateRanges: last28, dimensions: [{ name: "pagePath" }], metrics: [{ name: "screenPageViews" }, { name: "totalUsers" }], orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }], limit: 15 },
          { dateRanges: last28, dimensions: [{ name: "sessionDefaultChannelGroup" }, { name: "sessionSource" }], metrics: [{ name: "sessions" }, { name: "totalUsers" }], orderBys: [{ metric: { metricName: "sessions" }, desc: true }], limit: 15 },
          { dateRanges: last28, dimensions: [{ name: "country" }, { name: "city" }], metrics: [{ name: "totalUsers" }], orderBys: [{ metric: { metricName: "totalUsers" }, desc: true }], limit: 15 },
        ],
      });
      const [tot, daily, pages, sources, places] = res.reports ?? [];
      // Two date ranges in one request: GA adds a "date_range_N" dimension to tell the rows apart.
      const rangeRow = (i: number) => tot?.rows?.find((r) => r.dimensionValues?.[0]?.value === `date_range_${i}`) ?? (i === 0 ? tot?.rows?.[0] : undefined);
      const cur = rangeRow(0)?.metricValues ?? [];
      const prev = rangeRow(1)?.metricValues ?? [];
      const signUpViews = (pages?.rows ?? []).filter((r) => (r.dimensionValues?.[0]?.value ?? "").startsWith("/sign-up")).reduce((s, r) => s + num(r.metricValues?.[0]?.value), 0);
      const devicesRes = await googlePost<GaResponse>(`https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`, scope, {
        dateRanges: last28, dimensions: [{ name: "deviceCategory" }], metrics: [{ name: "totalUsers" }],
      });
      return {
        totals: { users: num(cur[0]?.value), newUsers: num(cur[1]?.value), sessions: num(cur[2]?.value), views: num(cur[3]?.value), signUpViews },
        prevTotals: { users: num(prev[0]?.value), sessions: num(prev[2]?.value) },
        daily: (daily?.rows ?? []).map((r) => ({ date: r.dimensionValues?.[0]?.value ?? "", users: num(r.metricValues?.[0]?.value), sessions: num(r.metricValues?.[1]?.value) })),
        pages: (pages?.rows ?? []).map((r) => ({ path: r.dimensionValues?.[0]?.value ?? "", views: num(r.metricValues?.[0]?.value), users: num(r.metricValues?.[1]?.value) })),
        sources: (sources?.rows ?? []).map((r) => ({ channel: r.dimensionValues?.[0]?.value ?? "", source: r.dimensionValues?.[1]?.value ?? "", sessions: num(r.metricValues?.[0]?.value), users: num(r.metricValues?.[1]?.value) })),
        places: (places?.rows ?? []).map((r) => ({ country: r.dimensionValues?.[0]?.value ?? "", city: r.dimensionValues?.[1]?.value ?? "", users: num(r.metricValues?.[0]?.value) })),
        devices: (devicesRes.rows ?? []).map((r) => ({ device: r.dimensionValues?.[0]?.value ?? "", users: num(r.metricValues?.[0]?.value) })),
      };
    }),
  );
}

// ── Search Console ────────────────────────────────────────────────────────────

type GscRow = { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number };

export type SearchReport = {
  totals: { clicks: number; impressions: number; ctr: number; position: number };
  daily: { date: string; clicks: number; impressions: number }[];
  queries: { query: string; clicks: number; impressions: number; position: number }[];
  pages: { page: string; clicks: number; impressions: number; position: number }[];
  countries: { country: string; clicks: number; impressions: number }[];
};

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export function getSearchReport(): Promise<Result<SearchReport>> {
  return safe(() =>
    ttlCached("gsc-report", SIX_HOURS, async () => {
      if (!serviceAccount()) throw new Error("not-configured");
      const site = env.GSC_SITE ?? "sc-domain:worshiphq.app";
      const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`;
      const scope = "https://www.googleapis.com/auth/webmasters.readonly";
      // Search data arrives about 2 days late, so the window ends 2 days ago.
      const end = new Date(Date.now() - 2 * 86_400_000);
      const start = new Date(end.getTime() - 27 * 86_400_000);
      const base = { startDate: ymd(start), endDate: ymd(end) };
      const q = (dimensions: string[], rowLimit: number) => googlePost<{ rows?: GscRow[] }>(url, scope, { ...base, dimensions, rowLimit });
      const [total, daily, queries, pages, countries] = await Promise.all([q([], 1), q(["date"], 40), q(["query"], 25), q(["page"], 15), q(["country"], 10)]);
      const t = total.rows?.[0];
      return {
        totals: { clicks: t?.clicks ?? 0, impressions: t?.impressions ?? 0, ctr: t?.ctr ?? 0, position: t?.position ?? 0 },
        daily: (daily.rows ?? []).map((r) => ({ date: r.keys?.[0] ?? "", clicks: r.clicks ?? 0, impressions: r.impressions ?? 0 })),
        queries: (queries.rows ?? []).map((r) => ({ query: r.keys?.[0] ?? "", clicks: r.clicks ?? 0, impressions: r.impressions ?? 0, position: r.position ?? 0 })),
        pages: (pages.rows ?? []).map((r) => ({ page: (r.keys?.[0] ?? "").replace(/^https?:\/\/[^/]+/, "") || "/", clicks: r.clicks ?? 0, impressions: r.impressions ?? 0, position: r.position ?? 0 })),
        countries: (countries.rows ?? []).map((r) => ({ country: (r.keys?.[0] ?? "").toUpperCase(), clicks: r.clicks ?? 0, impressions: r.impressions ?? 0 })),
      };
    }),
  );
}
