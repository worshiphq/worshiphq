/**
 * The visitor's country, from the hosting platform's edge (Vercel sets x-vercel-ip-country).
 * Used only to pre-select the country code on phone fields; the visitor can always change it.
 */
export async function GET(request: Request) {
  // Vercel sets x-vercel-ip-country; behind Cloudflare (the Cloud Run copy) it is cf-ipcountry.
  const raw = request.headers.get("x-vercel-ip-country") ?? request.headers.get("cf-ipcountry") ?? "";
  const country = /^[A-Za-z]{2}$/.test(raw) ? raw.toUpperCase() : null;
  return Response.json({ country }, { headers: { "cache-control": "private, max-age=86400" } });
}
