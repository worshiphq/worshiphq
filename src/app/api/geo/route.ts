/**
 * The visitor's country, from the hosting platform's edge (Vercel sets x-vercel-ip-country).
 * Used only to pre-select the country code on phone fields; the visitor can always change it.
 */
export async function GET(request: Request) {
  const raw = request.headers.get("x-vercel-ip-country") ?? "";
  const country = /^[A-Za-z]{2}$/.test(raw) ? raw.toUpperCase() : null;
  return Response.json({ country }, { headers: { "cache-control": "private, no-store" } });
}
