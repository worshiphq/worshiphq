export const dynamic = "force-dynamic";

export async function GET() {
  return new Response("OK", { headers: { "Content-Type": "text/plain" } });
}
