import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { readChurchLogo } from "@/lib/church-logo";

/** The signed-in church's own logo, served from our address so the poster maker can draw it and save the result. */
export async function GET() {
  const session = await getSession();
  if (!session) return new Response("Not signed in", { status: 401 });
  const church = await db.church.findUnique({ where: { id: session.churchId }, select: { logoUrl: true } });
  const logo = await readChurchLogo(church?.logoUrl);
  if (!logo) return new Response("No logo", { status: 404 });
  return new Response(new Uint8Array(logo.bytes), {
    headers: { "Content-Type": logo.type, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
}
