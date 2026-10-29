import "server-only";

const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** Is this address on our own image storage (the R2 public address)? */
function isOurStorage(url: string): boolean {
  try {
    const ours = [process.env.R2_PUBLIC_URL, process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL]
      .filter(Boolean)
      .map((u) => { try { return new URL(String(u)).hostname; } catch { return ""; } });
    return url.startsWith("https://") && ours.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * The church's own logo as bytes, for the browser to draw on a canvas (posters). The image host does not send cross-site
 * permission headers, so a browser that draws the logo straight from there cannot then save the picture. Serving it from
 * our own address avoids that. Only a data URL or our own image storage is read, never anything else, and never SVG.
 */
export async function readChurchLogo(logoUrl: string | null | undefined): Promise<{ bytes: Buffer; type: string } | null> {
  if (!logoUrl) return null;
  try {
    let bytes: Buffer;
    let type: string;
    if (logoUrl.startsWith("data:")) {
      const head = logoUrl.slice(5, logoUrl.indexOf(","));
      type = head.split(";")[0].toLowerCase();
      bytes = Buffer.from(logoUrl.slice(logoUrl.indexOf(",") + 1), head.includes("base64") ? "base64" : "utf8");
    } else if (isOurStorage(logoUrl)) {
      const res = await fetch(logoUrl, { signal: AbortSignal.timeout(5000), redirect: "error" });
      if (!res.ok) return null;
      type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      bytes = Buffer.from(await res.arrayBuffer());
    } else return null;
    if (!ALLOWED.includes(type) || bytes.length === 0 || bytes.length > 5_000_000) return null;
    return { bytes, type };
  } catch {
    return null;
  }
}
